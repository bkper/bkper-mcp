import type { AuthRequest, ClientInfo, OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { renderConsentPage } from './consent-page.js';
import { getAuthenticatedSession, type EnvironmentBinding, type SessionStore } from './session.js';

const BKPER_MCP_APP_ID = 'bkper-mcp';
const CONSENT_PREFIX = 'mcp-consent:';
const CONSENT_TTL_SECONDS = 10 * 60;

interface ConsentStore extends SessionStore {
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

export interface AuthorizeEnv extends EnvironmentBinding {
    SESSIONS: ConsentStore;
    OAUTH_PROVIDER: Pick<OAuthHelpers, 'parseAuthRequest' | 'lookupClient' | 'completeAuthorization'>;
}

interface StoredConsent {
    sessionId: string;
    oauthRequest: NormalizedAuthRequest;
}

interface NormalizedAuthRequest {
    responseType: string;
    clientId: string;
    redirectUri: string;
    scope: string[];
    state: string;
    codeChallenge: string | null;
    codeChallengeMethod: string | null;
    resource: string | string[] | null;
}

export async function handleAuthorizeRequest(request: Request, env: AuthorizeEnv): Promise<Response> {
    const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    const session = await getAuthenticatedSession(request.headers.get('Cookie'), env, env.SESSIONS);

    if (!session) {
        return Response.redirect(buildLoginUrl(request.url, env), 302);
    }

    const clientInfo = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);

    if (!await isApproved(request, env, session.sessionId, oauthRequest)) {
        const consentNonce = await storeConsent(env, session.sessionId, oauthRequest);
        return renderConsentPage({
            requestUrl: request.url,
            clientInfo,
            consentNonce,
        });
    }

    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthRequest,
        userId: session.userId,
        metadata: {
            appId: BKPER_MCP_APP_ID,
            clientId: oauthRequest.clientId,
            clientName: getClientDisplayName(clientInfo, oauthRequest.clientId),
            authorizedAt: new Date().toISOString(),
        },
        scope: [],
        props: {
            userId: session.userId,
        },
    });

    return Response.redirect(redirectTo, 302);
}

async function isApproved(
    request: Request,
    env: AuthorizeEnv,
    sessionId: string,
    oauthRequest: AuthRequest
): Promise<boolean> {
    if (request.method !== 'POST') {
        return false;
    }

    const url = new URL(request.url);
    if (url.searchParams.get('approve') !== '1') {
        return false;
    }

    const nonce = await readConsentNonce(request);
    if (!nonce) {
        return false;
    }

    const consentKey = getConsentKey(sessionId, nonce);
    const storedConsentString = await env.SESSIONS.get(consentKey);
    await env.SESSIONS.delete(consentKey);

    if (!storedConsentString) {
        return false;
    }

    const storedConsent = parseStoredConsent(storedConsentString);
    if (!storedConsent) {
        return false;
    }

    return storedConsent.sessionId === sessionId
        && areAuthRequestsEqual(storedConsent.oauthRequest, normalizeAuthRequest(oauthRequest));
}

async function readConsentNonce(request: Request): Promise<string | null> {
    try {
        const formData = await request.formData();
        const nonce = formData.get('consent_nonce');
        return typeof nonce === 'string' && nonce.length > 0 ? nonce : null;
    } catch {
        return null;
    }
}

async function storeConsent(env: AuthorizeEnv, sessionId: string, oauthRequest: AuthRequest): Promise<string> {
    const consentNonce = crypto.randomUUID();
    const storedConsent: StoredConsent = {
        sessionId,
        oauthRequest: normalizeAuthRequest(oauthRequest),
    };

    await env.SESSIONS.put(getConsentKey(sessionId, consentNonce), JSON.stringify(storedConsent), {
        expirationTtl: CONSENT_TTL_SECONDS,
    });

    return consentNonce;
}

function parseStoredConsent(value: string): StoredConsent | null {
    try {
        const parsed = JSON.parse(value) as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const record = parsed as Record<string, unknown>;
        if (typeof record.sessionId !== 'string' || !isNormalizedAuthRequest(record.oauthRequest)) {
            return null;
        }

        return {
            sessionId: record.sessionId,
            oauthRequest: record.oauthRequest,
        };
    } catch {
        return null;
    }
}

function isNormalizedAuthRequest(value: unknown): value is NormalizedAuthRequest {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const record = value as Record<string, unknown>;
    return typeof record.responseType === 'string'
        && typeof record.clientId === 'string'
        && typeof record.redirectUri === 'string'
        && Array.isArray(record.scope)
        && record.scope.every(scope => typeof scope === 'string')
        && typeof record.state === 'string'
        && (typeof record.codeChallenge === 'string' || record.codeChallenge === null)
        && (typeof record.codeChallengeMethod === 'string' || record.codeChallengeMethod === null)
        && isNormalizedResource(record.resource);
}

function isNormalizedResource(value: unknown): value is string | string[] | null {
    return typeof value === 'string'
        || value === null
        || (Array.isArray(value) && value.every(item => typeof item === 'string'));
}

function normalizeAuthRequest(oauthRequest: AuthRequest): NormalizedAuthRequest {
    return {
        responseType: oauthRequest.responseType,
        clientId: oauthRequest.clientId,
        redirectUri: oauthRequest.redirectUri,
        scope: oauthRequest.scope,
        state: oauthRequest.state,
        codeChallenge: oauthRequest.codeChallenge ?? null,
        codeChallengeMethod: oauthRequest.codeChallengeMethod ?? null,
        resource: oauthRequest.resource ?? null,
    };
}

function areAuthRequestsEqual(left: NormalizedAuthRequest, right: NormalizedAuthRequest): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function buildLoginUrl(returnUrl: string, env: EnvironmentBinding): string {
    const loginUrl = new URL('/auth/login', getRootBkperAppUrl(env));
    loginUrl.searchParams.set('returnUrl', returnUrl);
    return loginUrl.toString();
}

function getRootBkperAppUrl(env: EnvironmentBinding): string {
    if (env.ENVIRONMENT === 'local') {
        return 'http://localhost:8080';
    }
    if (env.ENVIRONMENT === 'dev') {
        return 'https://dev.bkper.app';
    }
    return 'https://bkper.app';
}

function getConsentKey(sessionId: string, nonce: string): string {
    return `${CONSENT_PREFIX}${sessionId}:${nonce}`;
}

function getClientDisplayName(clientInfo: ClientInfo | null, fallback: string): string {
    return clientInfo?.clientName || clientInfo?.clientUri || fallback;
}
