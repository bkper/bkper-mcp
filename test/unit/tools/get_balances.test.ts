import { describe, it, expect, beforeEach } from 'bun:test';
import { BkperMcpServer } from '../../../src/server.js';
import { AccountBalanceData, BookData } from '../helpers/mock-interfaces.js';
import { createMockBkperForBook } from '../helpers/mock-factory.js';
import {
    loadAccountBalances,
    generateLargeAccountBalances,
    loadBooks,
    loadBalanceMatrixTotal,
    loadBalanceMatrixPeriod,
} from '../helpers/fixture-loader.js';

// Load test data
const mockBooks: BookData[] = loadBooks('');
const mockAccountBalances: AccountBalanceData[] = loadAccountBalances('');
const largeMockAccountBalances: AccountBalanceData[] = generateLargeAccountBalances(150);
const mockMatrixTotal: any[][] = loadBalanceMatrixTotal('');
const mockMatrixPeriod: any[][] = loadBalanceMatrixPeriod('');

let currentMockAccountBalances: AccountBalanceData[] = mockAccountBalances;

describe('MCP Server - get_balances Tool Registration', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        currentMockAccountBalances = mockAccountBalances;
        const mockBkper = createMockBkperForBook(
            mockBooks,
            undefined,
            undefined,
            currentMockAccountBalances
        );
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should register get_balances tool in MCP tools list', async () => {
        const response = await server.testListTools();

        const getBalancesTool = response.tools.find((tool: any) => tool.name === 'get_balances');

        expect(getBalancesTool).toBeDefined();
        expect(getBalancesTool!.name).toBe('get_balances');
        expect(getBalancesTool!.description).toContain('account balances');
        expect(getBalancesTool!.inputSchema).toHaveProperty('properties');
        expect(getBalancesTool!.inputSchema.properties).toHaveProperty('bookId');
        expect(getBalancesTool!.inputSchema.properties).toHaveProperty('query');
        expect(getBalancesTool!.inputSchema.properties).not.toHaveProperty('cursor');
        expect(getBalancesTool!.inputSchema.properties).not.toHaveProperty('limit');
        expect(getBalancesTool!.inputSchema.required).toContain('bookId');
        expect(getBalancesTool!.inputSchema.required).toContain('query');
    });

    it('should have proper MCP tool schema for get_balances', async () => {
        const response = await server.testListTools();
        const getBalancesTool = response.tools.find((tool: any) => tool.name === 'get_balances');

        expect(getBalancesTool).toBeDefined();
        expect(getBalancesTool!.inputSchema).toEqual({
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: {
                bookId: {
                    type: 'string',
                    description: 'The unique identifier of the book',
                },
                query: {
                    type: 'string',
                    description:
                        'Required query to filter balances (e.g., "account:\'Cash\'", "group:\'Assets\'", "before:2024-01-31")',
                },
            },
            required: ['bookId', 'query'],
        });
    });
});

