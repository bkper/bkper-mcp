import { CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Bkper, BooksDataTableBuilder } from 'bkper-js';

import { formatCsv } from '../csv.js';

interface ListBooksParams {
    filter: string;
}

export async function handleListBooks(bkper: Bkper, params: ListBooksParams): Promise<CallToolResult> {
    try {
        const books = await bkper.getBooks(params.filter);
        const matrix = new BooksDataTableBuilder(books)
            .ids(true)
            .properties(true)
            .hiddenProperties(true)
            .build();

        return {
            content: [
                {
                    type: 'text',
                    text: formatCsv(matrix),
                },
            ],
        };
    } catch (error) {
        if (error instanceof McpError) {
            throw error;
        }

        throw new McpError(
            ErrorCode.InternalError,
            `Failed to list books: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

export const listBooksToolDefinition = {
    name: 'list_books',
    description: 'List books with mandatory filtering by name or property. Returns compact CSV.',
    inputSchema: {
        type: 'object' as const,
        properties: {
            filter: {
                type: 'string',
                description: 'Required filter to search books by name or property (case-insensitive substring match)'
            }
        },
        required: ['filter']
    }
};
