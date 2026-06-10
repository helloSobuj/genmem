# Security

## Reporting a vulnerability

Please report security issues **privately** to the maintainers via GitHub Security Advisories:
https://github.com/<owner>/genmem-mcp/security/advisories/new

Do not open a public GitHub issue for security problems. We will respond within 72 hours and work with you on a coordinated disclosure timeline.

## Scope

genmem is a local-first tool. The most relevant security concerns are:

- **Path traversal** — the `topic` field in notes flows into a directory path. We validate topic names against `CONFIG.topicPattern` and run every write through a traversal guard.
- **FTS5 query injection** — user-supplied search queries are wrapped in double quotes and bound via SQLite parameters. They never reach the FTS5 parser as raw text.
- **Scope resolution** — `GENMEM_SCOPE` and `--scope` are resolved to absolute paths and validated. There is no implicit CWD-relative scope.
- **DB write safety** — every note save is wrapped in a transaction. Atomic file writes (`*.tmp` + `rename`) prevent partial files on crash.
- **No network** — genmem never makes network requests. No telemetry, no auto-update, no remote sync in v1.
- **Backup before destructive operations** — `genmem install --force` and `genmem uninstall` write a `.bak.<ts>` copy of every config file they modify.

## Out of scope

- **Data at rest in the SQLite DB** is not encrypted. If you need encryption, use full-disk encryption (BitLocker on Windows, FileVault on macOS, LUKS on Linux). The DB file lives under `%USERPROFILE%\.genmem\index\`.
- **Multi-user isolation** — genmem is single-user per machine. If multiple users share a Windows account, they share the scope.
- **The notes themselves** are user-authored Markdown. genmem does not sanitize HTML or script content in bodies. If you save content from an untrusted source, treat it as you would any other Markdown file.

## Best practices for users

- Don't put secrets (API keys, passwords) in note bodies. They're stored as plaintext in the DB.
- Back up your scope regularly: `genmem export --out backup.zip`.
- When sharing notes with others, review the `source` field — `source: chat` means the note was written by an LLM during a conversation.
