# Bkper MCP

Connect ChatGPT, Claude, and other Model Context Protocol (MCP) clients to [Bkper](https://bkper.com).

Bkper MCP is the official hosted MCP endpoint for Bkper. It lets compatible AI assistants work with Bkper using your existing Bkper account permissions.

```text
https://mcp.bkper.app
```

This repository contains public app metadata, assets, and user-facing installation instructions. It is not a self-hosting template.

## What it can do

Bkper MCP helps AI assistants:

- list the Bkper books available to your account;
- inspect book metadata, accounts, groups, and hierarchy;
- query balances through Bkper's deterministic balance APIs;
- search and list transactions;
- use Bkper documentation references when writing or explaining workflows.

Advanced workflows may be available during rollout. Treat any advanced action as running with your authenticated Bkper permissions, and use test books until you are confident with the flow.

## Install in ChatGPT

1. Open ChatGPT settings.
2. Go to **Connectors** or **MCP connectors**.
3. Choose **Add custom connector**.
4. Use this MCP server URL:

   ```text
   https://mcp.bkper.app
   ```

5. Complete the Bkper authorization flow in your browser.
6. Return to ChatGPT and ask it to list your Bkper books.

Suggested first prompt:

```text
Use Bkper MCP to list my Bkper books. Do not make any changes.
```

## Install in Claude

1. Open Claude settings.
2. Go to **Connectors**.
3. Choose **Add custom connector**.
4. Name it `Bkper`.
5. Use this MCP server URL:

   ```text
   https://mcp.bkper.app
   ```

6. Complete the Bkper authorization flow in your browser.
7. Return to Claude and ask it to list your Bkper books.

Suggested first prompt:

```text
Use Bkper MCP to list my Bkper books. Do not make any changes.
```

> Product labels in ChatGPT and Claude can change. If you do not see custom MCP connectors, check whether your plan, workspace, or client version supports remote MCP servers.

## Safe usage

Bkper uses a from/to movement model. Every transaction moves a resource **from** one account **to** another, and Bkper Core protects the zero-sum invariant.

When asking an AI assistant to work with Bkper:

- start with read-only tasks;
- name the book you want to use;
- ask the assistant to explain its plan before any change;
- require explicit confirmation before creating, posting, checking, updating, trashing, or deleting data;
- use test books for early experiments.

Example prompts:

```text
List my Bkper books and ask me which one to use.
```

```text
Show the account and group structure for this book. Do not change anything.
```

```text
Get balances for group:Assets before:2026-01-01. Do not calculate balances yourself; use Bkper.
```

```text
Search unchecked transactions after:2026-01-01 and summarize what needs review.
```

```text
Before making any change in Bkper, explain the exact plan and ask for my confirmation.
```

## Permissions and security

When you connect Bkper MCP:

- you authenticate with your Bkper account;
- the AI assistant can use Bkper with the same permissions you have;
- Bkper MCP does not give the AI client your raw Bkper OAuth token;
- Bkper Core remains responsible for permissions, audit, transaction state rules, lock dates, and ledger invariants;
- Bkper activity is attributed to the `bkper-mcp` app identity.

Only connect assistants and MCP clients you trust.

## Bkper references

- [Core Concepts](https://bkper.com/docs/core-concepts.md)
- [bkper-js API](https://bkper.com/docs/api/bkper-js.md)
- [LLM documentation index](https://bkper.com/llms.txt)

## Feedback

Please open an issue in this repository with installation problems, client-specific notes, or documentation improvements.

## License

Apache-2.0
