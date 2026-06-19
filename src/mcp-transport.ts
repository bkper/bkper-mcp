import { createMcpHandler } from 'agents/mcp';

import type { Env } from './bkper-factory.js';
import type { BkperMcpServer } from './server.js';

export async function handleMcpRequest(
    server: BkperMcpServer,
    request: Request,
    env: Env,
    ctx: ExecutionContext,
): Promise<Response> {
    return createMcpHandler(server.getServer(), { route: '/mcp' })(request, env, ctx);
}
