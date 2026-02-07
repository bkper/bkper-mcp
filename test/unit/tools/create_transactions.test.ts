import { describe, it, expect, beforeEach } from 'bun:test';
import { BkperMcpServer } from '../../../src/server.js';
import { BookData } from '../helpers/mock-interfaces.js';
import { createMockBkperForBook } from '../helpers/mock-factory.js';
import { loadBooks, loadTransactionTexts } from '../helpers/fixture-loader.js';

// Load test data
const mockBooks: BookData[] = loadBooks('');
const transactionTextsData = loadTransactionTexts('');
const validTransactions = transactionTextsData.validTransactions;
const createdTransactions = transactionTextsData.createdTransactions;

describe('MCP Server - create_transactions Tool Registration', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBook(mockBooks, undefined, createdTransactions);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should register create_transactions tool in MCP tools list', async () => {
        const response = await server.testListTools();

        expect(response).toHaveProperty('tools');
        expect(Array.isArray(response.tools)).toBe(true);

        const createTransactionsTool = response.tools.find(
            (tool: any) => tool.name === 'create_transactions'
        );
        expect(createTransactionsTool).toBeDefined();
        expect(createTransactionsTool!.name).toBe('create_transactions');
    });

    it('should have description mentioning structured data', async () => {
        const response = await server.testListTools();
        const createTransactionsTool = response.tools.find(
            (tool: any) => tool.name === 'create_transactions'
        );

        expect(createTransactionsTool).toBeDefined();
        if (createTransactionsTool) {
            expect(createTransactionsTool.description).toContain('structured');
        }
    });

    it('should have proper MCP tool schema for create_transactions', async () => {
        const response = await server.testListTools();
        const createTransactionsTool = response.tools.find(
            (tool: any) => tool.name === 'create_transactions'
        ) as any;

        expect(createTransactionsTool).toBeDefined();
        expect(createTransactionsTool.inputSchema).toHaveProperty('properties');
        expect(createTransactionsTool.inputSchema.properties).toHaveProperty('bookId');
        expect(createTransactionsTool.inputSchema.properties).toHaveProperty('transactions');
        expect(createTransactionsTool.inputSchema.properties.bookId.type).toBe('string');
        expect(createTransactionsTool.inputSchema.properties.transactions.type).toBe('array');
    });

    it('should have bookId and transactions as required parameters', async () => {
        const response = await server.testListTools();
        const createTransactionsTool = response.tools.find(
            (tool: any) => tool.name === 'create_transactions'
        ) as any;

        expect(Array.isArray(createTransactionsTool.inputSchema.required)).toBe(true);
        expect(createTransactionsTool.inputSchema.required).toContain('bookId');
        expect(createTransactionsTool.inputSchema.required).toContain('transactions');
    });

    it('should have transaction schema with required and optional fields', async () => {
        const response = await server.testListTools();
        const createTransactionsTool = response.tools.find(
            (tool: any) => tool.name === 'create_transactions'
        ) as any;

        expect(createTransactionsTool.inputSchema.properties.transactions.items).toBeDefined();
        expect(createTransactionsTool.inputSchema.properties.transactions.items.type).toBe(
            'object'
        );
        expect(
            createTransactionsTool.inputSchema.properties.transactions.items.properties
        ).toHaveProperty('date');
        expect(
            createTransactionsTool.inputSchema.properties.transactions.items.properties
        ).toHaveProperty('amount');
        expect(
            createTransactionsTool.inputSchema.properties.transactions.items.properties
        ).toHaveProperty('from_account');
        expect(
            createTransactionsTool.inputSchema.properties.transactions.items.properties
        ).toHaveProperty('to_account');
        expect(
            createTransactionsTool.inputSchema.properties.transactions.items.properties
        ).toHaveProperty('description');

        // Verify only date, amount, and description are required
        expect(
            Array.isArray(createTransactionsTool.inputSchema.properties.transactions.items.required)
        ).toBe(true);
        expect(createTransactionsTool.inputSchema.properties.transactions.items.required).toContain(
            'date'
        );
        expect(createTransactionsTool.inputSchema.properties.transactions.items.required).toContain(
            'amount'
        );
        expect(createTransactionsTool.inputSchema.properties.transactions.items.required).toContain(
            'description'
        );
        expect(
            createTransactionsTool.inputSchema.properties.transactions.items.required
        ).not.toContain('from_account');
        expect(
            createTransactionsTool.inputSchema.properties.transactions.items.required
        ).not.toContain('to_account');
    });
});

