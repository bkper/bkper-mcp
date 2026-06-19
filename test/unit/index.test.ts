import { describe, expect, it } from 'bun:test';

import { createMcpApiHandler, defaultHandler } from '../../src/handlers.js';
import type { Env } from '../../src/bkper-factory.js';

function createEnv(): Env {
    return {
        API_DOMAIN: 'api-dev.bkper.app',
        GOOGLE_SERVICE_ACCOUNT_KEY: '{}',
        SESSIONS: {} as KVNamespace,
        OAUTH_KV: {} as KVNamespace,
        OAUTH_PROVIDER: {},
    };
}

function createExecutionContext(): ExecutionContext {
    return {
        waitUntil() {},
        passThroughOnException() {},
        props: {},
    };
}

describe('Worker routes', () => {
    it('does not expose unauthenticated MCP tool metadata outside OAuth', async () => {
        const response = await defaultHandler.fetch(
            new Request('https://mcp.bkper.app/tools'),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(404);
    });

    it('does not log token refresh exception details', async () => {
        const originalError = console.error;
        const errorCalls: unknown[][] = [];
        console.error = (...args: unknown[]) => {
            errorCalls.push(args);
        };

        try {
            const handler = createMcpApiHandler({
                async getAccessTokenForGrant(): Promise<string | null> {
                    throw new Error('secret-token-value');
                },
            });

            const response = await handler.fetch(
                new Request('https://mcp.bkper.app/mcp'),
                createEnv(),
                createExecutionContext(),
            );

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({ error: 'token_refresh_failed' });
            expect(errorCalls).toHaveLength(1);
            expect(errorCalls[0]).toHaveLength(1);
            expect(JSON.stringify(errorCalls)).not.toContain('secret-token-value');
        } finally {
            console.error = originalError;
        }
    });

    it('returns 401 when OAuth grant props do not identify a user', async () => {
        const handler = createMcpApiHandler({
            async getAccessTokenForGrant(): Promise<string | null> {
                return null;
            },
        });

        const response = await handler.fetch(
            new Request('https://mcp.bkper.app/mcp'),
            createEnv(),
            createExecutionContext(),
        );

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'invalid_grant_props' });
    });
});
