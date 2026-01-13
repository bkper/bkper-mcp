/**
 * Bkper MCP Server
 * 
 * Remote-only MCP server for Cloudflare Workers.
 * Uses Streamable HTTP transport (MCP 2025-03-26 specification).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    CallToolRequestSchema,
    CallToolResult,
    ErrorCode,
    ListToolsRequestSchema,
    ListToolsResult,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Bkper } from 'bkper-js';

import { handleGetBook, getBookToolDefinition } from './tools/get_book.js';
import { handleGetBalances, getBalancesToolDefinition } from './tools/get_balances.js';
import { handleListTransactions, listTransactionsToolDefinition } from './tools/list_transactions.js';
import { handleListBooks, listBooksToolDefinition } from './tools/list_books.js';
import { handleCreateTransactions, createTransactionsToolDefinition } from './tools/create_transactions.js';
import { handleMergeTransactions, mergeTransactionsToolDefinition } from './tools/merge_transactions.js';

export class BkperMcpServer {
    private server: Server;
    private bkper: Bkper;

    constructor(bkper: Bkper) {
        this.bkper = bkper;
        this.server = new Server(
            {
                name: 'bkper-mcp-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );

        this.setupToolHandlers();
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
            return {
                tools: [
                    listBooksToolDefinition,
                    getBookToolDefinition,
                    getBalancesToolDefinition,
                    listTransactionsToolDefinition,
                    createTransactionsToolDefinition,
                    mergeTransactionsToolDefinition,
                ],
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
            const toolName = request.params.name;
            const toolArgs = request.params.arguments;

            let result: CallToolResult;

            try {
                switch (toolName) {
                    case 'list_books':
                        result = await handleListBooks(this.bkper, toolArgs as { filter: string });
                        break;
                    case 'get_book':
                        result = await handleGetBook(this.bkper, toolArgs as { bookId: string });
                        break;
                    case 'get_balances':
                        result = await handleGetBalances(this.bkper, toolArgs as { bookId: string; query: string });
                        break;
                    case 'list_transactions':
                        result = await handleListTransactions(this.bkper, toolArgs as { bookId: string; query: string; cursor?: string; limit?: number });
                        break;
                    case 'create_transactions':
                        result = await handleCreateTransactions(this.bkper, toolArgs as { bookId: string; transactions: Array<{ date: string; amount: number; from_account?: string; to_account?: string; description: string }> });
                        break;
                    case 'merge_transactions':
                        result = await handleMergeTransactions(this.bkper, toolArgs as { bookId: string; transactionId1: string; transactionId2: string });
                        break;
                    default:
                        throw new McpError(
                            ErrorCode.MethodNotFound,
                            `Unknown tool: ${toolName}`
                        );
                }

                return result;

            } catch (error) {
                if (!(error instanceof McpError)) {
                    throw new McpError(
                        ErrorCode.InternalError,
                        `Tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
                throw error;
            }
        });
    }

    /**
     * Get the underlying MCP Server instance for transport connection
     */
    getServer(): Server {
        return this.server;
    }

    // Test helper methods
    async testListTools(): Promise<ListToolsResult> {
        const requestHandlers = (this.server as unknown as { _requestHandlers: Map<string, (request: unknown) => Promise<unknown>> })._requestHandlers;
        const handler = requestHandlers.get('tools/list');
        if (!handler) throw new Error('ListTools handler not found');

        const request = {
            method: 'tools/list' as const,
            params: {}
        };
        return await handler(request) as ListToolsResult;
    }

    async testCallTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
        const requestHandlers = (this.server as unknown as { _requestHandlers: Map<string, (request: unknown) => Promise<unknown>> })._requestHandlers;
        const handler = requestHandlers.get('tools/call');
        if (!handler) throw new Error('CallTool handler not found');

        const request = {
            method: 'tools/call' as const,
            params: { name, arguments: args }
        };
        return await handler(request) as CallToolResult;
    }
}
