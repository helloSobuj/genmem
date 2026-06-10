# Markdown File Format

Every note in genmem is a single `.md` file on disk. This document specifies the exact format so you can write notes by hand, migrate from other tools, or build custom integrations.

## Anatomy of a note

```markdown
---
id: 01JABCDEF1234567890ABCDE
title: "How to configure SSH tunnels"
topic: infra/ssh
tags: [ssh, tunnel, windows]
links:
  - 01JABCDEF0000000000000000A
created_at: 2026-01-15T14:32:11.045Z
updated_at: 2026-01-15T14:32:11.045Z
source: chat
schema_version: 1
---

# Body starts here.

Plain CommonMark + GFM (tables, strikethrough, autolinks, fenced code).

Code fences:
```bash
ssh -L 8080:localhost:80 user@host
```
```

The file has three parts:
1. **YAML frontmatter** between the two `---` markers.
2. **A single blank line** (required by YAML).
3. **The body** — Markdown content.

## Filename

`{ulid}-{slug}.md`

- **ULID**: 26 characters, Crockford base32 (`0-9A-HJKMNP-TV-Z`). Time-sortable.
- **Slug**: `[a-z0-9-]{1,80}`, derived from the title or first body line. Collisions resolved by appending `-2`, `-3`, …

Examples:
- `01JABCDEF1234567890ABCDE-ssh-tunnels.md`
- `01KTR1EWD0CDDWKV3XKVDSN3SF-cooking-recipes-2.md`

The ULID is the canonical ID. If you rename a file, the new ULID is re-derived from the filename; the DB row is updated to match.

## Frontmatter fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ULID) | yes | Canonical note ID. |
| `title` | string (1–200 chars) | yes | Human-readable title. |
| `topic` | string | no | Topic path. Defaults to `inbox`. Pattern: `[a-z0-9][a-z0-9-_/]{0,63}`. |
| `tags` | string[] | no | Lowercase tags. Each: `[a-z0-9][a-z0-9-_]{0,31}`. Max 20. |
| `links` | ULID[] | no | IDs of related notes. Max 50. |
| `created_at` | ISO 8601 UTC | yes | Creation timestamp. |
| `updated_at` | ISO 8601 UTC | yes | Last modification timestamp. |
| `source` | enum | yes | `chat` \| `cli` \| `import` \| `api`. |
| `schema_version` | integer | yes | Currently always `1`. |

Unknown frontmatter fields are preserved verbatim on round-trip — the writer does not strip them.

## Storage layout

```
%USERPROFILE%\.genmem\
├── config.json            # scope metadata
├── memory\                # notes with no topic
├── topics\
│   └── <topic>\
│       └── <ulid>-<slug>.md
├── attachments\           # reserved
├── .trash\                # soft-deleted notes
└── index\
    └── index.sqlite       # FTS5 search index
```

The scope root can be overridden with `GENMEM_SCOPE` or `--scope`. Use `genmem config path` to print the resolved path.

## Editing notes by hand

genmem does not lock files. You can edit any `.md` in your scope with any text editor. After editing:

```bash
genmem doctor --rebuild
```

This wipes the SQLite FTS index and reindexes every `.md` file from disk. The DB row's `updated_at` will not change (it's stored in the file's frontmatter), but the FTS index will reflect your edits immediately.

## Atomic writes

Every write goes through this sequence:

1. `gray-matter` parses the existing file (if any).
2. zod validates the new frontmatter.
3. A temp file `.{pid}-{rand}.tmp` is created in the same directory.
4. The new content is written and `fsync`'d.
5. `rename` over the target.
6. The DB row + FTS index are updated in a transaction.

If the process crashes mid-write, the original file is untouched and the temp file is left for cleanup. There is never a partial file at the target path.

## Encoding

- UTF-8, no BOM.
- LF line endings (`\n`). CRLF is normalized to LF on write.
- Trailing newline at end of file.

## Why Markdown?

- **Human-readable** — you can `cat` or `type` a note and understand it.
- **Git-friendly** — diffs are meaningful; merges are possible.
- **Portable** — moves between machines, editors, and tools without conversion.
- **Searchable** — FTS5 indexes the rendered text directly.
- **Future-proof** — Markdown is a stable, widely-implemented format.
