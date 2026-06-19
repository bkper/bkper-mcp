import { describe, it, expect, beforeEach } from 'bun:test';
import type { Bkper } from 'bkper-js';

import { BkperMcpServer } from '../../../src/server.js';

interface ReferenceEntry {
    url: string;
}

interface ReferenceIndexResponse {
    canonicalDocs: {
        coreConcepts: ReferenceEntry;
        bkperJs: ReferenceEntry;
        docsIndex: ReferenceEntry;
    };
    mcpRuntime: {
        agentId: string;
        codemodeGlobals: string[];
        constraints: string[];
    };
    accountingGuidance: string[];
}

function createServer(): InstanceType<typeof BkperMcpServer> {
    return new BkperMcpServer({} as unknown as Bkper);
}

function getTextContent(response: Awaited<ReturnType<InstanceType<typeof BkperMcpServer>['testCallTool']>>): string {
    const content = response.content[0];
    if (!content || content.type !== 'text') {
        throw new Error('Expected text content');
    }
    return content.text;
}

describe('MCP Server - reference_index Tool Registration', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        server = createServer();
    });

    it('should register reference_index tool in MCP tools list', async () => {
        const response = await server.testListTools();
        const referenceTool = response.tools.find((tool) => tool.name === 'reference_index');

        expect(referenceTool).toBeDefined();
        expect(referenceTool!.description).toContain('canonical Bkper documentation');
        expect(referenceTool!.inputSchema).toEqual({
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: {},
        });
    });
});

describe('MCP Server - reference_index Tool Calls', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        server = createServer();
    });

    it('should return canonical documentation URLs and MCP runtime notes', async () => {
        const response = await server.testCallTool('reference_index');
        const referenceIndex = JSON.parse(getTextContent(response)) as ReferenceIndexResponse;

        expect(referenceIndex.canonicalDocs.coreConcepts.url).toBe(
            'https://bkper.com/docs/core-concepts.md',
        );
        expect(referenceIndex.canonicalDocs.bkperJs.url).toBe(
            'https://bkper.com/docs/api/bkper-js.md',
        );
        expect(referenceIndex.canonicalDocs.docsIndex.url).toBe('https://bkper.com/llms.txt');
        expect(referenceIndex.mcpRuntime.agentId).toBe('bkper-mcp');
        expect(referenceIndex.mcpRuntime.codemodeGlobals).toContain('bkper');
        expect(referenceIndex.mcpRuntime.codemodeGlobals).toContain('bkperjs');
        expect(referenceIndex.mcpRuntime.constraints.length).toBeGreaterThan(0);
        expect(referenceIndex.accountingGuidance).toContain('Protect the zero-sum invariant.');
    });
});
