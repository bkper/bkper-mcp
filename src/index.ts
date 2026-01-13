/**
 * Bkper MCP Server - Cloudflare Worker Entry Point
 * 
 * Remote-only MCP server using Hono for HTTP handling.
 * OAuth authentication will be added when deployment infrastructure is ready.
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import { getBkperInstance, Env } from './bkper-factory.js';
import { BkperMcpServer } from './server.js';

const app = new Hono<{ Bindings: Env }>();

app.use(prettyJSON());
app.use(logger());

// Health check
app.get('/', (c) => {
    return c.json({
        name: 'bkper-mcp-server',
        version: '0.1.0',
        status: 'ok',
        message: 'Bkper MCP Server is running. OAuth authentication required for MCP endpoints.'
    });
});

// MCP endpoint placeholder
// TODO: Implement Streamable HTTP transport when OAuth is ready
app.post('/mcp', async (c) => {
    // For now, return a 501 Not Implemented
    // This will be replaced with actual MCP handling once OAuth is implemented
    return c.json({
        error: 'not_implemented',
        message: 'MCP endpoint not yet implemented. OAuth authentication and Streamable HTTP transport coming soon.'
    }, 501);
});

// OAuth routes placeholder
// TODO: Implement OAuth flow based on bkper-clients/packages/auth patterns
app.get('/auth/login', (c) => {
    return c.json({
        error: 'not_implemented',
        message: 'OAuth login not yet implemented.'
    }, 501);
});

app.get('/auth/callback', (c) => {
    return c.json({
        error: 'not_implemented',
        message: 'OAuth callback not yet implemented.'
    }, 501);
});

// Tool list endpoint for discovery (no auth required)
app.get('/tools', async (c) => {
    const bkper = getBkperInstance(c.env);
    const server = new BkperMcpServer(bkper);
    const tools = await server.testListTools();
    return c.json(tools);
});

export default app;

// Export for testing
export { BkperMcpServer } from './server.js';
export { getBkperInstance } from './bkper-factory.js';