describe('MCP Server - create_transactions Basic Functionality', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBook(mockBooks, undefined, createdTransactions);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should successfully create transactions from structured data', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: validTransactions,
        });

        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content).toHaveLength(1);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0]).toHaveProperty('text');

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse).toHaveProperty('transactions');
        expect(Array.isArray(jsonResponse.transactions)).toBe(true);
    });

    it('should return created transactions with IDs', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: validTransactions,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(jsonResponse.transactions).toHaveLength(validTransactions.length);
        jsonResponse.transactions.forEach((tx: any) => {
            expect(tx).toHaveProperty('id');
            expect(typeof tx.id).toBe('string');
            expect(tx.id).not.toBe('');
        });
    });

    it('should return MCP-compliant response structure', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: validTransactions,
        });

        expect(response.content[0].type).toBe('text');
        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(typeof jsonResponse).toBe('object');
        expect(Array.isArray(jsonResponse.transactions)).toBe(true);
    });
});

describe('MCP Server - create_transactions Batch Processing', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBook(mockBooks, undefined, createdTransactions);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should create single transaction', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: [validTransactions[0]],
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.transactions).toHaveLength(1);
    });

    it('should create multiple transactions in one call', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: validTransactions,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.transactions).toHaveLength(validTransactions.length);
    });

    it('should return all created transactions', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: validTransactions,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(Array.isArray(jsonResponse.transactions)).toBe(true);
        jsonResponse.transactions.forEach((tx: any) => {
            expect(tx).toHaveProperty('id');
            expect(tx).toHaveProperty('date');
            expect(tx).toHaveProperty('amount');
            expect(tx).toHaveProperty('description');
        });
    });

    it('should handle empty array', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: [],
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(Array.isArray(jsonResponse.transactions)).toBe(true);
        expect(jsonResponse.transactions).toHaveLength(0);
    });
});

describe('MCP Server - create_transactions Parameter Validation', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBook(mockBooks, undefined, createdTransactions);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should throw McpError for missing bookId', async () => {
        try {
            await server.testCallTool('create_transactions', {
                transactions: validTransactions,
            });
            throw new Error('Should have thrown an error for missing bookId');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('bookId');
        }
    });

    it('should throw McpError for missing transactions', async () => {
        try {
            await server.testCallTool('create_transactions', {
                bookId: 'book-1',
            });
            throw new Error('Should have thrown an error for missing transactions');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('transactions');
        }
    });

    it('should throw McpError for non-array transactions', async () => {
        try {
            await server.testCallTool('create_transactions', {
                bookId: 'book-1',
                transactions: 'not an array',
            });
            throw new Error('Should have thrown an error for non-array transactions');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('transactions');
        }
    });

    it('should throw McpError for invalid book ID', async () => {
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) => {
                if (id === 'invalid-book-id') {
                    throw new Error('Book not found: invalid-book-id');
                }
                return createMockBkperForBook(mockBooks, undefined, createdTransactions).getBook!(
                    id
                );
            },
        };
        server = new BkperMcpServer(mockBkper as any);

        try {
            await server.testCallTool('create_transactions', {
                bookId: 'invalid-book-id',
                transactions: validTransactions,
            });
            throw new Error('Should have thrown an error for invalid book ID');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('Book not found');
        }
    });

    it('should throw McpError for missing date field', async () => {
        try {
            await server.testCallTool('create_transactions', {
                bookId: 'book-1',
                transactions: [
                    {
                        amount: 500,
                        from_account: 'Cash',
                        to_account: 'Rent',
                        description: 'test',
                    },
                ],
            });
            throw new Error('Should have thrown an error for missing date');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('date');
        }
    });

    it('should throw McpError for missing amount field', async () => {
        try {
            await server.testCallTool('create_transactions', {
                bookId: 'book-1',
                transactions: [
                    {
                        date: '2025-01-15',
                        from_account: 'Cash',
                        to_account: 'Rent',
                        description: 'test',
                    },
                ],
            });
            throw new Error('Should have thrown an error for missing amount');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('amount');
        }
    });

    it('should accept transaction with missing from_account field', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: [
                {
                    date: '2025-01-15',
                    amount: 500,
                    to_account: 'Rent',
                    description: 'test',
                },
            ],
        });

        expect(response).toHaveProperty('content');
        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.transactions).toHaveLength(1);
    });

    it('should accept transaction with missing to_account field', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: [
                {
                    date: '2025-01-15',
                    amount: 500,
                    from_account: 'Cash',
                    description: 'test',
                },
            ],
        });

        expect(response).toHaveProperty('content');
        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.transactions).toHaveLength(1);
    });

    it('should throw McpError for missing description field', async () => {
        try {
            await server.testCallTool('create_transactions', {
                bookId: 'book-1',
                transactions: [
                    {
                        date: '2025-01-15',
                        amount: 500,
                        from_account: 'Cash',
                        to_account: 'Rent',
                    },
                ],
            });
            throw new Error('Should have thrown an error for missing description');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('description');
        }
    });

    it('should accept empty string from_account when provided', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: [
                {
                    date: '2025-01-15',
                    amount: 500,
                    from_account: '',
                    to_account: 'Rent',
                    description: 'test',
                },
            ],
        });

        expect(response).toHaveProperty('content');
        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.transactions).toHaveLength(1);
    });

    it('should accept empty string to_account when provided', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: [
                {
                    date: '2025-01-15',
                    amount: 500,
                    from_account: 'Cash',
                    to_account: '',
                    description: 'test',
                },
            ],
        });

        expect(response).toHaveProperty('content');
        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.transactions).toHaveLength(1);
    });

    it('should throw McpError for empty string description', async () => {
        try {
            await server.testCallTool('create_transactions', {
                bookId: 'book-1',
                transactions: [
                    {
                        date: '2025-01-15',
                        amount: 500,
                        from_account: 'Cash',
                        to_account: 'Rent',
                        description: '',
                    },
                ],
            });
            throw new Error('Should have thrown an error for empty description');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('description');
        }
    });
});

