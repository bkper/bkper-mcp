/**
 * Helpers for resolving the authenticated Bkper user from MCP OAuth grant props.
 *
 * The MCP client must never provide user identity. The only trusted userId is
 * the one stored server-side by the OAuth provider during authorization.
 */

import type { Env } from './bkper-factory.js';
import { refreshBkperAccessToken, type TokenResponse } from './private-api.js';

export interface McpGrantProps {
    userId: string;
}

export type BkperAccessTokenRefresher = (userId: string, env: Env) => Promise<TokenResponse>;

export function getMcpGrantProps(ctx: ExecutionContext): McpGrantProps | null {
    const props = (ctx as unknown as { props?: unknown }).props;
    if (!props || typeof props !== 'object') {
        return null;
    }

    const record = props as Record<string, unknown>;
    if (typeof record.userId !== 'string' || record.userId.trim().length === 0) {
        return null;
    }

    return { userId: record.userId };
}

export async function getMcpAccessTokenForGrant(
    env: Env,
    ctx: ExecutionContext,
    refreshAccessToken: BkperAccessTokenRefresher = refreshBkperAccessToken
): Promise<string | null> {
    const grantProps = getMcpGrantProps(ctx);
    if (!grantProps) {
        return null;
    }

    const token = await refreshAccessToken(grantProps.userId, env);
    if (token.userId !== grantProps.userId) {
        throw new Error('Refreshed token userId mismatch');
    }
    if (!token.accessToken) {
        throw new Error('Refreshed token accessToken is missing');
    }

    return token.accessToken;
}
