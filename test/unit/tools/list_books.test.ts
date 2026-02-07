import { describe, it, expect, beforeEach } from 'bun:test';
import { BkperMcpServer } from '../../../src/server.js';
import { BookData } from '../helpers/mock-interfaces.js';
import { createMockBkperForBooks } from '../helpers/mock-factory.js';
import { loadBooks, loadLargeBookDataset } from '../helpers/fixture-loader.js';

// Load test data
const mockBooks: BookData[] = loadBooks('');
const largeMockBooks: BookData[] = loadLargeBookDataset('');

describe('MCP Server - list_books Tool Registration', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBooks(mockBooks);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should register list_books tool in MCP tools list', async () => {
        const response = await server.testListTools();

        expect(response).toHaveProperty('tools');
        expect(Array.isArray(response.tools)).toBe(true);

        const listBooksTool = response.tools.find((tool: any) => tool.name === 'list_books');
        expect(listBooksTool).toBeDefined();
        expect(listBooksTool!.name).toBe('list_books');
        expect(listBooksTool!.description).toContain('mandatory filtering');
        expect(listBooksTool!.inputSchema).toHaveProperty('properties');
        expect(listBooksTool!.inputSchema.properties).toHaveProperty('filter');
        expect(listBooksTool!.inputSchema.properties).not.toHaveProperty('limit');
        expect(listBooksTool!.inputSchema.properties).not.toHaveProperty('cursor');
    });

    it('should have proper MCP tool schema for list_books', async () => {
        const response = await server.testListTools();
        const listBooksTool = response.tools.find((tool: any) => tool.name === 'list_books');

        expect(listBooksTool!.inputSchema).toEqual({
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

describe('MCP Server - list_books Tool Calls', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBooks(mockBooks);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should handle MCP list_books tool call with filter', async () => {
        const response = await server.testCallTool('list_books', { filter: 'Test' });

        // Verify MCP response structure
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content).toHaveLength(1);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0]).toHaveProperty('text');

        // Parse the JSON response
        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse).toHaveProperty('total');
        expect(jsonResponse).toHaveProperty('books');
        expect(jsonResponse).not.toHaveProperty('pagination');

        expect(jsonResponse.total).toBe(1);
        expect(jsonResponse.books).toHaveLength(1);
    });
});

