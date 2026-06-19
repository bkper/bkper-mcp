import { describe, it, expect, beforeEach } from 'bun:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BkperMcpServer } from '../../src/server.js';
import { BookData, BkperMcpServerType } from './helpers/mock-interfaces.js';
import { createMockBkperForBooks } from './helpers/mock-factory.js';
import { loadBooks } from './helpers/fixture-loader.js';

// Load test data
const mockBooks: BookData[] = loadBooks('');

describe('MCP Server - General Tests', () => {
    let server: BkperMcpServerType;

    beforeEach(() => {
        const mockBkper = createMockBkperForBooks(mockBooks);
        server = new BkperMcpServer(mockBkper as any);
    });

    it('should return proper MCP error for unknown tool', async () => {
        try {
            await server.testCallTool('unknown_tool');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('Tool unknown_tool not found');
        }
    });

    it('should have testListTools helper method for testing', async () => {
        const response = await server.testListTools();

        expect(response).toHaveProperty('tools');
        expect(Array.isArray(response.tools)).toBe(true);
        expect(response.tools.length).toBeGreaterThan(0);
    });

    it('should have testCallTool helper method for testing', async () => {
        // Test that the helper method exists and works with any tool
        expect(typeof server.testCallTool).toBe('function');

        // This should throw an error for unknown tool, proving the method works
        try {
            await server.testCallTool('non_existent_tool');
            throw new Error('Should have thrown an error');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should expose read-only typed tools and reference helper', async () => {
        const response = await server.testListTools();
        const toolNames = response.tools.map(tool => tool.name);

        expect(toolNames).toEqual([
            'list_books',
            'get_book',
            'get_balances',
            'list_transactions',
            'reference_index',
        ]);
    });

    it('should expose the high-level McpServer expected by Cloudflare createMcpHandler', () => {
        expect(server.getServer()).toBeInstanceOf(McpServer);
    });

});
