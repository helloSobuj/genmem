# CLI Reference

`genmem` is the command-line interface. It also doubles as the MCP server entry point — when called as `genmem serve` (or with no subcommand), it starts the MCP server on stdio for AI clients to attach to.

## Synopsis

```
genmem [global flags] <command> [command flags]
genmem serve                       # default: start MCP server
```

## Global flags

| Flag | Description |
|---|---|
| `--user <name>` | Override the scope user (otherwise the OS user). |
| `--scope <path>` | Override the scope root (otherwise `~/.genmem` or `$GENMEM_SCOPE`). |
| `--log-level <level>` | One of `debug`, `info`, `warn`, `error`, `silent`. Default: `info`. |
| `--json` | Output JSON where applicable (most commands). |
| `--quiet` | Suppress non-error output. |
| `--no-color` | Disable ANSI colors (also via `NO_COLOR` env). |

## Commands

### `genmem init`

Create the scope directory structure (`memory/`, `topics/`, `attachments/`, `.trash/`, `index/`) and write `config.json` with a fresh empty SQLite index.

```
genmem init [--force]
```

- `--force` — re-initialize even if the scope already exists. Existing notes are preserved.

### `genmem doctor`

Run diagnostics and print a health report. Useful for post-install verification or after restoring from a backup.

```
genmem doctor [--rebuild] [--json]
```

Checks performed:
- Scope directory exists and is writable.
- `config.json` is present and well-formed.
- `index.sqlite` exists and passes `PRAGMA integrity_check`.
- OneDrive warning if the scope is inside a known synced folder.
- FTS index row count vs. `notes` row count.

- `--rebuild` — wipe the FTS index and reindex every `.md` file from disk. Use this after bulk-editing notes outside genmem.

Exit codes: `0` healthy, `1` errors found, `2` usage error.

### `genmem list`

List notes from the index, most recently updated first.

```
genmem list [--topic <name>] [--limit <n>] [--json]
```

- `--topic` — filter by exact topic.
- `--limit` — max items, default 50.

### `genmem search`

Search notes from the command line. The MCP `memory_search` tool is the recommended way; this command is a convenience for humans.

```
genmem search "query" [--topic <name>] [--limit <n>] [--json]
```

### `genmem install`

Auto-register `genmem` as an MCP server in every detected AI client (Claude Desktop, Cursor, VS Code/Cline, Continue, Windsurf).

```
genmem install [--client <name>] [--force] [--no-backup] [--dry-run] [--json]
```

- `--client` — target a single client (default: all detected). One of `claude-desktop`, `cursor`, `vscode-cline`, `continue`, `windsurf`.
- `--force` — overwrite an existing genmem entry (with backup).
- `--no-backup` — skip the `.bak.<ts>` backup before overwriting.
- `--dry-run` — show what would change without writing.

The installer writes the absolute path to the `bin/genmem-mcp.js` dispatcher into each client's config file. It preserves any other entries.

### `genmem uninstall`

Reverse of `install`. Removes the `genmem` entry from each detected client's config and writes a `.bak.<ts>` backup of every modified file.

```
genmem uninstall [--client <name>] [--no-backup] [--dry-run] [--json]
```

### `genmem config`

Read or write the scope's `config.json`.

```
genmem config get <key>     # print a value
genmem config set <key> <value>
genmem config path          # print the config.json absolute path
```

Recognized keys: `user`, `active_profile`. Unknown keys are rejected.

### `genmem export`

Bundle a scope's Markdown files (memory/, topics/, attachments/) into a portable zip. The DB and config.json are excluded by default — the DB is always rebuilt on import.

```
genmem export --out <file.zip> [--include-config] [--quiet]
```

- `--include-config` — also bundle `config.json` (useful for full backups).

### `genmem import`

Restore a scope from a zip produced by `genmem export`. Extracts files into the target scope, then runs `genmem doctor --rebuild` to repopulate the FTS index.

```
genmem import --in <file.zip> [--replace] [--quiet]
```

- `--replace` — overwrite existing files in the target scope. Without this, files are written to suffixed paths to avoid collisions.

### `genmem serve`

Start the MCP server on stdio. This is the entry point AI clients use.

```
genmem serve
```

The server keeps running until stdin closes or a `SIGINT`/`SIGTERM`/`SIGHUP` signal is received. Stdout is reserved for the JSON-RPC stream; all diagnostics go to stderr.

## Environment variables

| Variable | Effect |
|---|---|
| `GENMEM_SCOPE` | Override the scope root (equivalent to `--scope`). |
| `GENMEM_USER` | Override the scope user. |
| `GENMEM_LOG` | Default log level (`debug`\|`info`\|`warn`\|`error`\|`silent`). |
| `NO_COLOR` | Disable ANSI colors. |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. |
| 1 | Doctor found errors, or `install` skipped an overwrite without `--force`. |
| 2 | Usage error (bad flags, missing required option). |
| 3 | Scope not found (`serve` with no scope initialized). |
