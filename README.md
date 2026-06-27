# Bkper MCP

Use ChatGPT, Claude, or another Model Context Protocol (MCP) client with your Bkper books.

Bkper MCP lets an AI assistant use Bkper through your existing Bkper account permissions. It exposes tools for Bkper books, accounts, groups, transactions, balances, sharing, and app metadata. Some tools are read-only. Write tools are available only when authorized by you and allowed by your Bkper permissions.

Bkper remains the source of truth. Balances and financial reports come from Bkper APIs, and Bkper Core still enforces permissions, lock dates, checked transaction rules, audit history, deletion constraints, and ledger invariants.

## Quick start

Use the official hosted MCP server URL:

```text
https://mcp.bkper.app/mcp
```

### ChatGPT

1. Open ChatGPT settings.
2. Go to **Connectors** or **MCP connectors**.
3. Choose **Add custom connector**.
4. Paste the MCP server URL.
5. Complete the Bkper authorization flow in your browser.
6. Return to ChatGPT and ask it to list your Bkper books.

### Claude

1. Open Claude settings.
2. Go to **Connectors**.
3. Choose **Add custom connector**.
4. Name it `Bkper`.
5. Paste the MCP server URL.
6. Complete the Bkper authorization flow in your browser.
7. Return to Claude and ask it to list your Bkper books.

> Product labels in ChatGPT and Claude can change. If you do not see custom MCP connectors, check whether your plan, workspace, or client version supports remote MCP servers.

## Start with safe prompts

Begin with simple, read-only requests while you learn how your assistant works with Bkper. Use natural language dates like “today,” “last month,” “this quarter,” or “2025.”

```text
Show me a balance sheet as of today.
```

```text
Show me profit and loss for last month.
```

```text
Show me profit and loss for 2025.
```

```text
Find possible duplicate transactions from last month.
```

```text
Spot unusual transactions this quarter.
```

```text
Review unchecked transactions from this month.
```

```text
Help me understand why the Exchange Bot is not working in this book.
```

```text
Just show me what you find. Don't change anything yet.
```

## How it works

```text
Your AI assistant → Bkper MCP → Bkper Core → Your books
```

When you connect Bkper MCP:

- you authenticate with your Bkper account;
- the assistant can use Bkper only within the permissions available to your account;
- Bkper MCP does not give the AI client your raw Bkper OAuth token;
- Bkper Core validates every read and write request;
- Bkper activity is attributed to the `bkper-mcp` app identity.

Only connect assistants and MCP clients you trust.

## Capabilities

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

### Write tools

When authorized by you and allowed by your Bkper permissions, AI assistants can also:

- create and update books;
- create, update, archive, unarchive, or delete accounts;
- create, update, or delete groups;
- create or update book shares, and remove book shares;
- create transaction drafts;
- update draft or unchecked transactions;
- post, check, uncheck, trash, untrash, or merge transactions.

Whether an individual write operation succeeds depends on Bkper permissions, lock dates, checked transaction rules, deletion constraints, and other Bkper Core validations.

Before allowing any change, ask the assistant to explain the exact plan and wait for your confirmation.

```text
Before making any change in Bkper, explain the exact plan and ask for my confirmation.
```

## Safety checklist

When asking an AI assistant to work with Bkper:

- start with read-only tasks;
- name the book you want to use;
- ask the assistant to use Bkper for balances and reports instead of calculating them itself;
- ask the assistant to explain its plan before any change;
- require explicit confirmation before creating, posting, checking, updating, sharing, archiving, trashing, merging, or deleting data;
- use test books for early experiments.

