import { describe, it, expect, beforeEach } from 'bun:test';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Bkper } from 'bkper-js';
import { BkperMcpServer } from '../../../src/server.js';
import { TransactionData, BookData, BkperMcpServerType } from '../helpers/mock-interfaces.js';
import { createMockBkperForBook } from '../helpers/mock-factory.js';
import { loadTransactions, loadBooks } from '../helpers/fixture-loader.js';

const mockBooks: BookData[] = loadBooks('');
const mockTransactions: TransactionData[] = loadTransactions('');

interface ParsedTransactionCsvResponse {
    metadata: Record<string, string>;
    rows: string[][];
    records: Array<Record<string, string>>;
}

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

function parseTransactionCsvResponse(text: string): ParsedTransactionCsvResponse {
    const [metadataText = '', tableText = ''] = text.split(/\r?\n\r?\n/);
    const metadata: Record<string, string> = {};

    for (const line of metadataText.split(/\r?\n/).filter(row => row.length > 0)) {
        const [key = '', ...valueParts] = line.split(',');
        metadata[key] = valueParts.join(',');
    }

    const rows = parseCsvRows(tableText);
    const headers = rows[0] ?? [];
    const records = rows.slice(1).map(row => {
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
            record[header] = row[index] ?? '';
        });
        return record;
    });

    return { metadata, rows, records };
}

function createServer(transactions: TransactionData[] = mockTransactions): BkperMcpServerType {
    const mockBkper = createMockBkperForBook(mockBooks, undefined, transactions);
    return new BkperMcpServer(mockBkper as unknown as Bkper);
}

describe('MCP Server - list_transactions Tool Registration', () => {
    let server: BkperMcpServerType;

    beforeEach(() => {
        server = createServer();
    });

    it('should register list_transactions tool in MCP tools list', async () => {
        const response = await server.testListTools();
        const listTransactionsTool = response.tools.find(tool => tool.name === 'list_transactions');

        expect(listTransactionsTool).toBeDefined();
        expect(listTransactionsTool?.name).toBe('list_transactions');
        expect(listTransactionsTool?.description).toContain('cursor-based pagination');
        expect(listTransactionsTool?.description).toContain('query filtering');
        expect(listTransactionsTool?.description).toContain('CSV');
        expect(listTransactionsTool?.inputSchema).toHaveProperty('properties');
        expect(listTransactionsTool?.inputSchema.properties).toHaveProperty('bookId');
        expect(listTransactionsTool?.inputSchema.properties).toHaveProperty('query');
        expect(listTransactionsTool?.inputSchema.properties).toHaveProperty('limit');
        expect(listTransactionsTool?.inputSchema.properties).toHaveProperty('cursor');
        expect(listTransactionsTool?.inputSchema.required).toContain('bookId');
        expect(listTransactionsTool?.inputSchema.required).toContain('query');
    });

    it('should handle MCP errors for missing required parameters', async () => {
        await expect(server.testCallTool('list_transactions', { bookId: 'book-1' })).rejects.toThrow();
        await expect(server.testCallTool('list_transactions', { query: "account:'Cash'" })).rejects.toThrow();
    });
});

describe('MCP Server - list_transactions CSV Output', () => {
    let server: BkperMcpServerType;

    beforeEach(() => {
        server = createServer();
    });

    it('should return pagination metadata and a compact CSV transaction table', async () => {
        const response = await server.testCallTool('list_transactions', {
            bookId: 'book-1',
            query: "account:'Cash'",
            limit: 25,
        });

        const parsed = parseTransactionCsvResponse(getText(response));

        expect(parsed.metadata).toEqual({
            hasMore: 'false',
            cursor: '',
            limit: '25',
            query: "account:'Cash'",
        });
        expect(parsed.rows[0]).toContain('Transaction Id');
        expect(parsed.rows[0]).toContain('Origin');
        expect(parsed.rows[0]).toContain('Destination');
        expect(parsed.rows[0]).toContain('invoice_number');
        expect(parsed.records.length).toBeGreaterThan(0);
        expect(parsed.records[0]['Transaction Id']).toBe('txn-1');
        expect(parsed.records[0].Origin).toBe('Service Revenue');
        expect(parsed.records[0].Destination).toBe('Cash');
        expect(parsed.records[0].Date).toBe('2024-01-15');
        expect(parsed.records[0].Amount).toBe('5000.00');
        expect(parsed.records[0].invoice_number).toBe('INV-2024-001');
    });

    it('should include next cursor metadata when another page is available', async () => {
        const response = await server.testCallTool('list_transactions', {
            bookId: 'book-1',
            query: "account:'Cash'",
            limit: 2,
        });

        const parsed = parseTransactionCsvResponse(getText(response));

        expect(parsed.metadata.hasMore).toBe('true');
        expect(parsed.metadata.cursor.length).toBeGreaterThan(0);
        expect(parsed.metadata.limit).toBe('2');
        expect(parsed.records).toHaveLength(2);
    });

    it('should render missing optional transaction fields as blank CSV cells', async () => {
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
        server = createServer([minimalTransaction]);

        const response = await server.testCallTool('list_transactions', {
            bookId: 'book-1',
            query: 'any',
            limit: 25,
        });

        const parsed = parseTransactionCsvResponse(getText(response));

        expect(parsed.records).toHaveLength(1);
        expect(parsed.records[0]['Transaction Id']).toBe('tx-minimal');
        expect(parsed.records[0].Origin).toBe('Account 1');
        expect(parsed.records[0].Destination).toBe('Account 2');
        expect(parsed.records[0].Amount).toBe('100.00');
        expect(parsed.records[0]['Recorded at']).toBe('');
    });
});
