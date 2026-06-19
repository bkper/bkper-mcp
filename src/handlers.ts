import { Hono } from 'hono';
import { prettyJSON } from 'hono/pretty-json';

import { handleAuthorizeRequest } from './auth/authorize.js';
import { getBkperInstance, type Env } from './bkper-factory.js';
import { getMcpAccessTokenForGrant } from './mcp-auth.js';
import type { HandlerWithFetch } from './oauth.js';
import { BkperMcpServer } from './server.js';

export type GetMcpAccessTokenForGrant = typeof getMcpAccessTokenForGrant;

export type HandleMcpRequest = (
    server: BkperMcpServer,
    request: Request,
    env: Env,
    ctx: ExecutionContext,
) => Promise<Response>;

export interface McpApiHandlerDependencies {
    getAccessTokenForGrant?: GetMcpAccessTokenForGrant;
    handleMcpRequest?: HandleMcpRequest;
}

function createDefaultApp(): Hono<{ Bindings: Env }> {
    const app = new Hono<{ Bindings: Env }>();

    app.use(prettyJSON());

    app.get('/', (c) => {
        return c.json({
            name: 'bkper-mcp-server',
            version: '0.1.0',
            status: 'ok',
            message: 'Bkper MCP Server is running. OAuth authentication required for MCP endpoints.'
        });
    });

    app.get('/authorize', async (c) => {
        return handleAuthorizeRequest(c.req.raw, c.env);
    });

    app.post('/authorize', async (c) => {
        return handleAuthorizeRequest(c.req.raw, c.env);
    });

    return app;
}

export function createDefaultHandler(): HandlerWithFetch {
    const app = createDefaultApp();

    return {
        async fetch(request, env, ctx): Promise<Response> {
            return app.fetch(request, env, ctx);
        },
    };
}

export function createMcpApiHandler(
    dependencies: McpApiHandlerDependencies = {}
): HandlerWithFetch {
    const getAccessTokenForGrant = dependencies.getAccessTokenForGrant ?? getMcpAccessTokenForGrant;

    return {
        async fetch(request, env, ctx): Promise<Response> {
            let oauthToken: string | null;
            try {
                oauthToken = await getAccessTokenForGrant(env, ctx);
            } catch {
                console.error('Failed to refresh Bkper OAuth token for MCP request');
                return Response.json({ error: 'token_refresh_failed' }, { status: 502 });
            }

            if (!oauthToken) {
                return Response.json({ error: 'invalid_grant_props' }, { status: 401 });
            }

            if (!dependencies.handleMcpRequest) {
                return Response.json({ error: 'mcp_transport_unconfigured' }, { status: 500 });
            }

            const bkper = getBkperInstance(env, oauthToken);
            const server = new BkperMcpServer(bkper);
            return dependencies.handleMcpRequest(server, request, env, ctx);
        },
    };
}

export const defaultHandler = createDefaultHandler();
