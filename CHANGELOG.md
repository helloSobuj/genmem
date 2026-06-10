# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial public release.
- Local-first markdown memory with FTS5 search.
- MCP server exposing 8 tools: `memory_save`, `memory_search`, `memory_get`,
  `memory_recent`, `memory_topics`, `memory_delete`, `memory_link`,
  `memory_reflect`.
- Auto-installer for Claude Desktop, Cursor, VS Code (Cline), Continue,
  and Windsurf via `npx -y genmem-mcp install`.
- Export/import a scope as a portable zip (with built-in zero-dependency
  ZIP writer and CRC32-verifying reader).
- Doctor command with diagnostics, OneDrive warnings, and
  `--rebuild` for FTS index recovery.
- CI workflow on Windows + Node 22.

## [0.1.0] — 2026-06-10

### Added
- Everything in [Unreleased]. This is the first published release.
