# Bkper MCP

Connect ChatGPT, Claude, and other Model Context Protocol (MCP) clients to [Bkper](https://bkper.com).

Bkper MCP is the official hosted MCP endpoint for Bkper. It lets compatible AI assistants work with Bkper using your existing Bkper account permissions.

Use the canonical MCP server URL:

```text
https://mcp.bkper.app/mcp
```

This repository contains public app metadata, assets, and user-facing installation instructions. It is not a self-hosting template.

## What it can do

Bkper MCP exposes typed tools for Bkper books, accounts, groups, transactions, balances, sharing, and app metadata.

### Read-only tools

AI assistants can:

- list the Bkper books available to your account;
- inspect book metadata, configuration, installed apps, collection context, groups, and hierarchy;
- list and inspect accounts;
- query deterministic balances and financial reports through Bkper balance APIs;
- search, list, and inspect transactions;
- list existing book shares;
- look up Bkper app metadata when troubleshooting installed apps.

### Changes it can make

When authorized by you and allowed by your Bkper permissions, AI assistants can also:

- create and update books;
- create, update, archive, unarchive, or delete accounts;
- create, update, or delete groups;
- create or update book shares, and remove book shares;
- create transaction drafts;
- update draft or unchecked transactions;
- post, check, uncheck, trash, untrash, or merge transactions.

Bkper Core still enforces permissions, lock dates, checked transaction rules, deletion constraints, audit, and ledger invariants.

## Install in ChatGPT

1. Open ChatGPT settings.
2. Go to **Connectors** or **MCP connectors**.
3. Choose **Add custom connector**.
4. Use this MCP server URL:

    ```text
    https://mcp.bkper.app/mcp
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
    https://mcp.bkper.app/mcp
    ```

6. Complete the Bkper authorization flow in your browser.
7. Return to Claude and ask it to list your Bkper books.

Suggested first prompt:

```text
Use Bkper MCP to list my Bkper books. Do not make any changes.
```

> Product labels in ChatGPT and Claude can change. If you do not see custom MCP connectors, check whether your plan, workspace, or client version supports remote MCP servers.

## Safe usage

When asking an AI assistant to work with Bkper:

- start with read-only tasks;
- name the book you want to use;
- ask the assistant to explain its plan before any change;
- require explicit confirmation before creating, posting, checking, updating, sharing, archiving, trashing, merging, or deleting data;
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
