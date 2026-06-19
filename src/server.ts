/**
 * Bkper MCP Server
 *
 * Remote-only MCP server for Cloudflare Workers.
 * Uses Streamable HTTP transport (MCP 2025-03-26 specification).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { Bkper } from 'bkper-js';
import { z } from 'zod';

import { handleGetBook, getBookToolDefinition } from './tools/get_book.js';
import { handleGetBalances, getBalancesToolDefinition } from './tools/get_balances.js';
import { handleListTransactions, listTransactionsToolDefinition } from './tools/list_transactions.js';
import { handleListBooks, listBooksToolDefinition } from './tools/list_books.js';
import { handleReferenceIndex, referenceIndexToolDefinition } from './tools/reference_index.js';

const listBooksInputSchema = {
    filter: z.string().describe(listBooksToolDefinition.inputSchema.properties.filter.description),
};

const getBookInputSchema = {
    bookId: z.string().describe(getBookToolDefinition.inputSchema.properties.bookId.description),
};

const getBalancesInputSchema = {
    bookId: z.string().describe(getBalancesToolDefinition.inputSchema.properties.bookId.description),
    query: z.string().describe(getBalancesToolDefinition.inputSchema.properties.query.description),
};

const listTransactionsInputSchema = {
    bookId: z.string().describe(listTransactionsToolDefinition.inputSchema.properties.bookId.description),
    cursor: z.string().optional().describe(listTransactionsToolDefinition.inputSchema.properties.cursor.description),
    query: z.string().describe(listTransactionsToolDefinition.inputSchema.properties.query.description),
    limit: z.number()
        .min(listTransactionsToolDefinition.inputSchema.properties.limit.minimum)
        .max(listTransactionsToolDefinition.inputSchema.properties.limit.maximum)
        .optional()
        .describe(listTransactionsToolDefinition.inputSchema.properties.limit.description),
};

const referenceIndexInputSchema = {};

type RequestHandler = (request: unknown) => Promise<unknown>;

type ServerWithRequestHandlers = {
    _requestHandlers: Map<string, RequestHandler>;
};

function getTextFromToolResult(result: CallToolResult): string | undefined {
    const textContent = result.content.find((content) => content.type === 'text');
    return textContent && 'text' in textContent ? textContent.text : undefined;
}

export class BkperMcpServer {
    private server: McpServer;
    private bkper: Bkper;

    constructor(bkper: Bkper) {
        this.bkper = bkper;
        this.server = new McpServer({
            name: 'bkper-mcp-server',
            version: '0.1.0',
        });

        this.setupTools();
    }

    private setupTools() {
        this.server.registerTool(
            listBooksToolDefinition.name,
            {
                description: listBooksToolDefinition.description,
                inputSchema: listBooksInputSchema,
            },
            (args) => handleListBooks(this.bkper, args),
        );

        this.server.registerTool(
            getBookToolDefinition.name,
            {
                description: getBookToolDefinition.description,
                inputSchema: getBookInputSchema,
            },
            (args) => handleGetBook(this.bkper, args),
        );

        this.server.registerTool(
            getBalancesToolDefinition.name,
            {
                description: getBalancesToolDefinition.description,
                inputSchema: getBalancesInputSchema,
            },
            (args) => handleGetBalances(this.bkper, args),
        );

        this.server.registerTool(
            listTransactionsToolDefinition.name,
            {
                description: listTransactionsToolDefinition.description,
                inputSchema: listTransactionsInputSchema,
            },
            (args) => handleListTransactions(this.bkper, args),
        );

        this.server.registerTool(
            referenceIndexToolDefinition.name,
            {
                description: referenceIndexToolDefinition.description,
                inputSchema: referenceIndexInputSchema,
            },
            () => handleReferenceIndex(),
        );
    }

    /**
     * Get the high-level MCP Server instance for transport connection.
     */
    getServer(): McpServer {
        return this.server;
    }

    // Test helper methods
    async testListTools(): Promise<ListToolsResult> {
        const requestHandlers = (this.server.server as unknown as ServerWithRequestHandlers)._requestHandlers;
        const handler = requestHandlers.get('tools/list');
        if (!handler) throw new Error('ListTools handler not found');

        const request = {
            method: 'tools/list' as const,
            params: {}
        };
        const result = await handler(request) as ListToolsResult;
        return JSON.parse(JSON.stringify(result)) as ListToolsResult;
    }

    async testCallTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
        const requestHandlers = (this.server.server as unknown as ServerWithRequestHandlers)._requestHandlers;
        const handler = requestHandlers.get('tools/call');
        if (!handler) throw new Error('CallTool handler not found');

        const request = {
            method: 'tools/call' as const,
            params: { name, arguments: args }
        };
        const result = await handler(request) as CallToolResult;

        if (result.isError) {
            throw new Error(getTextFromToolResult(result) || `Tool ${name} failed`);
        }

        return result;
    }
}
