import { Bkper } from 'bkper-js';

/**
 * Default API proxy URL for clients without their own API key.
 * The proxy injects a managed API key server-side.
 */
const API_PROXY_BASE_URL = 'https://api.bkper.app';

/**
 * Environment bindings for the Cloudflare Worker
 */
export interface Env {
    BKPER_API_KEY?: string;
    // OAuth token will be passed per-request in remote MCP
}

/**
 * Get a configured Bkper instance for a request.
 * 
 * In remote MCP, authentication is handled per-request via OAuth token.
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
        apiBaseUrl: apiKey ? undefined : API_PROXY_BASE_URL
    });

    return bkper;
}
