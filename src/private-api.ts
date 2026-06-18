/**
 * Minimal Bkper Private API client for MCP-owned OAuth refresh.
 *
 * MCP grants store only a Bkper userId. This client exchanges that trusted
 * server-side userId for a fresh user OAuth access token via Bkper Core's
 * Private API, using service account authentication.
 */

import { GoogleAuth, type GoogleAuthOptions as LibraryGoogleAuthOptions, type JWTInput } from 'google-auth-library';

import { BKPER_MCP_AGENT_ID, type Env } from './bkper-factory.js';

const GOOGLE_AUTH_SCOPES = ['https://www.googleapis.com/auth/userinfo.email'];

export type GoogleAuthOptions = LibraryGoogleAuthOptions;

export interface TokenResponse {
    userId: string;
    accessToken: string;
}

export interface TokenRefreshRequest {
    userId: string;
}

export interface AuthenticatedRequestOptions {
    url: string;
    method: 'POST';
    headers: Record<string, string>;
    body: string;
}

export interface AuthenticatedHttpClient {
    request<T>(request: AuthenticatedRequestOptions): Promise<{ data: T }>;
}

export interface GoogleAuthLike {
    getClient(): Promise<AuthenticatedHttpClient>;
}

export type GoogleAuthFactory = (options: GoogleAuthOptions) => GoogleAuthLike;

export class BkperPrivateApiClient {
    constructor(
        private readonly env: Env,
        private readonly authFactory: GoogleAuthFactory = createGoogleAuth
    ) {}

    async refreshAccessToken(userId: string): Promise<TokenResponse> {
        if (!userId) {
            throw new Error('userId is required');
        }

        const auth = this.authFactory({
            credentials: parseServiceAccountKey(this.env.GOOGLE_SERVICE_ACCOUNT_KEY),
            scopes: GOOGLE_AUTH_SCOPES,
        });
        const client = await auth.getClient();
        const body: TokenRefreshRequest = { userId };
        const response = await client.request<TokenResponse>({
            url: `${getPrivateApiBaseUrl(this.env)}/v5/oauth/refresh`,
            method: 'POST',
            headers: {
                'bkper-agent-id': BKPER_MCP_AGENT_ID,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        return response.data;
    }
}

export async function refreshBkperAccessToken(userId: string, env: Env): Promise<TokenResponse> {
    return new BkperPrivateApiClient(env).refreshAccessToken(userId);
}

export function getPrivateApiBaseUrl(env: Pick<Env, 'API_DOMAIN' | 'ENVIRONMENT'>): string {
    const protocol = env.ENVIRONMENT === 'local' ? 'http' : 'https';
    return `${protocol}://${env.API_DOMAIN}/_ah/api/bkperpvt`;
}

function createGoogleAuth(options: GoogleAuthOptions): GoogleAuthLike {
    return new GoogleAuth(options);
}

function parseServiceAccountKey(key: string): JWTInput {
    const parsed = JSON.parse(key) as unknown;
    if (!isRecord(parsed)) {
        throw new Error('Invalid Google service account key');
    }
    return parsed as JWTInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
