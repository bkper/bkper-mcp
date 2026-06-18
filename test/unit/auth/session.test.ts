import { describe, expect, it } from 'bun:test';

import {
    getAuthenticatedSession,
    getSessionCookieName,
    parseSessionCookie,
    type SessionStore,
} from '../../../src/auth/session.js';

class MemorySessionStore implements SessionStore {
    private readonly records = new Map<string, string>();

    set(key: string, value: string): void {
        this.records.set(key, value);
    }

    async get(key: string): Promise<string | null> {
        return this.records.get(key) ?? null;
    }
}

describe('session handoff helpers', () => {
    it('uses the same environment-specific cookie names as Dispatch', () => {
        expect(getSessionCookieName({ ENVIRONMENT: 'prod' })).toBe('bkper_session');
        expect(getSessionCookieName({ ENVIRONMENT: 'dev' })).toBe('bkper_session_dev');
        expect(getSessionCookieName({ ENVIRONMENT: 'local' })).toBe('bkper_session_local');
        expect(getSessionCookieName({ ENVIRONMENT: 'preview' })).toBe('bkper_session_unknown');
    });

    it('parses only the cookie for the active environment', () => {
        const cookieHeader = 'bkper_session=prod-id; bkper_session_dev=dev-id; other=value';

        expect(parseSessionCookie(cookieHeader, { ENVIRONMENT: 'prod' })).toBe('prod-id');
        expect(parseSessionCookie(cookieHeader, { ENVIRONMENT: 'dev' })).toBe('dev-id');
        expect(parseSessionCookie(cookieHeader, { ENVIRONMENT: 'local' })).toBeNull();
    });

    it('loads the authenticated userId from the server-side session store', async () => {
        const store = new MemorySessionStore();
        store.set('session:session-123', JSON.stringify({ userId: 'user-123' }));

        const session = await getAuthenticatedSession(
            'bkper_session=session-123',
            { ENVIRONMENT: 'prod' },
            store
        );

        expect(session).toEqual({ sessionId: 'session-123', userId: 'user-123' });
    });

    it('rejects missing, invalid, malformed, or incomplete sessions', async () => {
        const store = new MemorySessionStore();
        store.set('session:malformed', 'not-json');
        store.set('session:missing-user', JSON.stringify({ userId: '' }));

        expect(await getAuthenticatedSession(null, { ENVIRONMENT: 'prod' }, store)).toBeNull();
        expect(await getAuthenticatedSession('bkper_session=unknown', { ENVIRONMENT: 'prod' }, store)).toBeNull();
        expect(await getAuthenticatedSession('bkper_session=malformed', { ENVIRONMENT: 'prod' }, store)).toBeNull();
        expect(await getAuthenticatedSession('bkper_session=missing-user', { ENVIRONMENT: 'prod' }, store)).toBeNull();
    });
});
