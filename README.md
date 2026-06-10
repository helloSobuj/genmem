# genmem

**Local-first markdown memory for AI assistants.**

genmem is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives Claude Desktop, Cursor, VS Code (Cline), Continue, and Windsurf long-term memory. Your AI assistant can save, search, and recall notes across every chat — the memory lives on your machine, in plain Markdown files you can read, edit, and version-control.

```
┌──────────────────────────┐     ┌──────────────────────────┐
│  Claude / Cursor / etc.  │ <-> │  genmem (this project)   │
│      MCP client           │     │  stdio JSON-RPC server   │
└──────────────────────────┘     └────────────┬─────────────┘
                                               │
                                ┌──────────────┴──────────────┐
                                │  ~/.genmem/                 │
                                │  ├── memory/   *.md          │
                                │  ├── topics/   */           │
                                │  ├── attachments/           │
                                │  ├── .trash/                │
                                │  └── index/index.sqlite     │
                                │      (FTS5 search index)    │
                                └─────────────────────────────┘
```

## Quickstart (Windows)

```powershell
# 1. Initialize a scope (creates %USERPROFILE%\.genmem)
npx -y genmem-mcp init

# 2. Auto-register genmem as an MCP server in every detected AI client
npx -y genmem-mcp install

# 3. Restart your AI client. The memory_* tools will appear.
```

That's it. In Claude Desktop, try:

> "Save a note: my favorite editor is Zed and I prefer dark mode."

Later, in any new chat:

> "What editor do I prefer?"

The assistant will call `memory_search` and find your note.

## Features

- **8 MCP tools** — `save`, `search`, `get`, `recent`, `topics`, `delete`, `link`, `reflect`.
- **FTS5 full-text search** — fast, ranked results with highlighted snippets.
- **Human-readable Markdown** — every note is a `.md` file on disk with YAML frontmatter.
- **Zero-config install** — `npx -y genmem-mcp install` finds Claude Desktop, Cursor, VS Code (Cline), Continue, and Windsurf on your system and writes the MCP config for each one.
- **Portable backups** — `genmem export` zips a scope, `genmem import` restores it on any machine.
- **Crash-safe writes** — atomic temp-file + rename; SQLite WAL mode.
- **Idempotent everywhere** — re-installing, re-importing, and re-saving all detect "already done" and skip.

## CLI

```
genmem init                          # create scope dirs + config.json + empty DB
genmem doctor [--rebuild]            # diagnostics, optionally rebuild FTS index
genmem list [--topic X] [--limit N]   # list notes
genmem search "query"                # (use the MCP search tool)
genmem install [--client X] [--force] # auto-register in AI clients
genmem uninstall [--client X]        # remove the genmem entry
genmem export --out backup.zip       # bundle a scope
genmem import --in backup.zip        # restore a scope
genmem config get|set|path           # manage scope config
genmem serve                         # start the MCP server (called by clients)
```

All commands accept `--scope <path>` to target a non-default scope, and `--user <name>` to override the OS user. See [`docs/cli.md`](docs/cli.md) for the full reference.

## The 8 MCP tools

| Tool | Purpose |
|---|---|
| `memory_save` | Create a new note or update an existing one (idempotent, atomic). |
| `memory_search` | FTS5 search with snippets and topic filter. |
| `memory_get` | Fetch one note by id, optionally without the body. |
| `memory_recent` | List most recently updated notes, optionally by topic. |
| `memory_topics` | List all topics with note counts. |
| `memory_delete` | Soft-delete (moves to `.trash/`) or hard-delete (7-day grace). |
| `memory_link` | Create a typed edge between two notes. |
| `memory_reflect` | Gather recent notes + a `prompt_hint` for the LLM to synthesize a reflection. |

Full schemas in [`docs/mcp.md`](docs/mcp.md). The Markdown file format is specified in [`docs/format.md`](docs/format.md).

## File format

Every note is a Markdown file with YAML frontmatter:

```markdown
---
id: 01JABCDEF1234567890ABCDE
title: "How I configured SSH tunnels"
topic: infra/ssh
tags: [ssh, windows, tunnel]
links:
  - 01JABCDEF0000000000000000A
created_at: 2026-01-15T14:32:11.045Z
updated_at: 2026-01-15T14:32:11.045Z
source: chat
schema_version: 1
---

# Body

The body is plain CommonMark + GFM. You can edit any note in any text
editor; `genmem doctor --rebuild` will re-sync the FTS index.
```

Filenames are `{ulid}-{slug}.md` so they sort by creation time and survive renames in Explorer.

## Storage layout

```
%USERPROFILE%\.genmem\
├── config.json            # scope metadata: user, active_profile, schema_version
├── memory\                # notes saved without a topic
├── topics\                # notes organized by topic
│   └── <topic>\
│       └── <ulid>-<slug>.md
├── attachments\           # reserved (not surfaced in v1)
├── .trash\                # soft-deleted notes (7-day purge window)
└── index\
    └── index.sqlite       # FTS5 search index (rebuildable from disk)
```

Markdown is the source of truth. The SQLite index is a derived cache — safe to delete and rebuild at any time with `genmem doctor --rebuild`.

## Install (developer)

```bash
git clone https://github.com/<you>/genmem-mcp
cd genmem-mcp
npm install
npm run build
node bin/genmem-mcp.js --version
node bin/genmem-mcp.js init
node bin/genmem-mcp.js doctor
```

## Test

```bash
npm test           # 144 tests, ~5s on Windows
npm run typecheck  # 0 errors
npm run lint
```

The test suite includes a protocol-level integration test that spawns the real server as a child process and drives it over stdio with the official MCP client SDK. No mocking of the transport layer.

## License

MIT — see [LICENSE](LICENSE).
