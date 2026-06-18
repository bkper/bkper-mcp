import type { OAuthProviderOptions } from '@cloudflare/workers-oauth-provider';

import type { Env } from './bkper-factory.js';

export type HandlerWithFetch = ExportedHandler<Env> & {
    fetch: NonNullable<ExportedHandler<Env>['fetch']>;
};

export interface OAuthProviderHandlers {
    defaultHandler: HandlerWithFetch;
    apiHandler: HandlerWithFetch;
}

export function createOAuthProviderOptions(handlers: OAuthProviderHandlers): OAuthProviderOptions<Env> {
    return {
        apiRoute: ['/mcp'],
        apiHandler: handlers.apiHandler,
        defaultHandler: handlers.defaultHandler,
        authorizeEndpoint: '/authorize',
        tokenEndpoint: '/token',
        clientRegistrationEndpoint: '/register',
        accessTokenTTL: 60 * 60,
        refreshTokenTTL: 30 * 24 * 60 * 60,
        allowImplicitFlow: false,
        allowPlainPKCE: false,
        resourceMetadata: {
            resource_name: 'Bkper MCP',
        },
    };
}
