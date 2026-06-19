/**
 * Bkper MCP Server - Cloudflare Worker Entry Point
 *
 * Remote-only MCP server using Cloudflare OAuth provider routing.
 */

import { OAuthProvider } from '@cloudflare/workers-oauth-provider';

import { getBkperInstance } from './bkper-factory.js';
import { createMcpApiHandler, defaultHandler } from './handlers.js';
import { handleMcpRequest } from './mcp-transport.js';
import { createOAuthProviderOptions } from './oauth.js';
import { BkperMcpServer } from './server.js';

export default new OAuthProvider(createOAuthProviderOptions({
    defaultHandler,
    apiHandler: createMcpApiHandler({ handleMcpRequest }),
}));

// Export for testing
export { BkperMcpServer } from './server.js';
export { getBkperInstance } from './bkper-factory.js';
