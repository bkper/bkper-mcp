import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { Bkper } from 'bkper-js';

export const BKPER_MCP_AGENT_ID = 'bkper-mcp';

/**
 * Environment bindings for the Cloudflare Worker
 */
export interface Env {
    BKPER_API_KEY?: string;
    ENVIRONMENT?: string;
    SESSIONS: KVNamespace;
    OAUTH_KV: KVNamespace;
    OAUTH_PROVIDER: OAuthHelpers;
}

/**
 * Get a configured Bkper instance for a request.
 * 
 * In remote MCP, authentication is handled per-request via OAuth token.
 * If BKPER_API_KEY is set, uses direct API access (for power users with own quotas).
 * Otherwise, bkper-js automatically uses the API proxy which injects a managed key server-side.
 * 
 * @param env - Cloudflare Worker environment bindings
 * @param oauthToken - OAuth token from the authenticated user
 * @returns Configured Bkper instance
 */
export function getBkperInstance(env: Env, oauthToken?: string): Bkper {
    const apiKey = env.BKPER_API_KEY;

    const bkper = new Bkper({
        apiKeyProvider: apiKey ? async () => apiKey : undefined,
        oauthTokenProvider: oauthToken ? async () => oauthToken : undefined,
        agentIdProvider: async () => BKPER_MCP_AGENT_ID,
    });

    return bkper;
}
