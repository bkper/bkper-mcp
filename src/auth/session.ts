/**
 * Bkper web session handoff helpers.
 *
 * These helpers intentionally mirror Dispatch's session cookie and KV session
 * shape so mcp.bkper.app can authenticate a user from the existing first-party
 * Bkper web session without accepting user identity from the MCP client.
 */

const SESSION_COOKIE_NAME_BASE = 'bkper_session';
const SESSION_PREFIX = 'session:';

export interface EnvironmentBinding {
    ENVIRONMENT?: string;
}

export interface SessionStore {
    get(key: string): Promise<string | null>;
}

export interface AuthenticatedSession {
    sessionId: string;
    userId: string;
}

interface StoredSession {
    userId: string;
}

export function getSessionCookieName(env: EnvironmentBinding): string {
    if (env.ENVIRONMENT === 'prod') {
        return SESSION_COOKIE_NAME_BASE;
    }
    if (env.ENVIRONMENT === 'dev') {
        return `${SESSION_COOKIE_NAME_BASE}_dev`;
    }
    if (env.ENVIRONMENT === 'local') {
        return `${SESSION_COOKIE_NAME_BASE}_local`;
    }
    return `${SESSION_COOKIE_NAME_BASE}_unknown`;
}

export function parseSessionCookie(cookieHeader: string | null, env: EnvironmentBinding): string | null {
    if (!cookieHeader) {
        return null;
    }

    const cookieName = getSessionCookieName(env);
    const cookies = cookieHeader.split(';').map(cookie => cookie.trim());

    for (const cookie of cookies) {
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex < 0) {
            continue;
        }

        const name = cookie.slice(0, separatorIndex);
        const value = cookie.slice(separatorIndex + 1);
        if (name === cookieName && value) {
            return value;
        }
    }

    return null;
}

export async function getAuthenticatedSession(
    cookieHeader: string | null,
    env: EnvironmentBinding,
    sessions: SessionStore
): Promise<AuthenticatedSession | null> {
    const sessionId = parseSessionCookie(cookieHeader, env);
    if (!sessionId) {
        return null;
    }

    const storedSession = await readStoredSession(sessions, sessionId);
    if (!storedSession) {
        return null;
    }

    return {
        sessionId,
        userId: storedSession.userId,
    };
}

async function readStoredSession(sessions: SessionStore, sessionId: string): Promise<StoredSession | null> {
    const sessionString = await sessions.get(`${SESSION_PREFIX}${sessionId}`);
    if (!sessionString) {
        return null;
    }

    try {
        const parsed = JSON.parse(sessionString) as unknown;
        if (isStoredSession(parsed)) {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

function isStoredSession(value: unknown): value is StoredSession {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const maybeSession = value as Record<string, unknown>;
    return typeof maybeSession.userId === 'string' && maybeSession.userId.length > 0;
}
