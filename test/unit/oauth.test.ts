import { describe, expect, it } from 'bun:test';

import { createOAuthProviderOptions, type HandlerWithFetch } from '../../src/oauth.js';

const handler: HandlerWithFetch = {
    async fetch(): Promise<Response> {
        return new Response('ok');
    },
};

function createOptions() {
    return createOAuthProviderOptions({
        defaultHandler: handler,
        apiHandler: handler,
    });
}

describe('OAuth provider configuration', () => {
    it('protects the MCP endpoint and exposes standard OAuth endpoints', () => {
        const options = createOptions();

        expect(options.apiRoute).toEqual(['/mcp']);
        expect(options.authorizeEndpoint).toBe('/authorize');
        expect(options.tokenEndpoint).toBe('/token');
        expect(options.clientRegistrationEndpoint).toBe('/register');
    });

    it('uses CLI-like token lifetimes from the design', () => {
        const options = createOptions();

        expect(options.accessTokenTTL).toBe(60 * 60);
        expect(options.refreshTokenTTL).toBe(30 * 24 * 60 * 60);
    });

    it('uses broad act-as-me authorization without advertising fake granular scopes', () => {
        const options = createOptions();

        expect(options.scopesSupported).toBeUndefined();
        expect(options.allowImplicitFlow).toBe(false);
        expect(options.allowPlainPKCE).toBe(false);
    });
});
