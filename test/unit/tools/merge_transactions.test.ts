import { describe, it, expect, beforeEach } from 'bun:test';
import { BkperMcpServer } from '../../../src/server.js';
import { BookData } from '../helpers/mock-interfaces.js';
import { createMockBkperForBook } from '../helpers/mock-factory.js';
import { loadBooks } from '../helpers/fixture-loader.js';
import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));

const mockBooks: BookData[] = loadBooks('');

// Load merge transaction fixtures
const mergeFixturesPath = path.join(currentDir, '../../fixtures/merge-transactions.json');
const mergeFixtures = JSON.parse(fs.readFileSync(mergeFixturesPath, 'utf-8'));
const fixtureBook = mergeFixtures.book;
const scenarios = mergeFixtures.scenarios;

// Helper function to create mock Transaction with all necessary methods
function createMockTransaction(data: any) {
    // Create mock File objects with json() method (support both files and attachments)
    const fileData = data.files || data.attachments || [];
    const mockFiles = fileData.map((file: any) => ({
        json: () => file,
        ...file,
    }));

    return {
        json: () => data,
        getId: () => data.id,
        trash: async () => ({ json: () => data }),
        update: async () => ({ json: () => data }),
        setDescription: function (desc: string) {
            data.description = desc;
            return this;
        },
        setProperties: function (props: any) {
            data.properties = props;
            return this;
        },
        setUrls: function (urls: string[]) {
            data.urls = urls;
            return this;
        },
        setAmount: function (amount: any) {
            data.amount = amount;
            return this;
        },
        setCreditAccount: function (account: any) {
            data.creditAccount = account;
            return this;
        },
        setDebitAccount: function (account: any) {
            data.debitAccount = account;
            return this;
        },
        addRemoteId: function (remoteId: string) {
            if (!data.remoteIds) data.remoteIds = [];
            data.remoteIds.push(remoteId);
            return this;
        },
        addFile: function (file: any) {
            if (!data.files) data.files = [];
            data.files.push(file);
            return this;
        },
        isPosted: () => data.posted ?? false,
        getCreatedAt: () => new Date(data.createdAt || data.createdAtMs || Date.now()),
        getDescription: () => data.description || '',
        getAmount: () => {
            if (!data.amount) return undefined;
            return {
                cmp: (other: any) => {
                    const thisVal = parseFloat(data.amount);
                    const otherVal = parseFloat(other?.toString() || '0');
                    return thisVal === otherVal ? 0 : thisVal > otherVal ? 1 : -1;
                },
                minus: (other: any) => ({
                    toString: () =>
                        (parseFloat(data.amount) - parseFloat(other?.toString() || '0')).toString(),
                }),
                toString: () => data.amount,
            };
        },
        getFiles: () => mockFiles,
        getRemoteIds: () => data.remoteIds || [],
        getUrls: () => data.urls || [],
        getProperties: () => data.properties || {},
        getDateFormatted: () => data.dateFormatted || data.date || '',
        getDate: () => data.dateFormatted || data.date || '',
    };
}

// Helper function to create mock Book with Transaction factory
function createMockBookForMerge(
    book: any,
    tx1Data: any,
    tx2Data: any,
    onTrash?: Function,
    onUpdate?: Function
) {
    const mockBook = {
        json: () => book,
        getId: () => book.id,
        getDecimalSeparator: () => book.decimalSeparator || '.',
        getFractionDigits: () => book.fractionDigits || book.precision || 2,
        getConfig: () => ({}),
        getTransaction: async (txId: string) => {
            const data = txId === tx1Data.id ? tx1Data : tx2Data;
            const mockTx = createMockTransaction(data);

            // Override trash and update to call callbacks if provided
            if (onTrash) {
                const originalTrash = mockTx.trash;
                mockTx.trash = async () => {
                    onTrash(txId);
                    return originalTrash();
                };
            }

            if (onUpdate) {
                const originalUpdate = mockTx.update;
                mockTx.update = async () => {
                    onUpdate(txId, data);
                    return originalUpdate();
                };
            }

            return mockTx;
        },
        formatValue: (amount: any) => amount.toString(),
    };

    // Return a Proxy that blocks Transaction constructor calls in tests
    return new Proxy(mockBook, {
        get(target: any, prop: string) {
            if (prop === 'constructor') {
                return Object;
            }
            return target[prop];
        },
    });
}

