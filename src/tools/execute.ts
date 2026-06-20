import { CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

export type ExecuteRunner = (code: string) => Promise<unknown>;

interface ExecuteParams {
    code: string;
}

class CodemodeNotEnabledError extends Error {
    constructor() {
        super('Codemode execution is not enabled yet. The execute tool is registered, but the Dynamic Worker sandbox runner is not configured.');
        this.name = 'CodemodeNotEnabledError';
    }
}

const disabledExecuteRunner: ExecuteRunner = async () => {
    throw new CodemodeNotEnabledError();
};

export async function handleExecute(
    params: Partial<ExecuteParams>,
    runner: ExecuteRunner = disabledExecuteRunner
): Promise<CallToolResult> {
    try {
        const code = validateCode(params);
        const result = await runner(code);

        return {
            content: [
                {
                    type: 'text',
                    text: serializeExecutionResult(result),
                },
            ],
        };
    } catch (error) {
        if (error instanceof McpError) {
            throw error;
        }

        if (error instanceof CodemodeNotEnabledError) {
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: error.message,
                    },
                ],
            };
        }

        throw new McpError(
            ErrorCode.InternalError,
            `Codemode execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

function validateCode(params: Partial<ExecuteParams>): string {
    if (typeof params.code !== 'string' || params.code.trim().length === 0) {
        throw new McpError(
            ErrorCode.InvalidParams,
            'Missing required parameter: code'
        );
    }

    return params.code;
}

function serializeExecutionResult(result: unknown): string {
    if (typeof result === 'string') {
        return result;
    }

    if (result === undefined) {
        return 'undefined';
    }

    try {
        const serialized = JSON.stringify(result, null, 2);
        return serialized ?? String(result);
    } catch {
        throw new McpError(
            ErrorCode.InternalError,
            'Codemode execution result is not JSON-serializable'
        );
    }
}

export const executeToolDefinition = {
    name: 'execute',
    description: `Execute sandboxed Bkper code using the authenticated user's Bkper permissions. Before writing Bkper code, read Core Concepts: https://bkper.com/docs/core-concepts.md and the bkper-js reference: https://bkper.com/docs/api/bkper-js.md. For broader documentation discovery, use https://bkper.com/llms.txt. Inside execute, \`bkper\` will be a preconfigured authenticated Bkper instance and \`bkperjs\` will expose bkper-js classes/enums. Do not provide OAuth tokens; authentication is injected by the MCP server. Use Bkper's from/to movement model and protect the zero-sum invariant. The sandbox cannot access the user's local filesystem directly; provide file content or supported representations such as base64, URL, or existing Bkper file objects.`,
    inputSchema: {
        type: 'object' as const,
        properties: {
            code: {
                type: 'string',
                description: 'Async JavaScript code to run in the Bkper Codemode sandbox. Prefer an async arrow function, for example: async () => { const books = await bkper.getBooks(); return books.map(book => book.json()); }'
            },
        },
        required: ['code'],
        additionalProperties: false,
    },
};
