import { describe, it, expect, beforeEach } from 'bun:test';
import { BkperMcpServer } from '../../../src/server.js';
import { TransactionData, BookData, BkperMcpServerType } from '../helpers/mock-interfaces.js';
import { createMockBkperForBook } from '../helpers/mock-factory.js';
import { loadTransactions, loadBooks } from '../helpers/fixture-loader.js';

// Load test data
const mockBooks: BookData[] = loadBooks('');
const mockTransactions: TransactionData[] = loadTransactions('');

describe('MCP Server - list_transactions Tool Registration', () => {
    let server: BkperMcpServerType;

    beforeEach(() => {
        // Create mock with books + transactions support
        const mockBkper = createMockBkperForBook(mockBooks, undefined, mockTransactions);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should register list_transactions tool in MCP tools list', async () => {
        const response = await server.testListTools();

        const listTransactionsTool = response.tools.find(
            (tool: any) => tool.name === 'list_transactions'
        );

        expect(listTransactionsTool).toBeDefined();
        expect(listTransactionsTool!.name).toBe('list_transactions');
        expect(listTransactionsTool!.description).toContain('cursor-based pagination');
        expect(listTransactionsTool!.description).toContain('query filtering');
        expect(listTransactionsTool!.inputSchema).toHaveProperty('properties');
        expect(listTransactionsTool!.inputSchema.properties).toHaveProperty('bookId');
        expect(listTransactionsTool!.inputSchema.properties).toHaveProperty('query');
        expect(listTransactionsTool!.inputSchema.properties).toHaveProperty('limit');
        expect(listTransactionsTool!.inputSchema.properties).toHaveProperty('cursor');
        expect(listTransactionsTool!.inputSchema.required).toContain('bookId');
        expect(listTransactionsTool!.inputSchema.required).toContain('query');
    });

    it('should handle MCP error for missing query parameter', async () => {
        try {
            await server.testCallTool('list_transactions', { bookId: 'book-1' });
            throw new Error('Should have thrown an error for missing query');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle MCP list_transactions tool call', async () => {
        const response = await server.testCallTool('list_transactions', {
            bookId: 'book-1',
            query: "account:'Cash'",
            limit: 25,
        });

        // Verify MCP response structure
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content).toHaveLength(1);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0]).toHaveProperty('text');

        // Parse the JSON response
        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse).toHaveProperty('transactions');
        expect(jsonResponse).toHaveProperty('hasMore');
        expect(jsonResponse).toHaveProperty('cursor');

        // Verify transaction structure
        if (jsonResponse.transactions.length > 0) {
            const transaction = jsonResponse.transactions[0];
            expect(transaction).toHaveProperty('id');
            expect(transaction).toHaveProperty('date');
            expect(transaction).toHaveProperty('amount');
            expect(transaction).toHaveProperty('description');
            expect(transaction).toHaveProperty('posted');
            expect(transaction).toHaveProperty('creditAccount');
            expect(transaction).toHaveProperty('debitAccount');
            expect(transaction).toHaveProperty('properties');
        }
    });

    it('should remove internal/irrelevant fields from transactions', async () => {
        const response = await server.testCallTool('list_transactions', {
            bookId: 'book-1',
            query: "account:'Cash'",
            limit: 25,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        if (jsonResponse.transactions.length > 0) {
            const transaction = jsonResponse.transactions[0];

            // Verify internal fields are removed
            expect(transaction).not.toHaveProperty('agentId');
            expect(transaction).not.toHaveProperty('agentName');
            expect(transaction).not.toHaveProperty('agentLogo');
            expect(transaction).not.toHaveProperty('agentLogoDark');
            expect(transaction).not.toHaveProperty('createdAt');
            expect(transaction).not.toHaveProperty('createdBy');
            expect(transaction).not.toHaveProperty('updatedAt');
            expect(transaction).not.toHaveProperty('dateValue');

            // Verify essential fields are preserved
            expect(transaction).toHaveProperty('id');
            expect(transaction).toHaveProperty('date');
            expect(transaction).toHaveProperty('amount');
            expect(transaction).toHaveProperty('description');
        }
    });

    it('should handle transactions with missing optional fields', async () => {
        // Mock a transaction with only essential fields
        const minimalTransaction: TransactionData = {
            id: 'tx-minimal',
            date: '2024-01-01',
            amount: '100.00',
            description: 'Minimal transaction',
            creditAccount: { id: 'acc-1', name: 'Account 1' },
            debitAccount: { id: 'acc-2', name: 'Account 2' },
            posted: true,
            checked: false,
        };

        // Create a new server with the minimal transaction mock
        const mockBkper = createMockBkperForBook(mockBooks, undefined, [minimalTransaction]);
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('list_transactions', {
            bookId: 'book-1',
            query: 'any',
            limit: 25,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        if (jsonResponse.transactions.length > 0) {
            const transaction = jsonResponse.transactions[0];

            // Should not have internal fields even if they weren't in original
            expect(transaction).not.toHaveProperty('agentId');
            expect(transaction).not.toHaveProperty('createdAt');
            expect(transaction).not.toHaveProperty('dateValue');

            // Should have essential fields
            expect(transaction).toHaveProperty('id', 'tx-minimal');
            expect(transaction).toHaveProperty('amount', '100.00');
        }
    });
});