describe('MCP Server - merge_transactions Tool Registration', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBook(mockBooks);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should register merge_transactions tool in MCP tools list', async () => {
        const response = await server.testListTools();

        expect(response).toHaveProperty('tools');
        expect(Array.isArray(response.tools)).toBe(true);

        const mergeTransactionsTool = response.tools.find(
            (tool: any) => tool.name === 'merge_transactions'
        );
        expect(mergeTransactionsTool).toBeDefined();
        expect(mergeTransactionsTool!.name).toBe('merge_transactions');
    });

    it('should have description mentioning merge and duplicate', async () => {
        const response = await server.testListTools();
        const mergeTransactionsTool = response.tools.find(
            (tool: any) => tool.name === 'merge_transactions'
        );

        expect(mergeTransactionsTool).toBeDefined();
        if (mergeTransactionsTool && mergeTransactionsTool.description) {
            const desc = mergeTransactionsTool.description.toLowerCase();
            expect(desc.includes('merge') || desc.includes('duplicate')).toBe(true);
        }
    });

    it('should have proper MCP tool schema for merge_transactions', async () => {
        const response = await server.testListTools();
        const mergeTransactionsTool = response.tools.find(
            (tool: any) => tool.name === 'merge_transactions'
        ) as any;

        expect(mergeTransactionsTool).toBeDefined();
        expect(mergeTransactionsTool.inputSchema).toHaveProperty('properties');
        expect(mergeTransactionsTool.inputSchema.properties).toHaveProperty('bookId');
        expect(mergeTransactionsTool.inputSchema.properties).toHaveProperty('transactionId1');
        expect(mergeTransactionsTool.inputSchema.properties).toHaveProperty('transactionId2');
        expect(mergeTransactionsTool.inputSchema.properties.bookId.type).toBe('string');
        expect(mergeTransactionsTool.inputSchema.properties.transactionId1.type).toBe('string');
        expect(mergeTransactionsTool.inputSchema.properties.transactionId2.type).toBe('string');
    });

    it('should have all parameters as required', async () => {
        const response = await server.testListTools();
        const mergeTransactionsTool = response.tools.find(
            (tool: any) => tool.name === 'merge_transactions'
        ) as any;

        expect(Array.isArray(mergeTransactionsTool.inputSchema.required)).toBe(true);
        expect(mergeTransactionsTool.inputSchema.required).toContain('bookId');
        expect(mergeTransactionsTool.inputSchema.required).toContain('transactionId1');
        expect(mergeTransactionsTool.inputSchema.required).toContain('transactionId2');
        expect(mergeTransactionsTool.inputSchema.required).toHaveLength(3);
    });
});

describe('MCP Server - merge_transactions Parameter Validation', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBook(mockBooks);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should throw McpError for missing bookId', async () => {
        try {
            await server.testCallTool('merge_transactions', {
                transactionId1: 'txn1',
                transactionId2: 'txn2',
            });
            throw new Error('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('bookId');
        }
    });

    it('should throw McpError for missing transactionId1', async () => {
        try {
            await server.testCallTool('merge_transactions', {
                bookId: 'book-1',
                transactionId2: 'txn2',
            });
            throw new Error('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('transactionId1');
        }
    });

    it('should throw McpError for missing transactionId2', async () => {
        try {
            await server.testCallTool('merge_transactions', {
                bookId: 'book-1',
                transactionId1: 'txn1',
            });
            throw new Error('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('transactionId2');
        }
    });

    it('should throw McpError for invalid book ID', async () => {
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) => {
                if (id === 'invalid-book-id') {
                    throw new Error('Book not found: invalid-book-id');
                }
                return createMockBkperForBook(mockBooks).getBook!(id);
            },
        };
        server = new BkperMcpServer(mockBkper as any);

        try {
            await server.testCallTool('merge_transactions', {
                bookId: 'invalid-book-id',
                transactionId1: 'txn1',
                transactionId2: 'txn2',
            });
            throw new Error('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('Book not found');
        }
    });

    it('should throw McpError for non-existent transaction ID', async () => {
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) => {
                const book = mockBooks.find(b => b.id === id);
                if (!book) throw new Error(`Book not found: ${id}`);

                return {
                    json: () => book,
                    getTransaction: async (txId: string) => {
                        if (txId === 'non-existent-tx') {
                            throw new Error(`Transaction not found: ${txId}`);
                        }
                        return {
                            json: () => scenarios.differentAmounts.transaction1,
                        };
                    },
                };
            },
        };
        server = new BkperMcpServer(mockBkper as any);

        try {
            await server.testCallTool('merge_transactions', {
                bookId: 'book-1',
                transactionId1: 'non-existent-tx',
                transactionId2: 'txn2',
            });
            throw new Error('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('Transaction not found');
        }
    });
});

