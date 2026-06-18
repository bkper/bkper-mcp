# Bkper MCP Server

Remote Model Context Protocol (MCP) server for [Bkper](https://bkper.com) - enabling AI assistants to interact with financial data.

## Status

**Work in Progress** - This package is being extracted from `bkper-cli` to become a standalone remote MCP server.

### Completed
- Core read-only MCP tools (4 public typed tools)
- Cloudflare Workers structure
- Basic HTTP endpoints

### TODO
- OAuth authentication (PKCE flow)
- Streamable HTTP transport implementation
- Deployment to `mcp.bkper.app`

## Tools

| Tool | Description |
|------|-------------|
| `list_books` | List books with filtering |
| `get_book` | Get book details and group hierarchy |
| `get_balances` | Query account balances |
| `list_transactions` | List transactions with pagination |

Writes should go through the planned sandboxed `execute` Codemode tool.

## Development

```bash
# Install dependencies
bun install

# Type check
bun run typecheck

# Run locally
bun run dev

# Build
bun run build
```

## Architecture

```
src/
├── index.ts              # Hono app entry point
├── server.ts             # MCP server implementation
├── bkper-factory.ts      # Bkper SDK configuration
├── tools/                # MCP tool handlers
│   ├── list_books.ts
│   ├── get_book.ts
│   ├── get_balances.ts
│   └── list_transactions.ts
```

## License

Apache-2.0
