import type { AuthRequest, ClientInfo, OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { renderConsentPage } from './consent-page.js';
import { getAuthenticatedSession, type EnvironmentBinding, type SessionStore } from './session.js';

const BKPER_MCP_APP_ID = 'bkper-mcp';
const CONSENT_COOKIE_NAME = '__Host-bkper_mcp_csrf';
const CONSENT_TTL_SECONDS = 10 * 60;

export interface AuthorizeEnv extends EnvironmentBinding {
    SESSIONS: SessionStore;
    OAUTH_PROVIDER: Pick<OAuthHelpers, 'parseAuthRequest' | 'lookupClient' | 'completeAuthorization'>;
}

interface ConsentChallenge {
    csrfToken: string;
    oauthRequest: NormalizedAuthRequest;
    expiresAt: number;
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

type ConsentApproval =
    | { approved: true; clearCookie: string }
    | { approved: false; reason: string };

export async function handleAuthorizeRequest(request: Request, env: AuthorizeEnv): Promise<Response> {
    const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    const session = await getAuthenticatedSession(request.headers.get('Cookie'), env, env.SESSIONS);

    if (!session) {
        return Response.redirect(buildLoginUrl(request.url, env), 302);
    }

    const clientInfo = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
    const approval = await validateConsentApproval(request, oauthRequest);

    if (!approval.approved) {
        if (request.method === 'POST') {
            console.warn(`MCP consent approval rejected: ${approval.reason}`);
        }

        const challenge = createConsentChallenge(oauthRequest);
        return renderConsentPage({
            requestUrl: request.url,
            clientInfo,
            csrfToken: challenge.csrfToken,
            consentCookie: buildConsentCookie(challenge),
            redirectUri: oauthRequest.redirectUri,
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

    return new Response(null, {
        status: 302,
        headers: {
            Location: redirectTo,
            'Set-Cookie': approval.clearCookie,
        },
    });
}

async function validateConsentApproval(
    request: Request,
    oauthRequest: AuthRequest
): Promise<ConsentApproval> {
    if (request.method !== 'POST') {
        return { approved: false, reason: 'not_post' };
    }

    const url = new URL(request.url);
    if (url.searchParams.get('approve') !== '1') {
        return { approved: false, reason: 'missing_approve' };
    }

    const formData = await readFormData(request);
    if (!formData) {
        return { approved: false, reason: 'invalid_form' };
    }

    const csrfToken = formData.get('csrf_token');
    if (typeof csrfToken !== 'string' || csrfToken.length === 0) {
        return { approved: false, reason: 'missing_csrf_token' };
    }

    const challengeCookie = getCookieValue(request.headers.get('Cookie'), CONSENT_COOKIE_NAME);
    if (!challengeCookie) {
        return { approved: false, reason: 'missing_csrf_cookie' };
    }

    const challenge = parseConsentChallenge(challengeCookie);
    if (!challenge) {
        return { approved: false, reason: 'invalid_csrf_cookie' };
    }

    if (challenge.expiresAt < Date.now()) {
        return { approved: false, reason: 'expired_csrf_cookie' };
    }

    if (challenge.csrfToken !== csrfToken) {
        return { approved: false, reason: 'csrf_mismatch' };
    }

    if (!areAuthRequestsEqual(challenge.oauthRequest, normalizeAuthRequest(oauthRequest))) {
        return { approved: false, reason: 'oauth_request_mismatch' };
    }

    return { approved: true, clearCookie: buildClearConsentCookie() };
}

async function readFormData(request: Request): Promise<FormData | null> {
    try {
        return await request.formData();
    } catch {
        return null;
    }
}

function createConsentChallenge(oauthRequest: AuthRequest): ConsentChallenge {
    return {
        csrfToken: crypto.randomUUID(),
        oauthRequest: normalizeAuthRequest(oauthRequest),
        expiresAt: Date.now() + CONSENT_TTL_SECONDS * 1000,
    };
}

function buildConsentCookie(challenge: ConsentChallenge): string {
    return `${CONSENT_COOKIE_NAME}=${encodeCookieJson(challenge)}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${CONSENT_TTL_SECONDS}`;
}

function buildClearConsentCookie(): string {
    return `${CONSENT_COOKIE_NAME}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`;
}

function parseConsentChallenge(value: string): ConsentChallenge | null {
    const decoded = decodeCookieJson(value);
    if (!decoded) {
        return null;
    }

    try {
        const parsed = JSON.parse(decoded) as unknown;
        if (!isConsentChallenge(parsed)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function isConsentChallenge(value: unknown): value is ConsentChallenge {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const record = value as Record<string, unknown>;
    return typeof record.csrfToken === 'string'
        && record.csrfToken.length > 0
        && typeof record.expiresAt === 'number'
        && Number.isFinite(record.expiresAt)
        && isNormalizedAuthRequest(record.oauthRequest);
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
    if (!cookieHeader) {
        return null;
    }

    const cookies = cookieHeader.split(';').map(cookie => cookie.trim());
    for (const cookie of cookies) {
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex < 0) {
            continue;
        }

        const cookieName = cookie.slice(0, separatorIndex);
        if (cookieName === name) {
            return cookie.slice(separatorIndex + 1) || null;
        }
    }

    return null;
}

function encodeCookieJson(value: ConsentChallenge): string {
    const json = JSON.stringify(value);
    const bytes = new TextEncoder().encode(json);
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCookieJson(value: string): string | null {
    try {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        return new TextDecoder().decode(bytes);
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

function getClientDisplayName(clientInfo: ClientInfo | null, fallback: string): string {
    return clientInfo?.clientName || clientInfo?.clientUri || fallback;
}