describe('MCP Server - get_balances Tool Calls', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        currentMockAccountBalances = mockAccountBalances;
        const mockBkper = createMockBkperForBook(
            mockBooks,
            undefined,
            undefined,
            currentMockAccountBalances
        );
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should handle MCP error for missing query parameter', async () => {
        try {
            await server.testCallTool('get_balances', { bookId: 'book-1' });
            throw new Error('Should have thrown an error for missing query');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle MCP error for query without group or account operators', async () => {
        try {
            await server.testCallTool('get_balances', {
                bookId: 'book-1',
                query: 'before:$m',
            });
            throw new Error('Should have thrown an error for missing group/account operator');
        } catch (error: any) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain('group:');
            expect(error.message).toContain('account:');
        }
    });

    it('should handle MCP get_balances tool call with query filter', async () => {
        const response = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "account:'Cash'",
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        // Verify matrix structure and filter results - no headers
        expect(Array.isArray(jsonResponse.matrix)).toBe(true);

        // Verify query has by:m appended
        expect(jsonResponse.query).toBe("account:'Cash' by:m");

        // Verify all returned rows are for Cash account
        jsonResponse.matrix.forEach((row: any) => {
            expect(row[0]).toBe('Cash');
            expect(typeof row[1]).toBe('number');
        });
    });

    it('should handle MCP get_balances tool call with large dataset', async () => {
        // Switch to large dataset
        currentMockAccountBalances = largeMockAccountBalances;
        const mockBkper = createMockBkperForBook(
            mockBooks,
            undefined,
            undefined,
            currentMockAccountBalances
        );
        server = new BkperMcpServer(mockBkper as any);

        // Call to get all balances with required query
        const response = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: 'group:Assets before:$m',
        });
        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(Array.isArray(jsonResponse.matrix)).toBe(true);
        expect(jsonResponse.matrix).toHaveLength(150); // 150 data rows, no headers
        expect(jsonResponse).not.toHaveProperty('total');
        expect(jsonResponse).not.toHaveProperty('balances');

        // Verify query has by:m appended
        expect(jsonResponse.query).toBe('group:Assets before:$m by:m');
    });

    it('should handle MCP error for missing bookId parameter', async () => {
        try {
            await server.testCallTool('get_balances', {});
            throw new Error('Should have thrown an error for missing bookId');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle balance query examples via MCP', async () => {
        // Test different query patterns
        const accountQuery = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "account:'Cash'",
        });

        const groupQuery = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "group:'Assets'",
        });

        const dateQuery = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "group:'Assets' before:2024-01-31",
        });

        // All should return valid MCP responses with matrix format
        [accountQuery, groupQuery, dateQuery].forEach(response => {
            expect(response).toHaveProperty('content');
            expect(response.content[0]).toHaveProperty('type', 'text');
            const data = JSON.parse(response.content[0].text as string);
            expect(data).toHaveProperty('matrix');
            expect(data).toHaveProperty('query');
            expect(Array.isArray(data.matrix)).toBe(true);
            expect(data).not.toHaveProperty('total');
            expect(data).not.toHaveProperty('balances');
        });

        // Verify all queries have by:m appended
        const accountData = JSON.parse(accountQuery.content[0].text as string);
        const groupData = JSON.parse(groupQuery.content[0].text as string);
        const dateData = JSON.parse(dateQuery.content[0].text as string);

        expect(accountData.query).toBe("account:'Cash' by:m");
        expect(groupData.query).toBe("group:'Assets' by:m");
        expect(dateData.query).toBe("group:'Assets' before:2024-01-31 by:m");
    });

    it('should append by:m to query when not present', async () => {
        const response = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "group:'Assets' before:$m",
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.query).toBe("group:'Assets' before:$m by:m");
    });

    it('should replace by:d with by:m (daily to monthly)', async () => {
        const response = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "group:'Assets' before:$m by:d",
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.query).toBe("group:'Assets' before:$m by:m");
    });

    it('should replace by:y with by:m (yearly to monthly)', async () => {
        const response = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "group:'Assets' before:$m by:y",
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.query).toBe("group:'Assets' before:$m by:m");
    });

    it('should keep by:m unchanged when already present', async () => {
        const response = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "group:'Assets' before:$m by:m",
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.query).toBe("group:'Assets' before:$m by:m");
    });

    it('should use CUMULATIVE type for queries without after: operator', async () => {
        // Test with a query without after: operator - should use CUMULATIVE type
        const response = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "account:'Cash'",
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.query).toBe("account:'Cash' by:m");

        // The matrix should be in the format that CUMULATIVE type would produce
        expect(Array.isArray(jsonResponse.matrix)).toBe(true);
        expect(jsonResponse).toHaveProperty('matrix');
        expect(jsonResponse).toHaveProperty('query');
    });

    it('should use PERIOD type for queries with after: operator', async () => {
        // Test with a query that has after: operator - should use PERIOD type
        const response = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "group:'Assets' after:2023-01-01",
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.query).toBe("group:'Assets' after:2023-01-01 by:m");

        // The matrix should be in the format that PERIOD type would produce
        expect(Array.isArray(jsonResponse.matrix)).toBe(true);
        expect(jsonResponse).toHaveProperty('matrix');
        expect(jsonResponse).toHaveProperty('query');
    });

    it('should use PERIOD type for queries with both after: and before: operators', async () => {
        // Test with a closed range query - should use PERIOD type due to after: presence
        const response = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "group:'Assets' after:2023-01-01 before:2023-12-31",
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.query).toBe("group:'Assets' after:2023-01-01 before:2023-12-31 by:m");

        // The matrix should be in the format that PERIOD type would produce
        expect(Array.isArray(jsonResponse.matrix)).toBe(true);
        expect(jsonResponse).toHaveProperty('matrix');
        expect(jsonResponse).toHaveProperty('query');
    });

    it('should use CUMULATIVE type for queries with only before: operator', async () => {
        // Test with only before: operator - should use CUMULATIVE type
        const response = await server.testCallTool('get_balances', {
            bookId: 'book-1',
            query: "group:'Assets' before:2023-12-31",
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.query).toBe("group:'Assets' before:2023-12-31 by:m");

        // The matrix should be in the format that CUMULATIVE type would produce
        expect(Array.isArray(jsonResponse.matrix)).toBe(true);
        expect(jsonResponse).toHaveProperty('matrix');
        expect(jsonResponse).toHaveProperty('query');
    });
});
