import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * agents currently installs its own physical @modelcontextprotocol/sdk copy under Bun.
 * The runtime createMcpHandler accepts high-level McpServer instances from the same
 * SDK version, but TypeScript sees duplicate private class declarations. This
 * overload preserves the public Cloudflare Agents API while allowing this project
 * to pass the high-level MCP server it constructs directly.
 */
declare module 'agents/mcp' {
    export function createMcpHandler(
        server: McpServer,
        options?: {
            route?: string;
        },
    ): (request: Request, env: unknown, ctx: ExecutionContext) => Promise<Response>;
}