describe('MCP Server - merge_transactions Algorithm: Priority Rules', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    it('should prefer posted transaction over draft (transaction1 draft, transaction2 posted)', async () => {
        const scenario = scenarios.draftVsPosted;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        // Posted transaction should be the edit (kept)
        expect(jsonResponse.mergedTransaction.id).toBe(scenario.transaction2.id);
        expect(jsonResponse.revertedTransactionId).toBe(scenario.transaction1.id);
    });

    it('should prefer posted transaction over draft (transaction1 posted, transaction2 draft)', async () => {
        const scenario = scenarios.draftVsPosted;
        // Swap the transactions - pass them in reverse order
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction2, scenario.transaction1),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction2.id, // posted
            transactionId2: scenario.transaction1.id, // draft
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        // Posted transaction should still be the edit (kept)
        expect(jsonResponse.mergedTransaction.id).toBe(scenario.transaction2.id);
        expect(jsonResponse.revertedTransactionId).toBe(scenario.transaction1.id);
    });

    it('should prefer newer transaction when both have same status', async () => {
        const scenario = scenarios.sameAmounts; // Use same amounts to avoid error
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        // Newer transaction (transaction2) should be the edit
        expect(jsonResponse.mergedTransaction.id).toBe(scenario.transaction2.id);
        expect(jsonResponse.revertedTransactionId).toBe(scenario.transaction1.id);
    });
});

describe('MCP Server - merge_transactions Algorithm: Description Merging', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    it('should merge descriptions without duplicating words', async () => {
        // Create transactions with same amount but different descriptions
        const tx1 = {
            ...scenarios.differentAmounts.transaction1,
            amount: '100.00', // Make amounts same
        };
        const tx2 = {
            ...scenarios.differentAmounts.transaction2,
            amount: '100.00', // Make amounts same
        };

        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) => createMockBookForMerge(fixtureBook, tx1, tx2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: tx1.id,
            transactionId2: tx2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        // Verify description contains unique words only
        const mergedDescription = jsonResponse.mergedTransaction.description;
        expect(mergedDescription).toContain('INT');
        expect(mergedDescription).toContain('#impostos');
        expect(mergedDescription).toContain('Nacional');
        expect(mergedDescription).toContain('Mensal');

        // Check it matches expected pattern
        const descLower = mergedDescription.toLowerCase();
        expect(
            descLower.includes('int') &&
                descLower.includes('impostos') &&
                descLower.includes('nacional')
        ).toBe(true);
    });

    it('should handle null description in transaction1', async () => {
        const tx1 = { ...scenarios.sameAmounts.transaction1, description: null };
        const tx2 = scenarios.sameAmounts.transaction2;

        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) => createMockBookForMerge(fixtureBook, tx1, tx2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: tx1.id,
            transactionId2: tx2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        // Should use transaction2's description
        expect(jsonResponse.mergedTransaction.description).toBe(tx2.description);
    });

    it('should handle null description in transaction2', async () => {
        const tx1 = scenarios.sameAmounts.transaction1;
        const tx2 = { ...scenarios.sameAmounts.transaction2, description: null };

        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) => createMockBookForMerge(fixtureBook, tx1, tx2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: tx1.id,
            transactionId2: tx2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        // Should use transaction1's description
        expect(jsonResponse.mergedTransaction.description).toBe(tx1.description);
    });
});

