import { CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Bkper } from 'bkper-js';

import { formatCsv } from '../csv.js';

interface ListTransactionsParams {
    bookId: string;
    cursor?: string;
    query: string;
    limit?: number;
}

function buildMetadataCsv(hasMore: boolean, cursor: string | undefined, limit: number, query: string): string {
    return formatCsv([
        ['hasMore', String(hasMore)],
        ['cursor', cursor ?? ''],
        ['limit', limit],
        ['query', query],
    ]);
}

export async function handleListTransactions(bkper: Bkper, params: ListTransactionsParams): Promise<CallToolResult> {
    try {
        if (!params.bookId) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Missing required parameter: bookId'
            );
        }

        if (!params.query) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Missing required parameter: query'
            );
        }

        const book = await bkper.getBook(params.bookId, true);
        if (!book) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Book not found: ${params.bookId}`
            );
        }

        const limit = Math.min(params.limit || 25, 100);
        const transactionList = await book.listTransactions(params.query, limit, params.cursor);
        const transactionItems = transactionList.getItems();
        const nextCursor = transactionList.getCursor();
        const account = await transactionList.getAccount();

        const matrix = await book
            .createTransactionsDataTable(transactionItems, account)
            .ids(true)
            .formatDates(true)
            .formatValues(true)
            .properties(true)
            .hiddenProperties(true)
            .urls(true)
            .recordedAt(true)
            .build();

        const metadataCsv = buildMetadataCsv(Boolean(nextCursor), nextCursor, limit, params.query);
        const tableCsv = formatCsv(matrix);

        return {
            content: [
                {
                    type: 'text',
                    text: `${metadataCsv}\r\n\r\n${tableCsv}`,
                },
            ],
        };
    } catch (error) {
        if (error instanceof McpError) {
            throw error;
        }

        throw new McpError(
            ErrorCode.InternalError,
            `Failed to list transactions: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

export const listTransactionsToolDefinition = {
    name: 'list_transactions',
    description: 'List transactions as compact CSV with native API cursor-based pagination and query filtering. Output starts with metadata CSV rows (hasMore,cursor,limit,query), then a blank line, then the transaction table. Use get_book first to understand query syntax and usage rules.',
    inputSchema: {
        type: 'object' as const,
        properties: {
            bookId: {
                type: 'string',
                description: 'The unique identifier of the book'
            },
            cursor: {
                type: 'string',
                description: 'Pagination cursor for next page (provided by previous response)'
            },
            query: {
                type: 'string',
                description: 'Required query string to filter transactions using comprehensive syntax (account:, from:, to:, group:, on:, after:, before:, amount:, text search, logical operators, etc.)'
            },
            limit: {
                type: 'number',
                description: 'Number of transactions per page (default: 25, maximum: 100)',
                minimum: 1,
                maximum: 100
            }
        },
        required: ['bookId', 'query']
    }
};
