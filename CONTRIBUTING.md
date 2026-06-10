# Contributing

Thanks for your interest in improving genmem! This document covers the basics of development setup, coding conventions, and how to submit changes.

## Development setup

Requirements: **Node.js 22.12.0+**, npm 10+, Windows 10/11 or a recent Linux/macOS.

```bash
git clone https://github.com/<you>/genmem-mcp
cd genmem-mcp
npm install
npm run build
```

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run the full Vitest suite |
| `npm run lint` | ESLint over `src/` and `test/` |
| `npm run dev` | Run the CLI from source via `tsx` |

## Project layout

```
bin/genmem-mcp.js    # dispatcher: routes to MCP server or CLI
src/
├── config.ts        # frozen config constants (ULID pattern, body limit, etc.)
├── cli/             # commander subcommands (init, doctor, install, export, ...)
├── fs/              # path helpers, markdown I/O, scope resolution, editor config
├── mcp/             # MCP server + 8 tool handlers
├── store/           # SQLite schema, migrations, FTS5 sync, reindex
├── ui/              # stderr-only logger, TTY-aware spinner
└── util/            # zip writer/reader, other pure helpers
test/                # Vitest tests, mirroring src/ layout
docs/                # format.md, cli.md, mcp.md
```

## Coding conventions

- **ESM** throughout (`"type": "module"` in package.json). Use `.js` extensions in import paths even from `.ts` files.
- **Strict TypeScript** — no `any`, no `// @ts-ignore`. If you need to disable a check, prefer a narrow type assertion with a comment explaining why.
- **No comments unless they explain non-obvious behavior.** The code should be self-documenting. Comments are for the "why", not the "what".
- **stderr-only logging** in the CLI; stdout is reserved for MCP JSON-RPC and `--json` output.
- **Atomic file writes** — always write to `*.tmp` in the same directory, `fsync`, then `rename` over the target. Never partial writes.
- **Backwards compatibility** — schema changes go in new migrations; never edit `SCHEMA_SQL` after a release.

## Adding a new MCP tool

1. Create `src/mcp/tools/<name>.ts` with a zod-validated input schema, a `handler(db, scopeRoot, input)` function, and a `<name>Tool` descriptor (name, description, inputSchema).
2. Register it in `src/mcp/server.ts` by adding to the `ALL_TOOLS` array.
3. Add a test file `test/mcp/tools/<name>.test.ts` with at least: a happy path, a validation-error path, and any tool-specific edge cases.
4. Update `docs/mcp.md` with the new tool's input schema and return shape.

## Adding a new editor to `genmem install`

1. Add the client id to `ClientId` and `ALL_CLIENTS` in `src/fs/editor-config.ts`.
2. Add a path resolver in `resolveClientPaths()` and a pretty name in `prettyClientName()`.
3. Add a merge function (see `mergeClaudeStyle`, `mergeVscode`, `mergeContinue` for examples). The MCP entry shape is the same for all clients; what differs is where it lives in the config file.
4. Add fixtures in `test/fs/editor-config.test.ts` and an end-to-end test in `test/cli/install.test.ts`.

## Submitting a pull request

1. Branch from `main`.
2. Write tests for any new behavior. All existing tests must still pass.
3. Run `npm run typecheck && npm test && npm run lint` locally.
4. Open a PR with a clear description of the change. Reference any related issues.

## Reporting issues

Open a GitHub issue. Include:
- Your OS and Node.js version (`node --version`).
- The exact command you ran and its output.
- The contents of `genmem doctor` (with `--json` if possible).
- Steps to reproduce.

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities privately.
