import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ReferenceEntry {
    title: string;
    url: string;
    purpose: string;
    required: boolean;
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
        permissions: string;
        files: string;
    };
    accountingGuidance: string[];
}

const REFERENCE_INDEX: ReferenceIndexResponse = {
    canonicalDocs: {
        coreConcepts: {
            title: 'Bkper Core Concepts',
            url: 'https://bkper.com/docs/core-concepts.md',
            purpose: 'Mandatory model for books, accounts, groups, transactions, balances, and financial flows.',
            required: true,
        },
        bkperJs: {
            title: 'bkper-js API Reference',
            url: 'https://bkper.com/docs/api/bkper-js.md',
            purpose: 'Primary coding reference for Bkper scripts and future MCP Codemode execution.',
            required: true,
        },
        docsIndex: {
            title: 'Bkper Documentation Index',
            url: 'https://bkper.com/llms.txt',
            purpose: 'Routing index for broader Bkper documentation discovery.',
            required: false,
        },
    },
    mcpRuntime: {
        agentId: 'bkper-mcp',
        codemodeGlobals: ['bkper', 'bkperjs'],
        constraints: [
            'Authentication is injected by the MCP server; do not provide OAuth tokens.',
            'Raw Bkper OAuth tokens, service credentials, Worker env, and secrets are not available to model-written code.',
            'Network access is limited to Bkper API calls through server-side token and agent attribution injection.',
            'The sandbox cannot access the user local filesystem directly.',
        ],
        permissions: 'Actions run as the authenticated user and are subject to normal Bkper Core permissions, audit, and lock/transaction state rules.',
        files: 'If a file is needed, the host agent must provide content or a supported representation such as base64, URL, or an existing Bkper file object.',
    },
    accountingGuidance: [
        'Protect the zero-sum invariant.',
        'Use Bkper from/to movement semantics instead of generic debit/credit assumptions.',
        'Use Bkper APIs for balances, reports, reconciliations, taxes, and other accounting computations; do not make raw LLM arithmetic final.',
    ],
};

export function getReferenceIndex(): ReferenceIndexResponse {
    return REFERENCE_INDEX;
}

export async function handleReferenceIndex(): Promise<CallToolResult> {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(getReferenceIndex(), null, 2),
            },
        ],
    };
}

export const referenceIndexToolDefinition = {
    name: 'reference_index',
    description: 'Return canonical Bkper documentation URLs and MCP runtime notes for agents.',
    inputSchema: {
        type: 'object' as const,
        properties: {},
    },
};
