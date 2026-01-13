import { CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Bkper } from 'bkper-js';

interface ListBooksParams {
    filter: string;
}

interface BooksResponse {
    total: number;
    books: Array<bkper.Book>;
}

async function fetchBooks(bkper: Bkper, filter: string): Promise<{ books: Array<bkper.Book>; total: number }> {
    const bkperBooks = await bkper.getBooks(filter);

    const books = bkperBooks.map((book) => book.json());
    const total = books.length;

    return { books, total };
}

export async function handleListBooks(bkper: Bkper, params: ListBooksParams): Promise<CallToolResult> {
    try {
        const { books, total } = await fetchBooks(bkper, params.filter);

        const response: BooksResponse = {
            total,
            books
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
            `Failed to list books: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

export const listBooksToolDefinition = {
    name: 'list_books',
    description: 'List books with mandatory filtering by name or property',
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