describe('MCP Server - create_transactions Optional Account Fields', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBook(mockBooks, undefined, createdTransactions);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should create transaction with only description (no accounts)', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: [
                {
                    date: '2025-01-15',
                    amount: 500,
                    description: 'Payment received',
                },
            ],
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.transactions).toHaveLength(1);
        expect(jsonResponse.transactions[0]).toHaveProperty('description', 'Payment received');
    });

    it('should create transaction with only from_account', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: [
                {
                    date: '2025-01-15',
                    amount: 500,
                    from_account: 'Cash',
                    description: 'Withdrawal',
                },
            ],
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.transactions).toHaveLength(1);
        expect(jsonResponse.transactions[0]).toHaveProperty('description', 'Cash Withdrawal');
    });

    it('should create transaction with only to_account', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: [
                {
                    date: '2025-01-15',
                    amount: 500,
                    to_account: 'Revenue',
                    description: 'Sale',
                },
            ],
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.transactions).toHaveLength(1);
        expect(jsonResponse.transactions[0]).toHaveProperty('description', 'Revenue Sale');
    });

    it('should create transaction with both accounts', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: [
                {
                    date: '2025-01-15',
                    amount: 500,
                    from_account: 'Cash',
                    to_account: 'Rent',
                    description: 'Monthly rent',
                },
            ],
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse.transactions).toHaveLength(1);
        expect(jsonResponse.transactions[0]).toHaveProperty(
            'description',
            'Cash Rent Monthly rent'
        );
    });
});

describe('MCP Server - create_transactions Response Format', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBook(mockBooks, undefined, createdTransactions);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should have transactions array in response', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: validTransactions,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse).toHaveProperty('transactions');
        expect(Array.isArray(jsonResponse.transactions)).toBe(true);
    });

    it('should include standard transaction fields', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: validTransactions,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        const transaction = jsonResponse.transactions[0];

        expect(transaction).toHaveProperty('id');
        expect(transaction).toHaveProperty('date');
        expect(transaction).toHaveProperty('amount');
        expect(transaction).toHaveProperty('description');
        expect(transaction).toHaveProperty('posted');
        expect(transaction).toHaveProperty('checked');
    });

    it('should remove internal fields from transactions', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: validTransactions,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        const transaction = jsonResponse.transactions[0];

        expect(transaction).not.toHaveProperty('agentId');
        expect(transaction).not.toHaveProperty('agentName');
        expect(transaction).not.toHaveProperty('agentLogo');
        expect(transaction).not.toHaveProperty('agentLogoDark');
        expect(transaction).not.toHaveProperty('createdAt');
        expect(transaction).not.toHaveProperty('createdBy');
        expect(transaction).not.toHaveProperty('updatedAt');
        expect(transaction).not.toHaveProperty('dateValue');
    });

    it('should return valid JSON in MCP text content format', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: validTransactions,
        });

        expect(() => JSON.parse(response.content[0].text as string)).not.toThrow();
    });

    it('should preserve transaction account information', async () => {
        const response = await server.testCallTool('create_transactions', {
            bookId: 'book-1',
            transactions: validTransactions,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);
        const transaction = jsonResponse.transactions[0];

        if (transaction.creditAccount) {
            expect(transaction.creditAccount).toHaveProperty('name');
            expect(transaction.creditAccount).toHaveProperty('type');
        }

        if (transaction.debitAccount) {
            expect(transaction.debitAccount).toHaveProperty('name');
            expect(transaction.debitAccount).toHaveProperty('type');
        }
    });
});