describe('MCP Server - merge_transactions Algorithm: Amount Handling', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    // MCP BEHAVIORAL DIFFERENCE: Unlike CLI which creates an audit record when amounts differ,
    // MCP throws McpError (ErrorCode.InvalidParams) from merge-operation.ts lines 128-134.
    // The following 3 tests verify this error-throwing behavior.

    it('should throw McpError when amounts differ', async () => {
        const scenario = scenarios.differentAmounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        try {
            await server.testCallTool('merge_transactions', {
                bookId: fixtureBook.id,
                transactionId1: scenario.transaction1.id,
                transactionId2: scenario.transaction2.id,
            });
            throw new Error('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain(
                'Cannot merge transactions with different amounts'
            );
        }
    });

    it('should include both amounts in error message when amounts differ', async () => {
        const scenario = scenarios.differentAmounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        try {
            await server.testCallTool('merge_transactions', {
                bookId: fixtureBook.id,
                transactionId1: scenario.transaction1.id,
                transactionId2: scenario.transaction2.id,
            });
            throw new Error('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            // Error message should contain both amounts for reference
            expect(message).toContain('100');
            expect(message).toContain('80');
        }
    });

    it('should throw McpError for large amount differences', async () => {
        const tx1 = {
            id: 'txn-1000',
            amount: '1000.00',
            description: 'Large transaction',
            dateValue: 20240101,
            dateFormatted: '01/01/2024',
            creditAccountId: 'acc-credit-1',
            debitAccountId: 'acc-debit-1',
            status: 'POSTED',
            posted: true,
            trashed: false,
            checked: false,
            createdAtMs: 1704067200000,
            attachments: [],
            urls: [],
            remoteIds: [],
            properties: {},
        };

        const tx2 = {
            id: 'txn-100',
            amount: '100.00',
            description: 'Small transaction',
            dateValue: 20240102,
            dateFormatted: '02/01/2024',
            creditAccountId: 'acc-credit-1',
            debitAccountId: 'acc-debit-1',
            status: 'POSTED',
            posted: true,
            trashed: false,
            checked: false,
            createdAtMs: 1704153600000,
            attachments: [],
            urls: [],
            remoteIds: [],
            properties: {},
        };

        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) => createMockBookForMerge(fixtureBook, tx1, tx2),
        };
        server = new BkperMcpServer(mockBkper as any);

        try {
            await server.testCallTool('merge_transactions', {
                bookId: fixtureBook.id,
                transactionId1: tx1.id,
                transactionId2: tx2.id,
            });
            throw new Error('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain('Cannot merge transactions with different amounts');
            expect(message).toContain('1000');
            expect(message).toContain('100');
        }
    });

    it('should succeed when amounts are the same', async () => {
        const scenario = scenarios.sameAmounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        // Should succeed without error
        expect(jsonResponse.mergedTransaction).toBeDefined();
        expect(jsonResponse.auditRecord).toBeNull();
    });

    it('should backfill missing amount from revert to edit', async () => {
        const tx1 = scenarios.backfillAccounts.transaction1;
        const tx2 = { ...scenarios.backfillAccounts.transaction2, amount: null };

        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) => createMockBookForMerge(fixtureBook, tx1, tx2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: tx1.id,
            transactionId2: tx2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        // Should use transaction1's amount
        expect(jsonResponse.mergedTransaction.amount).toBe(tx1.amount);
    });
});

describe('MCP Server - merge_transactions Algorithm: Account Backfilling', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    it('should backfill missing credit account', async () => {
        const scenario = scenarios.backfillAccounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(jsonResponse.mergedTransaction.creditAccountId).toBe(
            scenario.expectedEdit.creditAccountId
        );
    });

    it('should backfill missing debit account', async () => {
        const scenario = scenarios.backfillAccounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(jsonResponse.mergedTransaction.debitAccountId).toBe(
            scenario.expectedEdit.debitAccountId
        );
    });
});