describe('MCP Server - list_books Filter Parameter', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBooks(mockBooks);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should filter books by exact name match', async () => {
        const response = await server.testCallTool('list_books', {
            filter: 'Test Company Ltd',
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.total).toBe(1);
        expect(jsonResponse.books).toHaveLength(1);
        expect(jsonResponse.books[0].name).toBe('Test Company Ltd');
        expect(jsonResponse.books[0].id).toBe('book-1');
    });

    it('should filter books by partial name match (case-insensitive)', async () => {
        const response = await server.testCallTool('list_books', {
            filter: 'company',
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.total).toBe(1);
        expect(jsonResponse.books).toHaveLength(1);
        expect(jsonResponse.books[0].name).toBe('Test Company Ltd');
    });

    it('should filter books by partial name match with different case', async () => {
        const response = await server.testCallTool('list_books', {
            filter: 'PERSONAL',
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.total).toBe(1);
        expect(jsonResponse.books).toHaveLength(1);
        expect(jsonResponse.books[0].name).toBe('Personal Finance');
        expect(jsonResponse.books[0].id).toBe('book-2');
    });

    it('should return multiple books when filter matches multiple entries', async () => {
        // Using a common substring that should match both books
        const response = await server.testCallTool('list_books', {
            filter: 'e', // Both "Test Company Ltd" and "Personal Finance" contain 'e'
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.total).toBe(2);
        expect(jsonResponse.books).toHaveLength(2);
    });

    it('should return empty result when filter matches no books', async () => {
        const response = await server.testCallTool('list_books', {
            filter: 'NonExistentBookName',
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.total).toBe(0);
        expect(jsonResponse.books).toHaveLength(0);
    });

    it('should handle empty string filter (return all books)', async () => {
        const response = await server.testCallTool('list_books', {
            filter: '',
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.total).toBe(2);
        expect(jsonResponse.books).toHaveLength(2);
    });

    it('should handle whitespace-only filter (return all books)', async () => {
        const response = await server.testCallTool('list_books', {
            filter: '   ',
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.total).toBe(2);
        expect(jsonResponse.books).toHaveLength(2);
    });

    it('should handle special characters in filter', async () => {
        const response = await server.testCallTool('list_books', {
            filter: 'Ltd',
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.total).toBe(1);
        expect(jsonResponse.books).toHaveLength(1);
        expect(jsonResponse.books[0].name).toBe('Test Company Ltd');
    });

    it('should work with filtering on large dataset', async () => {
        // Switch to large dataset for filtering testing
        const mockBkper = createMockBkperForBooks(largeMockBooks);
        server = new BkperMcpServer(mockBkper as any);

        // Filter by a common character that should match many books
        const response = await server.testCallTool('list_books', {
            filter: 'Company', // All books in large dataset contain "Company"
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        // Verify response structure is preserved with filtering
        expect(jsonResponse).toHaveProperty('total');
        expect(jsonResponse).toHaveProperty('books');
        expect(jsonResponse).not.toHaveProperty('pagination');
        expect(jsonResponse.total).toBe(500); // All books match "Company"
        expect(jsonResponse.books).toHaveLength(500);
    });
});

describe('MCP Server - list_books Tool Schema with Filter Parameter', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBooks(mockBooks);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should include filter parameter in MCP tool schema', async () => {
        const response = await server.testListTools();
        const listBooksTool = response.tools.find((tool: any) => tool.name === 'list_books') as any;

        expect(listBooksTool).toBeDefined();
        expect(listBooksTool.inputSchema.properties).toHaveProperty('filter');
        expect(listBooksTool.inputSchema.properties.filter).toEqual({
            type: 'string',
            description:
                'Required filter to search books by name or property (case-insensitive substring match)',
        });
    });

    it('should have filter parameter as required in schema', async () => {
        const response = await server.testListTools();
        const listBooksTool = response.tools.find((tool: any) => tool.name === 'list_books') as any;

        expect(listBooksTool).toBeDefined();
        expect(Array.isArray(listBooksTool.inputSchema.required)).toBe(true);
        expect(listBooksTool.inputSchema.required).toContain('filter');
    });

    it('should update tool description to mention mandatory filtering', async () => {
        const response = await server.testListTools();
        const listBooksTool = response.tools.find((tool: any) => tool.name === 'list_books') as any;

        expect(listBooksTool).toBeDefined();
        expect(listBooksTool.description).toContain('mandatory filtering');
    });
});

describe('MCP Server - list_books Error Handling', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBooks(mockBooks);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should return different results for different filters', async () => {
        // Call with first filter
        const firstFilterResponse = await server.testCallTool('list_books', {
            filter: 'Test',
        });
        const firstFilterData = JSON.parse(firstFilterResponse.content[0].text as string);

        // Call with second filter
        const secondFilterResponse = await server.testCallTool('list_books', {
            filter: 'Personal',
        });
        const secondFilterData = JSON.parse(secondFilterResponse.content[0].text as string);

        // Results should be different and correctly filtered
        expect(firstFilterData.total).toBe(1);
        expect(firstFilterData.books[0].name).toBe('Test Company Ltd');

        expect(secondFilterData.total).toBe(1);
        expect(secondFilterData.books[0].name).toBe('Personal Finance');
    });

    it('should return all matching books when filtering is applied', async () => {
        // Switch to large dataset
        const mockBkper = createMockBkperForBooks(largeMockBooks);
        server = new BkperMcpServer(mockBkper as any);

        // Call with filter that matches specific books
        const response = await server.testCallTool('list_books', {
            filter: '1', // This matches "Company 1 Ltd", "Company 10 Ltd", etc.
        });
        const responseData = JSON.parse(response.content[0].text as string);

        expect(Array.isArray(responseData.books)).toBe(true);
        expect(responseData.total).toBeGreaterThan(0);
        // All returned books should still match the filter
        responseData.books.forEach((book: any) => {
            expect(book.name.toLowerCase()).toContain('1');
        });
    });
});
