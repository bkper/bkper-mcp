# Remote Bkper MCP Server Design

## Summary

Expose a first-party remote MCP server at `mcp.bkper.app` that lets AI assistants use Bkper on behalf of an authenticated user.

The server should follow Cloudflare's remote MCP/OAuth standards while keeping Bkper Core as the authority for identity, permissions, audit, and ledger invariants.

The core model is:

> Bkper MCP Codemode is a remote, sandboxed equivalent of using `bkper-js` or the Bkper CLI as the authenticated user.

## Goals

- Provide a standard remote MCP endpoint for Bkper users and AI clients.
- Use Cloudflare's MCP transport and OAuth provider patterns.
- Reuse the existing Bkper web session for authorization handoff.
- Let models write normal `bkper-js` code for arbitrary Bkper workflows.
- Keep Bkper Core permissions and audit as the source of truth.
- Preserve Bkper's zero-sum invariant by routing all ledger mutations through Core APIs.
- Keep the tool surface small and understandable.

## Non-goals

- Do not deploy the MCP server as a standard Bkper platform app for MVP.
- Do not duplicate Bkper's permission model in MCP.
- Do not implement granular per-endpoint MCP scopes unless Core later supports scoped tokens.
- Do not expose raw OAuth tokens, secrets, `env`, or unrestricted server execution to model-written code.
- Do not build a full RAG system for docs in MVP.

## Hosting and Transport

Run as a first-party Cloudflare Worker, not as a customer/developer platform app.

Use the Cloudflare MCP server pattern:

- `@cloudflare/workers-oauth-provider` for MCP OAuth 2.1 provider behavior.
- `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`.
- `WebStandardStreamableHTTPServerTransport` for Streamable HTTP.
- Fresh MCP server instance per request/session.

Primary endpoints:

- `/mcp`
- `/authorize`
- `/token`
- `/register`

## Authentication and Authorization

### User session handoff

MCP authorization should reuse the existing Bkper web session.

Flow:

```text
MCP client opens /authorize
  -> mcp.bkper.app reads bkper_session cookie
  -> validates session in Dispatch SESSIONS KV
  -> obtains userId server-side
  -> user approves MCP client
  -> workers-oauth-provider stores grant props { userId }
  -> MCP client receives MCP access/refresh tokens
```

If no valid session exists:

```text
/authorize
  -> redirect to https://bkper.app/auth/login?returnUrl=<mcp authorize URL>
  -> user signs in
  -> returns to /authorize
  -> grant completes
```

### Identity guarantee

The MCP client must never provide `userId`.

The only trusted identity path is:

```text
secure web session -> server-side KV lookup -> OAuth grant props -> validated MCP token context
```

Knowing a Bkper `userId` is not sufficient to use MCP. The bearer authority is the MCP access token issued by `workers-oauth-provider`.

### Grant lifetime

MVP lifetimes:

- MCP access token: 1 hour.
- MCP refresh token / grant: 30 days.
- Browser session is required only for initial authorization.
- MCP grant can outlive the browser session, like CLI auth.

Revocation UI can be added later in a connected apps/sessions view.

## Bkper API Token Handling

MCP grants store only `userId`, not a Bkper OAuth access token.

For each MCP request or tool execution, the Worker can obtain a fresh Bkper access token server-side:

```text
MCP tool request
  -> validated MCP token gives grant props { userId }
  -> call Bkper Private API /v5/oauth/refresh with service account auth
  -> receive short-lived Bkper accessToken
  -> call Bkper Public API / bkper-js as that user
```

This matches the existing Dispatch/Outbound trust model. Core already caches/refreshes user tokens, so MCP does not need its own Bkper token cache in MVP.

## Consent UX

Because MVP uses normal Bkper user tokens and Core permissions, do not present fake granular permissions.

Consent should be broad and honest:

> You are allowing this AI assistant to use Bkper on your behalf.
>
> It can read and change data that your Bkper account can access, using the same permissions you have in Bkper.
>
> Actions are recorded in Bkper activity and attributed to Bkper MCP.
>
> Only connect assistants you trust.

A read-only/full split is not part of MVP. It can be revisited later if Core supports scoped tokens or if product UX clearly needs it.

## App / Agent Identity

Create a canonical Bkper App identity for MCP:

- App / agent id: `bkper-mcp`
- Display name: `Bkper MCP`

Every Bkper API call from the MCP server must identify itself with:

```text
bkper-agent-id: bkper-mcp
```

When using `bkper-js`, configure:

```ts
agentIdProvider: async () => "bkper-mcp"
```

The sandbox outbound proxy should also set or overwrite `bkper-agent-id` defensively.

This gives consistent activity stream attribution, app listing/store promotion, analytics, and support diagnostics.

## MCP Tool Surface

Keep the public MCP tool surface small.

### Read-only typed tools

Keep a small set of typed read tools for common workflows:

- `list_books`
- `get_book`
- `get_balances`
- `list_transactions`

These tools provide a fast path for common questions without requiring code generation.

Where useful, list/report outputs should prefer LLM-efficient formats such as CSV. Balance/report calculations must stay deterministic and route through Bkper APIs, not raw LLM arithmetic.

### Reference fallback

Add a minimal `reference_index` tool/resource.

This is not a RAG system. It is a routing map that tells clients which canonical docs to load.

Mandatory docs:

- Core concepts: `https://bkper.com/docs/core-concepts.md`

Primary Codemode reference:

