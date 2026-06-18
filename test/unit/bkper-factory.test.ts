import { describe, expect, it } from 'bun:test';

import { BKPER_MCP_AGENT_ID, getBkperInstance, type Env } from '../../src/bkper-factory.js';

function createEnv(overrides: Partial<Env> = {}): Env {
    return {
        API_DOMAIN: 'api-dev.bkper.app',
        GOOGLE_SERVICE_ACCOUNT_KEY: '{}',
        SESSIONS: {} as KVNamespace,
        OAUTH_KV: {} as KVNamespace,
        OAUTH_PROVIDER: {},
        ...overrides,
    };
}

describe('Bkper factory', () => {
    it('configures bkper-js with the refreshed user OAuth token and MCP agent id', async () => {
        const bkper = getBkperInstance(createEnv(), 'fresh-user-token');
        const config = bkper.getConfig();

        await expect(config.oauthTokenProvider?.()).resolves.toBe('fresh-user-token');
        await expect(config.agentIdProvider?.()).resolves.toBe(BKPER_MCP_AGENT_ID);
    });
});
