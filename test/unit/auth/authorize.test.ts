import { describe, expect, it } from 'bun:test';
import type { AuthRequest, ClientInfo, CompleteAuthorizationOptions, OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { handleAuthorizeRequest, type AuthorizeEnv } from '../../../src/auth/authorize.js';
import type { SessionStore } from '../../../src/auth/session.js';

class MemorySessionStore implements SessionStore {
    private readonly records = new Map<string, string>();

    set(key: string, value: string): void {
        this.records.set(key, value);
    }

    async get(key: string): Promise<string | null> {
        return this.records.get(key) ?? null;
    }

    async put(key: string, value: string): Promise<void> {
        this.records.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.records.delete(key);
    }
}

class FakeOAuthHelpers implements Pick<OAuthHelpers, 'parseAuthRequest' | 'lookupClient' | 'completeAuthorization'> {
    completedAuthorization: CompleteAuthorizationOptions | null = null;

    async parseAuthRequest(request: Request): Promise<AuthRequest> {
        const url = new URL(request.url);
        return {
            responseType: 'code',
            clientId: url.searchParams.get('client_id') ?? 'client-123',
            redirectUri: url.searchParams.get('redirect_uri') ?? 'https://assistant.example/callback',
            scope: ['fake.scope'],
            state: url.searchParams.get('state') ?? 'state-123',
            codeChallenge: 'challenge-123',
            codeChallengeMethod: 'S256',
            resource: 'https://mcp.bkper.app/mcp',
        };
    }

    async lookupClient(clientId: string): Promise<ClientInfo | null> {
        return {
            clientId,
            clientName: 'Trusted Assistant',
            redirectUris: ['https://assistant.example/callback'],
            tokenEndpointAuthMethod: 'none',
        };
    }

    async completeAuthorization(options: CompleteAuthorizationOptions): Promise<{ redirectTo: string }> {
        this.completedAuthorization = options;
        return { redirectTo: 'https://assistant.example/callback?code=code-123&state=state-123' };
    }
}

function createEnv(store: MemorySessionStore, oauth: FakeOAuthHelpers): AuthorizeEnv {
    return {
        ENVIRONMENT: 'prod',
        SESSIONS: store,
        OAUTH_PROVIDER: oauth,
    };
}

async function renderConsent(
    store: MemorySessionStore,
    oauth = new FakeOAuthHelpers(),
    requestUrl = 'https://mcp.bkper.app/authorize?client_id=client-123'
): Promise<{ response: Response; html: string; env: AuthorizeEnv; oauth: FakeOAuthHelpers }> {
    store.set('session:session-123', JSON.stringify({ userId: 'user-123' }));
    const env = createEnv(store, oauth);
    const response = await handleAuthorizeRequest(
        new Request(requestUrl, {
            headers: { Cookie: 'bkper_session=session-123' },
        }),
        env
    );

    return { response, html: await response.text(), env, oauth };
}

function extractConsentNonce(html: string): string {
    const match = html.match(/name="consent_nonce" value="([^"]+)"/);
    if (!match) {
        throw new Error('Consent nonce not found');
    }
    return match[1];
}

function extractFormAction(html: string): string {
    const match = html.match(/<form[^>]+action="([^"]+)"/);
    if (!match) {
        throw new Error('Form action not found');
    }
    return match[1].replace(/&amp;/g, '&');
}

function createApprovalRequest(nonce: string, requestUrl = 'https://mcp.bkper.app/authorize?client_id=client-123&approve=1'): Request {
    return new Request(requestUrl, {
        method: 'POST',
        headers: {
            Cookie: 'bkper_session=session-123',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ consent_nonce: nonce }),
    });
}

describe('authorize route', () => {
    it('redirects unauthenticated users to the existing Bkper login flow', async () => {
        const response = await handleAuthorizeRequest(
            new Request('https://mcp.bkper.app/authorize?client_id=client-123'),
            createEnv(new MemorySessionStore(), new FakeOAuthHelpers())
        );

        expect(response.status).toBe(302);
        const location = response.headers.get('Location');
        expect(location).not.toBeNull();
        const redirectUrl = new URL(location ?? 'https://invalid.example');
        expect(`${redirectUrl.origin}${redirectUrl.pathname}`).toBe('https://bkper.app/auth/login');
        expect(redirectUrl.searchParams.get('returnUrl')).toBe('https://mcp.bkper.app/authorize?client_id=client-123');
    });

    it('renders broad consent with security headers before completing authorization', async () => {
        const { response, html } = await renderConsent(new MemorySessionStore());

        expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
        expect(response.headers.get('X-Frame-Options')).toBe('DENY');
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(html).toContain('Connect Bkper MCP');
        expect(html).toContain('Trusted Assistant');
        expect(html).toContain('read and change data');
        expect(html).toContain('method="post"');
        expect(html).toContain('name="consent_nonce"');
    });

    it('keeps consent nonce out of the approval URL', async () => {
        const { html } = await renderConsent(new MemorySessionStore());
        const action = new URL(extractFormAction(html));

        expect(action.searchParams.get('approve')).toBe('1');
        expect(action.searchParams.has('consent_nonce')).toBe(false);
    });

    it('does not complete authorization from a GET approval URL', async () => {
        const store = new MemorySessionStore();
        const oauth = new FakeOAuthHelpers();
        store.set('session:session-123', JSON.stringify({ userId: 'user-123' }));

        const response = await handleAuthorizeRequest(
            new Request('https://mcp.bkper.app/authorize?client_id=client-123&approve=1', {
                headers: { Cookie: 'bkper_session=session-123' },
            }),
            createEnv(store, oauth)
        );

        expect(response.status).toBe(200);
        expect(oauth.completedAuthorization).toBeNull();
    });

    it('does not complete authorization if the posted consent nonce is bound to a different OAuth request', async () => {
        const store = new MemorySessionStore();
        const oauth = new FakeOAuthHelpers();
        const { html, env } = await renderConsent(store, oauth);
        const nonce = extractConsentNonce(html);

        const response = await handleAuthorizeRequest(
            createApprovalRequest(nonce, 'https://mcp.bkper.app/authorize?client_id=client-456&approve=1'),
            env
        );

        expect(response.status).toBe(200);
        expect(oauth.completedAuthorization).toBeNull();
    });

    it('completes authorization with trusted server-side userId props after consent POST', async () => {
        const store = new MemorySessionStore();
        const oauth = new FakeOAuthHelpers();
        const { html, env } = await renderConsent(store, oauth);
        const nonce = extractConsentNonce(html);

        const response = await handleAuthorizeRequest(createApprovalRequest(nonce), env);

        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://assistant.example/callback?code=code-123&state=state-123');
        expect(oauth.completedAuthorization?.userId).toBe('user-123');
        expect(oauth.completedAuthorization?.scope).toEqual([]);
        expect(oauth.completedAuthorization?.props).toEqual({ userId: 'user-123' });
        expect(oauth.completedAuthorization?.metadata).toMatchObject({ appId: 'bkper-mcp', clientId: 'client-123' });
    });
});