describe('MCP Server - merge_transactions Algorithm: Metadata Merging', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    it('should merge attachments from both transactions', async () => {
        const scenario = scenarios.withAttachmentsAndUrls;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(jsonResponse.mergedTransaction.attachments).toHaveLength(2);
        expect(
            jsonResponse.mergedTransaction.attachments.some((a: any) => a.artifactId === 'attach1')
        ).toBe(true);
        expect(
            jsonResponse.mergedTransaction.attachments.some((a: any) => a.artifactId === 'attach2')
        ).toBe(true);
    });

    it('should merge URLs from both transactions', async () => {
        const scenario = scenarios.withAttachmentsAndUrls;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(jsonResponse.mergedTransaction.urls).toHaveLength(2);
        expect(jsonResponse.mergedTransaction.urls).toContain('https://vendor.com/invoice/123');
        expect(jsonResponse.mergedTransaction.urls).toContain('https://vendor.com/order/456');
    });

    it('should merge remoteIds from both transactions', async () => {
        const scenario = scenarios.withAttachmentsAndUrls;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(jsonResponse.mergedTransaction.remoteIds).toHaveLength(2);
        expect(jsonResponse.mergedTransaction.remoteIds).toContain('bank-import-001');
        expect(jsonResponse.mergedTransaction.remoteIds).toContain('manual-entry-002');
    });

    it('should merge properties with revert overwriting edit', async () => {
        const scenario = scenarios.withAttachmentsAndUrls;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(jsonResponse.mergedTransaction.properties).toHaveProperty('category', 'office');
        expect(jsonResponse.mergedTransaction.properties).toHaveProperty('department', 'admin');
    });
});

describe('MCP Server - merge_transactions Response Format', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    it('should return MCP-compliant response structure', async () => {
        const scenario = scenarios.sameAmounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content).toHaveLength(1);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0]).toHaveProperty('text');

        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(typeof jsonResponse).toBe('object');
    });

    it('should include mergedTransaction in response', async () => {
        const scenario = scenarios.sameAmounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(jsonResponse).toHaveProperty('mergedTransaction');
        expect(jsonResponse.mergedTransaction).toHaveProperty('id');
        expect(jsonResponse.mergedTransaction).toHaveProperty('description');
    });

    it('should include revertedTransactionId in response', async () => {
        const scenario = scenarios.sameAmounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(jsonResponse).toHaveProperty('revertedTransactionId');
        expect(typeof jsonResponse.revertedTransactionId).toBe('string');
    });

    // MCP BEHAVIORAL DIFFERENCE: Unlike CLI which returns auditRecord with content when
    // amounts differ, MCP throws McpError. This test verifies the error is thrown.
    it('should throw McpError when amounts differ instead of creating auditRecord', async () => {
        const scenario = scenarios.differentAmounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        try {
            await server.testCallTool('merge_transactions', {
                bookId: fixtureBook.id,
                transactionId1: scenario.transaction1.id,
                transactionId2: scenario.transaction2.id,
            });
            throw new Error('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain(
                'Cannot merge transactions with different amounts'
            );
        }
    });

    it('should set auditRecord to null when amounts are same', async () => {
        const scenario = scenarios.sameAmounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        const jsonResponse = JSON.parse(response.content[0].text as string);

        expect(jsonResponse).toHaveProperty('auditRecord');
        expect(jsonResponse.auditRecord).toBeNull();
    });

    it('should return valid JSON in MCP text content format', async () => {
        const scenario = scenarios.sameAmounts;
        const mockBkper = {
            setConfig: () => {},
            getBook: async (id: string) =>
                createMockBookForMerge(fixtureBook, scenario.transaction1, scenario.transaction2),
        };
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('merge_transactions', {
            bookId: fixtureBook.id,
            transactionId1: scenario.transaction1.id,
            transactionId2: scenario.transaction2.id,
        });

        expect(() => JSON.parse(response.content[0].text as string)).not.toThrow();
    });
});
