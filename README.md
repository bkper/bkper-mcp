# Bkper MCP

Connect AI assistants to [Bkper](https://bkper.com) through a first-party Model Context Protocol (MCP) server.

Bkper MCP lets compatible AI clients read Bkper books, balances, and transactions using your existing Bkper permissions. Advanced workflows are planned through a sandboxed execution environment that uses the official `bkper-js` SDK while keeping Bkper Core responsible for permissions, audit, and ledger invariants.

## Status

Bkper MCP is in development and is planned for:

```text
https://mcp.bkper.app
```

Public connection instructions will be added when the hosted service is available.

## What You Can Do

The initial public typed tools are read-only:

| Capability | Description |
|-----------|-------------|
| List books | Find Bkper books available to your account |
| Get book details | Inspect book metadata, accounts, groups, and hierarchy |
| Query balances | Ask for balances using Bkper queries |
| List transactions | Search and paginate transactions |

Write workflows are planned for the sandboxed Codemode `execute` tool. All writes will still go through Bkper Core and use the same permissions, audit rules, and zero-sum transaction invariants as the Bkper app and API.

## Security Model

Bkper MCP is designed as first-party access to Bkper:

- You authenticate with your Bkper account.
- The MCP server acts with your existing Bkper permissions.
- Raw Bkper OAuth tokens are not exposed to MCP clients.
- Bkper Core remains the authority for permissions and audit.
- Actions are attributed to the Bkper MCP app identity.

Only connect AI assistants and MCP clients you trust.

## Bkper References

- [Core Concepts](https://bkper.com/docs/core-concepts.md)
- [bkper-js API](https://bkper.com/docs/api/bkper-js.md)
- [LLM documentation index](https://bkper.com/llms.txt)

## License

Apache-2.0
