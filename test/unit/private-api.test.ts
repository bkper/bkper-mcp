import { describe, expect, it } from 'bun:test';

import { BKPER_MCP_AGENT_ID, type Env } from '../../src/bkper-factory.js';
import {
    BkperPrivateApiClient,
    type AuthenticatedHttpClient,
    type GoogleAuthFactory,
    type GoogleAuthOptions,
} from '../../src/private-api.js';

function createEnv(overrides: Partial<Env> = {}): Env {
    return {
        API_DOMAIN: 'api-dev.bkper.app',
        GOOGLE_SERVICE_ACCOUNT_KEY: JSON.stringify({
            client_email: 'service@example.iam.gserviceaccount.com',
            private_key: 'private-key',
        }),
        SESSIONS: {} as KVNamespace,
        OAUTH_KV: {} as KVNamespace,
        OAUTH_PROVIDER: {},
        ...overrides,
    };
}

describe('Bkper private API client', () => {
    it('refreshes a user token through the Private API using service account auth', async () => {
        let capturedAuthOptions: GoogleAuthOptions | null = null;
        let capturedRequest: Parameters<AuthenticatedHttpClient['request']>[0] | null = null;

        const authFactory: GoogleAuthFactory = (options) => {
            capturedAuthOptions = options;
            return {
                async getClient(): Promise<AuthenticatedHttpClient> {
                    return {
                        async request<T>(request: Parameters<AuthenticatedHttpClient['request']>[0]) {
                            capturedRequest = request;
                            return {
                                data: {
                                    userId: 'user_123',
                                    accessToken: 'token_abc',
                                } as T,
                            };
                        },
                    };
                },
            };
        };

        const client = new BkperPrivateApiClient(createEnv(), authFactory);

        const token = await client.refreshAccessToken('user_123');

        expect(token).toEqual({ userId: 'user_123', accessToken: 'token_abc' });
        expect(capturedAuthOptions).toEqual({
            credentials: {
                client_email: 'service@example.iam.gserviceaccount.com',
                private_key: 'private-key',
            },
            scopes: ['https://www.googleapis.com/auth/userinfo.email'],
        });
        expect(capturedRequest).toEqual({
            url: 'https://api-dev.bkper.app/_ah/api/bkperpvt/v5/oauth/refresh',
            method: 'POST',
            headers: {
                'bkper-agent-id': BKPER_MCP_AGENT_ID,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId: 'user_123' }),
        });
    });

    it('uses http for local Private API calls', async () => {
        let capturedUrl: string | null = null;
        const authFactory: GoogleAuthFactory = () => ({
            async getClient(): Promise<AuthenticatedHttpClient> {
                return {
                    async request<T>(request: Parameters<AuthenticatedHttpClient['request']>[0]) {
                        capturedUrl = request.url;
                        return { data: { userId: 'user_123', accessToken: 'token_abc' } as T };
                    },
                };
            },
        });

        const client = new BkperPrivateApiClient(
            createEnv({ ENVIRONMENT: 'local', API_DOMAIN: 'localhost:8080' }),
            authFactory
        );

        await client.refreshAccessToken('user_123');

        expect(capturedUrl).toBe('http://localhost:8080/_ah/api/bkperpvt/v5/oauth/refresh');
    });

    it('rejects missing user ids before calling Private API', async () => {
        let authFactoryCalled = false;
        const authFactory: GoogleAuthFactory = () => {
            authFactoryCalled = true;
            throw new Error('should not build auth client');
        };

        const client = new BkperPrivateApiClient(createEnv(), authFactory);

        await expect(client.refreshAccessToken('')).rejects.toThrow('userId is required');
        expect(authFactoryCalled).toBe(false);
    });
});
