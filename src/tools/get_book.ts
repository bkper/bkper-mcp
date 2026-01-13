import { CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Bkper, Group } from 'bkper-js';

interface GetBookParams {
    bookId: string;
}

interface GroupNode {
    id: string;
    name: string;
    type: string;
    hidden: boolean;
    permanent: boolean;
    properties: { [name: string]: string };
    children: GroupNode[];
}

function buildHierarchicalStructure(groups: Group[]): GroupNode[] {
    const groupMap = new Map<string, GroupNode>();
    const rootGroups: GroupNode[] = [];

    // First pass: create all group nodes
    groups.forEach(group => {
        const node: GroupNode = {
            id: group.getId() || '',
            name: group.getName() || '',
            type: group.getType() || '',
            hidden: group.isHidden() || false,
            permanent: group.isPermanent() || false,
            properties: group.getProperties() || {},
            children: []
        };

        groupMap.set(node.id, node);
    });

    // Second pass: build hierarchy
    groups.forEach(group => {
        const node = groupMap.get(group.getId() || '');
        if (!node) return;

        const parent = group.getParent();
        if (parent) {
            const parentNode = groupMap.get(parent.getId() || '');
            if (parentNode) {
                parentNode.children.push(node);
            }
        } else {
            rootGroups.push(node);
        }
    });

    return rootGroups;
}

function getSystemPrompt(): string {
    // In Cloudflare Workers, we can't read files from filesystem
    // The system prompt will be bundled or fetched from a different source
    // For now, return a placeholder that will be replaced during build or runtime
    return `# Bkper MCP Usage Guide

## Essential Tools

### Discovery
- \`list_books()\` - Find available books
- \`get_book({ bookId })\` - Book details, structure, and group hierarchies

### Analysis
- \`get_balances({ bookId, query })\` - **THE** tool for all balance analysis
- \`list_transactions({ bookId, query })\` - Transaction inspection only (never for balance calculations)

## Core Rules

### 1. Root Group Discovery
Always discover and use root groups dynamically based on account group types.

### 2. Date Filter Matching
- **Permanent accounts** (ASSET, LIABILITY): Use \`before:\` dates for point-in-time
- **Non-permanent accounts** (INCOMING, OUTGOING): Use \`after:\` and \`before:\` for periods

### 3. Balance Analysis Query Requirements (MANDATORY)
- **MUST include either \`group:\` or \`account:\` operator in EVERY query**

For complete documentation, visit https://bkper.com/docs`;
}

export async function handleGetBook(bkper: Bkper, params: GetBookParams): Promise<CallToolResult> {
    try {
        if (!params.bookId) {
            throw new McpError(
                ErrorCode.InvalidParams,
                'Missing required parameter: bookId'
            );
        }

        const book = await bkper.getBook(params.bookId, false, true);

        if (!book) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Book not found: ${params.bookId}`
            );
        }

        const bookJson = book.json();
        const groups = await book.getGroups();
        const hierarchicalGroups = buildHierarchicalStructure(groups || []);

        bookJson.groups = hierarchicalGroups as unknown as bkper.Group[];

        const response = {
            book: bookJson,
            readme: getSystemPrompt()
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
        };
    } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Book not found: ${params.bookId}`
            );
        }

        if (error instanceof McpError) {
            throw error;
        }

        throw new McpError(
            ErrorCode.InternalError,
            `Failed to get book: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

export const getBookToolDefinition = {
    name: 'get_book',
    description: 'Retrieve detailed information about a specific book including its group hierarchy and system prompt',
    inputSchema: {
        type: 'object' as const,
        properties: {
            bookId: {
                type: 'string',
                description: 'The unique identifier of the book to retrieve'
            }
        },
        required: ['bookId']
    }
};
