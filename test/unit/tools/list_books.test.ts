import { describe, it, expect, beforeEach } from 'bun:test';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Bkper } from 'bkper-js';
import { BkperMcpServer } from '../../../src/server.js';
import { BookData } from '../helpers/mock-interfaces.js';
import { createMockBkperForBooks } from '../helpers/mock-factory.js';
import { loadBooks, loadLargeBookDataset } from '../helpers/fixture-loader.js';

const mockBooks: BookData[] = loadBooks('');
const largeMockBooks: BookData[] = loadLargeBookDataset('');

function getText(response: CallToolResult): string {
    const content = response.content[0];
    if (!content || content.type !== 'text' || !('text' in content)) {
        throw new Error('Expected text content');
    }
    return content.text;
}

function parseCsvRows(text: string): string[][] {
    if (!text) {
        return [];
    }
    return text.split(/\r?\n/).filter(line => line.length > 0).map(line => line.split(','));
}

function parseBookRecords(text: string): Array<Record<string, string>> {
    const rows = parseCsvRows(text);
    const headers = rows[0] ?? [];
    return rows.slice(1).map(row => {
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
            record[header] = row[index] ?? '';
        });
        return record;
    });
}

function createServer(books: BookData[] = mockBooks): BkperMcpServer {
    const mockBkper = createMockBkperForBooks(books);
    return new BkperMcpServer(mockBkper as unknown as Bkper);
}

describe('MCP Server - list_books Tool Registration', () => {
    let server: BkperMcpServer;

    beforeEach(() => {
        server = createServer();
    });

    it('should register list_books tool in MCP tools list', async () => {
        const response = await server.testListTools();

        const listBooksTool = response.tools.find(tool => tool.name === 'list_books');
        expect(listBooksTool).toBeDefined();
        expect(listBooksTool?.name).toBe('list_books');
        expect(listBooksTool?.description).toContain('mandatory filtering');
        expect(listBooksTool?.description).toContain('CSV');
        expect(listBooksTool?.inputSchema).toHaveProperty('properties');
        expect(listBooksTool?.inputSchema.properties).toHaveProperty('filter');
        expect(listBooksTool?.inputSchema.properties).not.toHaveProperty('limit');
        expect(listBooksTool?.inputSchema.properties).not.toHaveProperty('cursor');
    });

    it('should have proper MCP tool schema for list_books', async () => {
        const response = await server.testListTools();
        const listBooksTool = response.tools.find(tool => tool.name === 'list_books');

        expect(listBooksTool?.inputSchema).toEqual({
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: {
                filter: {
                    type: 'string',
                    description:
                        'Required filter to search books by name or property (case-insensitive substring match)',
                },
            },
            required: ['filter'],
        });
    });
});

describe('MCP Server - list_books CSV Output', () => {
    let server: BkperMcpServer;

    beforeEach(() => {
        server = createServer();
    });

    it('should return compact CSV rows for matching books', async () => {
        const response = await server.testCallTool('list_books', { filter: 'Test' });
        const text = getText(response);
        const rows = parseCsvRows(text);
        const records = parseBookRecords(text);

        expect(rows[0]).toEqual([
            'Book Id',
            'Name',
            'Collection',
            'Date Pattern',
            'Decimal Separator',
            'Fraction Digits',
            'Period',
            'Owner',
            'category',
        ]);
        expect(records).toHaveLength(1);
        expect(records[0]['Book Id']).toBe('book-1');
        expect(records[0].Name).toBe('Test Company Ltd');
        expect(records[0].Collection).toBe('');
        expect(records[0].category).toBe('business');
    });

    it('should filter books by partial name match case-insensitively', async () => {
        const response = await server.testCallTool('list_books', { filter: 'PERSONAL' });
        const records = parseBookRecords(getText(response));

        expect(records).toHaveLength(1);
        expect(records[0]['Book Id']).toBe('book-2');
        expect(records[0].Name).toBe('Personal Finance');
    });

    it('should return only a CSV header when no books match', async () => {
        const response = await server.testCallTool('list_books', {
            filter: 'NonExistentBookName',
        });
        const records = parseBookRecords(getText(response));

        expect(records).toHaveLength(0);
    });

    it('should handle empty string filter by returning all books as CSV records', async () => {
        const response = await server.testCallTool('list_books', { filter: '' });
        const records = parseBookRecords(getText(response));

        expect(records).toHaveLength(2);
        expect(records.map(record => record.Name)).toEqual(['Personal Finance', 'Test Company Ltd']);
    });

    it('should keep filtered large datasets compact by returning CSV records', async () => {
        server = createServer(largeMockBooks);

        const response = await server.testCallTool('list_books', { filter: 'Company' });
        const records = parseBookRecords(getText(response));

        expect(records).toHaveLength(500);
        expect(records.every(record => record.Name.includes('Company'))).toBe(true);
    });
});
