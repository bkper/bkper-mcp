# Bkper MCP Public Repository Guidelines

This repository is public. It contains public app metadata, assets, and user-facing installation/help content for the hosted Bkper MCP service.

## Public Changelog Policy

`CHANGELOG.md` is for user-visible product changes only. Write entries as outcomes users can understand, not implementation details.

Include:

- New or changed MCP capabilities that users can call
- Connector setup, endpoint, or compatibility changes
- Permission, safety, or behavior changes visible to users
- Breaking changes, deprecations, or migration notes

Do not include:

- Internal implementation details, root causes, architecture, transport, cache, token, session, OAuth, deployment, CI, or test details
- Vendor review, marketplace submission, publishing, or justification details
- Security-sensitive details or operational procedures
- Commit-log wording, internal issue names, branch names, or maintainer workflow

Preferred wording:

- Use: "Improved compatibility with Claude connectors."
- Avoid: naming endpoint-path mechanics or internal protocol handling.
- Use: "Improved reliability for long-running connector sessions."
- Avoid: naming token refresh, session storage, or OAuth internals.

Before editing `CHANGELOG.md`, check each bullet with:

1. Is this visible or useful to a Bkper MCP user?
2. Could this reveal internal implementation, review, security, or operational details?
3. Can it be rewritten as a product outcome instead of a mechanism?

If unsure, omit the entry or ask before publishing.

## README Policy

`README.md` is public user documentation. Keep it focused on what Bkper MCP does, how users connect it, and safe usage guidance. Do not add maintainer-only release, deployment, or internal workflow details.
