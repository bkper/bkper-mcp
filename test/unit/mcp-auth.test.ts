import { describe, expect, it } from 'bun:test';

import type { Env } from '../../src/bkper-factory.js';
import { getMcpAccessTokenForGrant, getMcpGrantProps } from '../../src/mcp-auth.js';

function createEnv(): Env {
    return {
        API_DOMAIN: 'api-dev.bkper.app',
        GOOGLE_SERVICE_ACCOUNT_KEY: '{}',
        SESSIONS: {} as KVNamespace,
        OAUTH_KV: {} as KVNamespace,
        OAUTH_PROVIDER: {},
    };
}

function createExecutionContextWithProps(props?: unknown): ExecutionContext {
    return { props } as unknown as ExecutionContext;
}

describe('MCP grant authentication', () => {
    it('loads the trusted userId only from OAuth grant props', () => {
        expect(getMcpGrantProps(createExecutionContextWithProps({ userId: 'trusted-user' }))).toEqual({
            userId: 'trusted-user',
        });
    });

    it('rejects missing or invalid grant props', () => {
        expect(getMcpGrantProps(createExecutionContextWithProps())).toBeNull();
        expect(getMcpGrantProps(createExecutionContextWithProps({}))).toBeNull();
        expect(getMcpGrantProps(createExecutionContextWithProps({ userId: '' }))).toBeNull();
        expect(getMcpGrantProps(createExecutionContextWithProps({ userId: 123 }))).toBeNull();
    });

    it('refreshes a Bkper OAuth token using the trusted grant userId', async () => {
        const refreshedForUsers: string[] = [];

        const accessToken = await getMcpAccessTokenForGrant(
            createEnv(),
            createExecutionContextWithProps({ userId: 'trusted-user' }),
            async (userId) => {
                refreshedForUsers.push(userId);
                return { userId, accessToken: 'fresh-token' };
            }
        );

        expect(accessToken).toBe('fresh-token');
        expect(refreshedForUsers).toEqual(['trusted-user']);
    });

    it('refuses MCP requests without a trusted grant userId', async () => {
        let refreshCalled = false;

        const accessToken = await getMcpAccessTokenForGrant(
            createEnv(),
            createExecutionContextWithProps({ userId: ' ' }),
            async () => {
                refreshCalled = true;
                return { userId: 'attacker', accessToken: 'token' };
            }
        );

        expect(accessToken).toBeNull();
        expect(refreshCalled).toBe(false);
    });

    it('rejects token refresh responses for a different userId', async () => {
        await expect(
            getMcpAccessTokenForGrant(
                createEnv(),
                createExecutionContextWithProps({ userId: 'trusted-user' }),
                async () => ({ userId: 'other-user', accessToken: 'wrong-token' })
            )
        ).rejects.toThrow('Refreshed token userId mismatch');
    });
});
