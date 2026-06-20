import { describe, it, expect, beforeEach } from 'bun:test';
import type { Bkper } from 'bkper-js';

import { BkperMcpServer } from '../../../src/server.js';
import type { ExecuteRunner } from '../../../src/tools/execute.js';

function createServer(executeRunner?: ExecuteRunner): InstanceType<typeof BkperMcpServer> {
    return new BkperMcpServer({} as unknown as Bkper, { executeRunner });
}

function getTextContent(response: Awaited<ReturnType<InstanceType<typeof BkperMcpServer>['testCallTool']>>): string {
    const content = response.content[0];
    if (!content || content.type !== 'text') {
        throw new Error('Expected text content');
    }
    return content.text;
}

describe('MCP Server - execute Tool Registration', () => {
    let server: InstanceType<typeof BkperMcpServer>;

    beforeEach(() => {
        server = createServer();
    });

    it('should register execute tool in MCP tools list', async () => {
        const response = await server.testListTools();
        const executeTool = response.tools.find((tool) => tool.name === 'execute');

        expect(executeTool).toBeDefined();
        expect(executeTool!.inputSchema).toMatchObject({
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: {
                code: {
                    type: 'string',
                },
            },
            required: ['code'],
        });
    });
});

describe('MCP Server - execute Tool Calls', () => {
    it('should reject missing code before invoking the runner', async () => {
        let runnerCalled = false;
        const server = createServer(async () => {
            runnerCalled = true;
            return 'not reached';
        });

        await expect(server.testCallTool('execute', {})).rejects.toThrow('Invalid arguments for tool execute');
        expect(runnerCalled).toBe(false);
    });

    it('should return a disabled message when no Codemode runner is configured', async () => {
        const server = createServer();

        await expect(server.testCallTool('execute', { code: 'async () => "ok"' })).rejects.toThrow(
            'Codemode execution is not enabled',
        );
    });

    it('should pass code to the configured runner and serialize object results', async () => {
        const executedCode: string[] = [];
        const runner: ExecuteRunner = async (code) => {
            executedCode.push(code);
            return { ok: true, count: 2 };
        };
        const server = createServer(runner);

        const response = await server.testCallTool('execute', { code: 'async () => ({ ok: true, count: 2 })' });

        expect(executedCode).toEqual(['async () => ({ ok: true, count: 2 })']);
        expect(JSON.parse(getTextContent(response))).toEqual({ ok: true, count: 2 });
    });

    it('should preserve string results from the configured runner', async () => {
        const server = createServer(async () => 'Book Id,Name\nbook_1,Operations');

        const response = await server.testCallTool('execute', { code: 'async () => "csv"' });

        expect(getTextContent(response)).toBe('Book Id,Name\nbook_1,Operations');
    });
});
