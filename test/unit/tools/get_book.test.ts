import { describe, it, expect, beforeEach } from 'bun:test';
import { BkperMcpServer } from '../../../src/server.js';
import { BookData, GroupData, MockBkper } from '../helpers/mock-interfaces.js';
import { loadBooks } from '../helpers/fixture-loader.js';

// Load test data
const mockBooks: BookData[] = loadBooks('');

// Transform fixture groups to GroupData format
function transformGroupsToGroupData(book: BookData): GroupData[] {
    if (!book.groups) return [];

    return book.groups.map((group: any) => ({
        id: group.id,
        name: group.name,
        type: group.type,
        hidden: group.hidden,
        permanent: group.permanent,
        parent: group.parent,
        properties: group.properties,
    }));
}

// Create a mock that returns book-specific groups
function createMockBkperForBookWithGroups(books: BookData[]): MockBkper {
    return {
        setConfig: () => {},
        getBook: async (id: string) => {
            const book = books.find(b => b.id === id);
            if (!book) {
                throw new Error(`Book not found: ${id}`);
            }

            return {
                json: (): BookData => {
                    // Return book data without groups, since they'll be added by the tool
                    const { groups, ...bookWithoutGroups } = book;
                    return bookWithoutGroups as BookData;
                },
                getGroups: async () => {
                    const groupsData = transformGroupsToGroupData(book);

                    // Create mock groups with proper parent-child relationships
                    const groupMap = new Map();
                    const mockGroups: any[] = [];

                    // First pass: create all mock groups
                    groupsData.forEach((groupData: GroupData) => {
                        const mockGroup = {
                            getId: (): string => groupData.id || '',
                            getName: (): string => groupData.name || '',
                            getType: (): string => groupData.type || '',
                            isHidden: (): boolean => groupData.hidden || false,
                            isPermanent: (): boolean => groupData.permanent || false,
                            getParent: (): any => null, // Will be set in second pass
                            getChildren: (): any[] => [], // Will be populated in second pass
                            getProperties: (): { [name: string]: string } =>
                                groupData.properties || {},
                            json: (): GroupData => groupData,
                        };

                        mockGroups.push(mockGroup);
                        if (groupData.id) {
                            groupMap.set(groupData.id, mockGroup);
                        }
                    });

                    // Second pass: set up parent-child relationships
                    groupsData.forEach((groupData: GroupData, index: number) => {
                        const mockGroup = mockGroups[index];

                        // Set parent
                        if (groupData.parent?.id) {
                            const parent = groupMap.get(groupData.parent.id);
                            if (parent) {
                                mockGroup.getParent = () => parent;
                            }
                        }

                        // Set children
                        const children = mockGroups.filter(
                            (_: any, childIndex: number) =>
                                groupsData[childIndex].parent?.id === groupData.id
                        );
                        mockGroup.getChildren = () => children;
                    });

                    return mockGroups;
                },
            };
        },
    };
}

describe('MCP Server - get_book Tool Registration', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBookWithGroups(mockBooks);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should register get_book tool in MCP tools list', async () => {
        const response = await server.testListTools();

        const getBookTool = response.tools.find((tool: any) => tool.name === 'get_book');

        expect(getBookTool).toBeDefined();
        expect(getBookTool!.name).toBe('get_book');
        expect(getBookTool!.description).toContain('detailed information');
        expect(getBookTool!.inputSchema).toHaveProperty('properties');
        expect(getBookTool!.inputSchema.properties).toHaveProperty('bookId');
        expect(getBookTool!.inputSchema.required).toContain('bookId');
    });

    it('should have proper MCP tool schema for get_book', async () => {
        const response = await server.testListTools();
        const getBookTool = response.tools.find((tool: any) => tool.name === 'get_book');

        expect(getBookTool).toBeDefined();
        expect(getBookTool!.inputSchema).toEqual({
            type: 'object',
            properties: {
                bookId: {
                    type: 'string',
                    description: 'The unique identifier of the book to retrieve',
                },
            },
            required: ['bookId'],
        });
    });
});

