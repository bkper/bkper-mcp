import { CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Bkper, BalanceType } from 'bkper-js';

interface GetBalancesParams {
    bookId: string;
    query: string;
}

interface BalancesResponse {
    matrix: unknown[][];
    query?: string;
}

export async function handleGetBalances(bkper: Bkper, params: GetBalancesParams): Promise<CallToolResult> {
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

        // Validate query contains either group: or account: operator
        if (!params.query.includes('group:') && !params.query.includes('account:')) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Query must include either \'group:\' or \'account:\' operator for proper balance filtering. Example: "group:\'Assets\' before:$m" or "account:\'Cash\' before:$m"'
            );
        }

        const book = await bkper.getBook(params.bookId, true);
        if (!book) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Book not found: ${params.bookId}`
            );
        }

        let actualQuery = params.query;

        // Enforce monthly periodicity by modifying query
        if (actualQuery.includes('by:d')) {
            actualQuery = actualQuery.replace(/by:d/g, 'by:m');
        } else if (actualQuery.includes('by:y')) {
            actualQuery = actualQuery.replace(/by:y/g, 'by:m');
        } else if (!actualQuery.includes('by:')) {
            actualQuery = actualQuery + ' by:m';
        }

        const balancesReport = await book.getBalancesReport(actualQuery);

        // Determine balance type based on presence of after: operator
        const type = actualQuery.includes('after:') ? BalanceType.PERIOD : BalanceType.CUMULATIVE;

        const dataTableBuilder = balancesReport.createDataTable()
            .formatValues(false)
            .formatDates(true)
            .raw(true)
            .expanded(4)
            .type(type);

        const matrix = dataTableBuilder.build();

        const response: BalancesResponse = {
            matrix,
            query: actualQuery
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
        };
    } catch (error) {
        if (error instanceof McpError) {
            throw error;
        }

        throw new McpError(
            ErrorCode.InternalError,
            `Failed to get balances: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

export const getBalancesToolDefinition = {
    name: 'get_balances',
    description: 'Get account balances with query filtering. Use get_book first to understand group hierarchy and usage rules.',
    inputSchema: {
        type: 'object' as const,
        properties: {
            bookId: {
                type: 'string',
                description: 'The unique identifier of the book'
            },
            query: {
                type: 'string',
                description: 'Required query to filter balances (e.g., "account:\'Cash\'", "group:\'Assets\'", "before:2024-01-31")'
            }
        },
        required: ['bookId', 'query']
    }
};