- bkper-js: `https://bkper.com/docs/api/bkper-js.md`

Escape hatch / full documentation index:

- `https://bkper.com/llms.txt`

The reference index should also include MCP-specific environment notes that are not part of public docs.

### Codemode execute tool

Expose one advanced execution tool, tentatively:

- `execute({ code })`

The code should be an async function body or async arrow function that runs inside a sandbox and uses normal `bkper-js` APIs.

Example:

```ts
async () => {
  const books = await bkper.getBooks();
  return books.map(book => book.json());
}
```

## Codemode Runtime

Use a custom Cloudflare Dynamic Worker loader approach, inspired by Cloudflare's own API MCP server, rather than the higher-level `@cloudflare/codemode` SDK for MVP.

Rationale:

- No per-call approval runtime is needed for the CLI-like model.
- We need a very specific sandbox with `bkper-js` preloaded.
- The public tool model stays simple.
- Dynamic Workers provide the right isolation and outbound control primitive.

### Sandbox globals

The sandbox should support arbitrary normal `bkper-js` usage.

Expose:

- `bkper`: preconfigured authenticated `Bkper` instance.
- `bkperjs`: namespace containing `Bkper`, `Book`, `Transaction`, `Account`, `Group`, `File`, `Collection`, and other exported SDK classes/enums.

The exact global shape can be refined during implementation, but the model should be able to write code close to standard Bkper scripts and app/bot examples.

### Credentials and outbound

Model-written code must not receive:

- raw Bkper OAuth token
- service account credentials
- Worker `env`
- unrestricted `fetch`
- arbitrary network access

Outbound must be restricted to Bkper API egress. The server-side outbound proxy should:

- allow only Bkper API hosts/routes needed by `bkper-js`
- inject/overwrite `Authorization: Bearer <fresh Bkper token>`
- inject/overwrite `bkper-agent-id: bkper-mcp`
- block all other network access

### Core permission model

MCP does not duplicate Bkper authorization logic.

All meaningful Bkper reads and writes pass through Core APIs, where Core enforces:

- user/book permissions
- transaction state rules
- lock dates / checked transaction constraints
- audit trail
- zero-sum transaction invariants

## Documentation Instructions for Host Agents

The `execute` tool description should explicitly instruct host agents:

```md
Before writing Bkper code, read:

1. Core Concepts — mandatory for any task involving books, accounts, groups,
   transactions, balances, reports, or financial flows:
   https://bkper.com/docs/core-concepts.md

2. bkper-js reference — primary API for code inside this tool:
   https://bkper.com/docs/api/bkper-js.md

For broader documentation discovery, use:
https://bkper.com/llms.txt

Use Bkper's from/to movement model. Protect the zero-sum invariant.
Do not rely on generic debit/credit assumptions.
```

MCP-specific notes for the tool description:

```md
Inside execute:
- `bkper` is a preconfigured authenticated Bkper instance.
- `bkperjs` exposes bkper-js classes and enums.
- Do not provide OAuth tokens. Authentication is injected by the MCP server.
- Code runs in a restricted sandbox.
- Network access is limited to Bkper API calls.
- Actions run as the authenticated user and are subject to normal Bkper Core permissions.
- The sandbox cannot access the user's local filesystem directly. If a file is needed, the host agent must provide file content or a supported representation such as base64, URL, or an existing Bkper file object.
```

## Files and Attachments

Support what `bkper-js` can do.

The MCP server should not impose a special file-upload model in MVP. The host/client/model is responsible for obtaining file bytes or references from wherever it has access:

- local path read by the host agent
- remote URL fetched by the host agent
- pasted base64
- another MCP tool
- prior extraction/OCR result
- existing Bkper file object or id

The sandbox itself cannot read the user's local filesystem unless the host provides the data in the code/input.

## Execution Results

`execute` should allow any JSON-serializable result:

- object
- array
- string
- CSV string
- Markdown string
- concise summary

The MCP server wraps the result as text and should safely truncate very large responses.

## Operational Limits

Do not impose tight product-specific execution limits in MVP.

Rely on:

- Cloudflare Worker runtime limits
- Bkper Core API limits
- no arbitrary network
- no secrets/token exposure

MVP should add only defensive behavior:

- response truncation with a clear message
- logging/metrics for execution duration, response size, errors/timeouts
- API call counting if practical

After dogfooding, decide whether custom limits are necessary.

## Implementation Plan

1. Add design and reference instructions.
2. Introduce Cloudflare MCP OAuth provider wiring.
3. Implement Bkper session handoff using shared `SESSIONS` KV and `bkper_session` cookie parsing.
4. Store MCP grant props as `{ userId }`.
5. Add Bkper Private API `/v5/oauth/refresh` helper for MCP.
6. Switch MCP server construction to `McpServer` + `WebStandardStreamableHTTPServerTransport`.
7. Register read-only typed tools.
8. Add `reference_index`.
9. Implement Dynamic Worker Codemode `execute` with `bkper-js` sandbox globals.
10. Implement restricted outbound with token and `bkper-agent-id` injection.
11. Add observability and response truncation.
12. Create/register Bkper App metadata for `bkper-mcp` separately.

## Open Follow-ups

- Exact app metadata and store/listing copy for `bkper-mcp`.
- Exact consent page branding and copy.
- Whether to expose a separate `reference_read` fallback in addition to `reference_index`.
- Whether a future Core scoped-token model should add read-only or narrower consent modes.
