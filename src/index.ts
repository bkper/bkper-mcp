/**
 * Bkper MCP Server - Cloudflare Worker Entry Point
 *
 * Remote-only MCP server using Cloudflare OAuth provider routing.
 */

import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { createMcpHandler } from 'agents/mcp';
import { Hono } from 'hono';
import { prettyJSON } from 'hono/pretty-json';

import { handleAuthorizeRequest } from './auth/authorize.js';
import { getBkperInstance, type Env } from './bkper-factory.js';
import { getMcpAccessTokenForGrant } from './mcp-auth.js';
import { createOAuthProviderOptions, type HandlerWithFetch } from './oauth.js';
import { BkperMcpServer } from './server.js';

const app = new Hono<{ Bindings: Env }>();

app.use(prettyJSON());

// Health check
app.get('/', (c) => {
    return c.json({
        name: 'bkper-mcp-server',
        version: '0.1.0',
        status: 'ok',
        message: 'Bkper MCP Server is running. OAuth authentication required for MCP endpoints.'
    });
});

// OAuth authorization UI / session handoff.
app.get('/authorize', async (c) => {
    return handleAuthorizeRequest(c.req.raw, c.env);
});

app.post('/authorize', async (c) => {
    return handleAuthorizeRequest(c.req.raw, c.env);
});

// Tool list endpoint for discovery (no auth required)
app.get('/tools', async (c) => {
    const bkper = getBkperInstance(c.env);
    const server = new BkperMcpServer(bkper);
    const tools = await server.testListTools();
    return c.json(tools);
});

const defaultHandler: HandlerWithFetch = {
    async fetch(request, env, ctx): Promise<Response> {
        return app.fetch(request, env, ctx);
    },
};

const mcpApiHandler: HandlerWithFetch = {
    async fetch(request, env, ctx): Promise<Response> {
        let oauthToken: string | null;
        try {
            oauthToken = await getMcpAccessTokenForGrant(env, ctx);
        } catch (error) {
            console.error('Failed to refresh Bkper OAuth token for MCP request:', error);
            return Response.json({ error: 'token_refresh_failed' }, { status: 502 });
        }

        if (!oauthToken) {
            return Response.json({ error: 'invalid_grant_props' }, { status: 401 });
        }

        const bkper = getBkperInstance(env, oauthToken);
        const server = new BkperMcpServer(bkper);
        // agents currently carries its own @modelcontextprotocol/sdk copy under Bun,
        // so identical Server instances have incompatible private TypeScript fields.
        const mcpServer = server.getServer() as unknown as Parameters<typeof createMcpHandler>[0];
        return createMcpHandler(mcpServer, { route: '/mcp' })(request, env, ctx);
    },
};

export default new OAuthProvider(createOAuthProviderOptions({
    defaultHandler,
    apiHandler: mcpApiHandler,
}));

// Export for testing
export { BkperMcpServer } from './server.js';
export { getBkperInstance } from './bkper-factory.js';