describe('MCP Server - get_book Tool Calls', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        const mockBkper = createMockBkperForBookWithGroups(mockBooks);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should handle MCP get_book tool call for valid book ID', async () => {
        const response = await server.testCallTool('get_book', { bookId: 'book-1' });

        // Verify MCP response structure
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content).toHaveLength(1);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0]).toHaveProperty('text');

        // Parse the JSON response
        const jsonResponse = JSON.parse(response.content[0].text as string);
        expect(jsonResponse).toHaveProperty('book');
        expect(jsonResponse).toHaveProperty('readme');

        const book = jsonResponse.book;
        expect(book).toHaveProperty('id', 'book-1');
        expect(book).toHaveProperty('name', 'Test Company Ltd');
        expect(book).toHaveProperty('timeZone');
        expect(book).toHaveProperty('fractionDigits');
        expect(book).toHaveProperty('decimalSeparator');
        expect(book).toHaveProperty('datePattern');
        expect(book).toHaveProperty('permission');
        expect(book).toHaveProperty('visibility');

        // Verify groups structure (now inside book object)
        const groups = book.groups;
        expect(Array.isArray(groups)).toBe(true);

        // Verify hierarchical structure exists
        expect(groups.length).toBeGreaterThan(0);

        // Find Assets root group
        const assetsGroup = groups.find((g: any) => g.name === 'Assets');
        expect(assetsGroup).toBeDefined();
        expect(assetsGroup.id).toBe('group-assets');
        expect(assetsGroup.type).toBe('INCOMING');
        expect(assetsGroup.permanent).toBe(true);
        expect(assetsGroup.children).toBeDefined();
        expect(Array.isArray(assetsGroup.children)).toBe(true);
        expect(assetsGroup.children.length).toBeGreaterThan(0);

        // Verify nested structure (Current Assets under Assets)
        const currentAssets = assetsGroup.children.find((g: any) => g.name === 'Current Assets');
        expect(currentAssets).toBeDefined();
        expect(Array.isArray(currentAssets.children)).toBe(true);
        expect(currentAssets.children.length).toBeGreaterThan(0);

        // Verify deep nesting (Cash under Current Assets)
        const cashGroup = currentAssets.children.find((g: any) => g.name === 'Cash');
        expect(cashGroup).toBeDefined();
        expect(cashGroup.properties).toEqual({ category: 'liquid' });
    });

    it('should handle MCP error for missing bookId parameter', async () => {
        try {
            await server.testCallTool('get_book', {});
            throw new Error('Should have thrown an error for missing bookId');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            // Should be a validation error about missing bookId
        }
    });

    it('should handle MCP error for non-existent book ID', async () => {
        try {
            await server.testCallTool('get_book', { bookId: 'non-existent-book' });
            throw new Error('Should have thrown an error for non-existent book');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('Book not found');
        }
    });

    it('should handle different book configurations via MCP', async () => {
        const response1 = await server.testCallTool('get_book', { bookId: 'book-1' });
        const response2 = await server.testCallTool('get_book', { bookId: 'book-2' });

        const jsonResponse1 = JSON.parse(response1.content[0].text as string);
        const jsonResponse2 = JSON.parse(response2.content[0].text as string);

        const book1 = jsonResponse1.book;
        const book2 = jsonResponse2.book;

        expect(book1.name).toBe('Test Company Ltd');
        expect(book2.name).toBe('Personal Finance');
        expect(book1.timeZone).toBe('America/New_York');
        expect(book2.timeZone).toBe('America/Los_Angeles');

        // Verify both books have groups (now inside book objects)
        expect(Array.isArray(book1.groups)).toBe(true);
        expect(Array.isArray(book2.groups)).toBe(true);

        // Verify book 1 has business-focused groups
        const book1Assets = book1.groups.find((g: any) => g.name === 'Assets');
        expect(book1Assets).toBeDefined();
        const book1Equipment = book1Assets.children
            .find((c: any) => c.name === 'Fixed Assets')
            ?.children.find((c: any) => c.name === 'Equipment');
        expect(book1Equipment).toBeDefined();
        expect(book1Equipment.properties).toEqual({ depreciation: 'straight-line' });

        // Verify book 2 has personal finance groups
        const book2Assets = book2.groups.find((g: any) => g.name === 'Assets');
        expect(book2Assets).toBeDefined();
        const book2Checking = book2Assets.children.find((c: any) => c.name === 'Checking Accounts');
        expect(book2Checking).toBeDefined();
        expect(book2Checking.properties).toEqual({ category: 'bank' });
    });

    it('should return groups with complete hierarchical structure', async () => {
        const response = await server.testCallTool('get_book', { bookId: 'book-1' });
        const jsonResponse = JSON.parse(response.content[0].text as string);
        const book = jsonResponse.book;

        // Verify top-level structure (groups now inside book)
        expect(Array.isArray(book.groups)).toBe(true);

        // Should have 5 root groups (Assets, Liabilities, Equity, Revenue, Expenses)
        expect(book.groups).toHaveLength(5);

        // Verify each group has required properties
        book.groups.forEach((group: any) => {
            expect(group).toHaveProperty('id');
            expect(group).toHaveProperty('name');
            expect(group).toHaveProperty('type');
            expect(group).toHaveProperty('hidden');
            expect(group).toHaveProperty('permanent');
            expect(group).toHaveProperty('properties');
            expect(group).toHaveProperty('children');
            expect(typeof group.id).toBe('string');
            expect(typeof group.name).toBe('string');
            expect(typeof group.type).toBe('string');
            expect(typeof group.hidden).toBe('boolean');
            expect(typeof group.permanent).toBe('boolean');
            expect(typeof group.properties).toBe('object');
            expect(Array.isArray(group.children)).toBe(true);
        });

        // Verify nested groups also have correct structure
        const assetsGroup = book.groups.find((g: any) => g.name === 'Assets');
        expect(assetsGroup).toBeDefined();
        if (assetsGroup) {
            expect(assetsGroup.children).toHaveLength(2); // Current Assets and Fixed Assets
        }

        if (assetsGroup) {
            assetsGroup.children.forEach((child: any) => {
                expect(child).toHaveProperty('id');
                expect(child).toHaveProperty('name');
                expect(child).toHaveProperty('type');
                expect(child).toHaveProperty('hidden');
                expect(child).toHaveProperty('permanent');
                expect(child).toHaveProperty('properties');
                expect(child).toHaveProperty('children');
            });
        }
    });

    it('should return empty groups array when book has no groups', async () => {
        // Create a mock book with no groups
        const emptyGroupsBook = [
            {
                ...mockBooks[0],
                groups: [],
            },
        ];

        const mockBkper = createMockBkperForBookWithGroups(emptyGroupsBook);
        server = new BkperMcpServer(mockBkper as any);

        const response = await server.testCallTool('get_book', { bookId: 'book-1' });
        const jsonResponse = JSON.parse(response.content[0].text as string);
        const book = jsonResponse.book;

        expect(Array.isArray(book.groups)).toBe(true);
        expect(book.groups).toHaveLength(0);
    });
});
