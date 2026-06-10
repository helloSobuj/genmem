// Per-editor MCP config detection, read, write, merge, and backup.
//
// Each AI client stores its MCP server config in a slightly different
// shape and at a slightly different path:
//
//   | Client         | Config file                                              | Key path                              | Entry shape                                        |
//   | -------------- | -------------------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
//   | Claude Desktop | %APPDATA%\Claude\claude_desktop_config.json              | mcpServers.genmem                     | { command, args, env }                             |
//   | Cursor         | %USERPROFILE%\.cursor\mcp.json                          | mcpServers.genmem                     | { command, args, env }                             |
//   | VS Code (Cline)| %APPDATA%\Code\User\settings.json                       | mcp.servers.genmem                     | { type: "stdio", command, args, env }              |
//   | Continue       | %USERPROFILE%\.continue\config.json                     | experimental.modelContextProtocolServers[] (append) | { name, transport, command, args, env }   |
//   | Windsurf       | %USERPROFILE%\.codeium\windsurf\mcp_config.json         | mcpServers.genmem                     | { command, args, env }                             |
//
// All paths are returned in forward-slash (portable) form for JSON
// safety; native APIs (existsSync, readFile) accept forward slashes
// on Windows.

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/** Known AI clients we can auto-configure. */
export type ClientId = "claude-desktop" | "cursor" | "vscode-cline" | "continue" | "windsurf";

export const ALL_CLIENTS: ClientId[] = [
  "claude-desktop",
  "cursor",
  "vscode-cline",
  "continue",
  "windsurf",
];

export interface ClientInfo {
  id: ClientId;
  name: string;
  configPath: string;
  /** Whether the config file currently exists on disk. */
  configExists: boolean;
  /** Whether the client app dir exists (looser detection signal). */
  appDirExists: boolean;
}

interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ClaudeStyleConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

interface VscodeMcpEntry {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface VscodeConfig {
  "mcp.servers"?: Record<string, VscodeMcpEntry>;
  [key: string]: unknown;
}

interface ContinueServerEntry {
  name: string;
  transport: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ContinueConfig {
  experimental?: {
    modelContextProtocolServers?: ContinueServerEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** The name we register ourselves under in each client. */
export const GENMEM_ENTRY_NAME = "genmem";

/**
 * Build the MCP server entry that points at the genmem dispatcher.
 *
 * `binPath` is the absolute path to `bin/genmem-mcp.js`. The dispatcher
 * reads the `serve` subcommand, opens the MCP server, and connects
 * over stdio.
 */
export function buildMcpEntry(binPath: string, scopeRoot: string): McpServerEntry {
  return {
    command: "node",
    args: [binPath, "serve"],
    env: { GENMEM_SCOPE: scopeRoot },
  };
}

/**
 * Resolve the absolute path to `bin/genmem-mcp.js`. We don't rely on
 * `process.argv[1]` because the install may be invoked from a context
 * where that doesn't point at the bin script.
 */
export function resolveBinPath(): string {
  // The bin script lives at <package>/bin/genmem-mcp.js. We resolve
  // relative to this module's location: src/fs/editor-config.ts is
  // three levels deep from the package root.
  const here = dirname(fileURLToPath(import.meta.url));
  // __dirname/src/fs -> ../../bin
  return join(here, "..", "..", "bin", "genmem-mcp.js");
}

/** Resolve per-client config paths. All returned in forward-slash form. */
export function resolveClientPaths(env: NodeJS.ProcessEnv = process.env): Record<ClientId, string> {
  const appdata = env.APPDATA ?? join(homedir(), "AppData/Roaming");
  const home = (env.USERPROFILE ?? homedir()).replace(/\\/g, "/");
  return {
    "claude-desktop": join(appdata, "Claude", "claude_desktop_config.json").replace(/\\/g, "/"),
    "cursor": join(home, ".cursor", "mcp.json").replace(/\\/g, "/"),
    "vscode-cline": join(appdata, "Code", "User", "settings.json").replace(/\\/g, "/"),
    "continue": join(home, ".continue", "config.json").replace(/\\/g, "/"),
    "windsurf": join(home, ".codeium", "windsurf", "mcp_config.json").replace(/\\/g, "/"),
  };
}

/** Detect which clients are installed (config file or app dir exists). */
export function detectClients(env: NodeJS.ProcessEnv = process.env): ClientInfo[] {
  const paths = resolveClientPaths(env);
  const results: ClientInfo[] = [];
  for (const id of ALL_CLIENTS) {
    const configPath = paths[id];
    const appDir = dirname(configPath);
    results.push({
      id,
      name: prettyClientName(id),
      configPath,
      configExists: existsSync(configPath),
      appDirExists: existsSync(appDir),
    });
  }
  return results;
}

export function prettyClientName(id: ClientId): string {
  switch (id) {
    case "claude-desktop": return "Claude Desktop";
    case "cursor": return "Cursor";
    case "vscode-cline": return "VS Code (Cline)";
    case "continue": return "Continue";
    case "windsurf": return "Windsurf";
  }
}

/** Action taken by a merge operation. */
export type MergeAction = "installed" | "updated" | "exists" | "no-config" | "skipped";

export interface MergeResult {
  client: ClientId;
  path: string;
  action: MergeAction;
  /** When action is "exists", why we didn't touch the file. */
  reason?: string;
  /** Path to the .bak.<ts> backup, if one was written. */
  backupPath?: string;
}

export interface MergeOptions {
  /** When true, overwrite an existing genmem entry (with backup). */
  force?: boolean;
  /** When true, do not write backup files. */
  noBackup?: boolean;
  /** When true, do not actually write anything; just report what would change. */
  dryRun?: boolean;
}

/**
 * Read a JSON config file. Returns an empty object if the file doesn't
 * exist. Throws if the file exists but is not valid JSON.
 */
function readJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  if (raw.trim().length === 0) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Write a JSON config file, creating parent dirs as needed. Preserves key order. */
function writeJsonFile(path: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/** Write a backup of the file to <path>.bak.<unix_ms>. Returns the backup path. */
function writeBackup(path: string): string {
  const backup = `${path}.bak.${Date.now()}`;
  copyFileSync(path, backup);
  return backup;
}

/** Get the genmem entry from a config, or undefined if absent. */
function findGenmemInClaudeStyle(config: ClaudeStyleConfig): McpServerEntry | undefined {
  return config.mcpServers?.[GENMEM_ENTRY_NAME];
}

function findGenmemInVscode(config: VscodeConfig): VscodeMcpEntry | undefined {
  return config["mcp.servers"]?.[GENMEM_ENTRY_NAME];
}

function findGenmemInContinue(config: ContinueConfig): ContinueServerEntry | undefined {
  const list = config.experimental?.modelContextProtocolServers;
  if (!list) return undefined;
  return list.find((s) => s.name === GENMEM_ENTRY_NAME);
}

/** Compare two entries for "same content" (order-insensitive on env). */
function entriesEqual(a: McpServerEntry, b: McpServerEntry): boolean {
  if (a.command !== b.command) return false;
  if (a.args.length !== b.args.length) return false;
  for (let i = 0; i < a.args.length; i++) {
    if (a.args[i] !== b.args[i]) return false;
  }
  // Env is order-insensitive.
  const aEnv = JSON.stringify(Object.entries(a.env ?? {}).sort());
  const bEnv = JSON.stringify(Object.entries(b.env ?? {}).sort());
  return aEnv === bEnv;
}

function continueEntriesEqual(a: ContinueServerEntry, b: ContinueServerEntry): boolean {
  return entriesEqual(a, b);
}

/** Merge the genmem entry into a Claude-style config. */
function mergeClaudeStyle(
  raw: Record<string, unknown>,
  entry: McpServerEntry,
  opts: MergeOptions,
): { next: ClaudeStyleConfig; action: MergeAction; reason?: string } {
  const config = raw as ClaudeStyleConfig;
  const existing = findGenmemInClaudeStyle(config);
  if (existing && !opts.force) {
    if (entriesEqual(existing, entry)) {
      return { next: config, action: "exists" };
    }
    return {
      next: config,
      action: "skipped",
      reason: "existing genmem entry points at a different path; use --force to overwrite",
    };
  }
  const next: ClaudeStyleConfig = {
    ...config,
    mcpServers: {
      ...(config.mcpServers ?? {}),
      [GENMEM_ENTRY_NAME]: entry,
    },
  };
  return { next, action: existing ? "updated" : "installed" };
}

/** Merge into a VS Code settings.json (mcp.servers subkey). */
function mergeVscode(
  raw: Record<string, unknown>,
  entry: VscodeMcpEntry,
  opts: MergeOptions,
): { next: VscodeConfig; action: MergeAction; reason?: string } {
  const config = raw as VscodeConfig;
  const existing = findGenmemInVscode(config);
  if (existing && !opts.force) {
    if (
      existing.command === entry.command &&
      existing.type === entry.type &&
      existing.args.length === entry.args.length &&
      existing.args.every((v, i) => v === entry.args[i]) &&
      JSON.stringify(Object.entries(existing.env ?? {}).sort()) ===
        JSON.stringify(Object.entries(entry.env ?? {}).sort())
    ) {
      return { next: config, action: "exists" };
    }
    return {
      next: config,
      action: "skipped",
      reason: "existing genmem entry differs; use --force to overwrite",
    };
  }
  const next: VscodeConfig = {
    ...config,
    "mcp.servers": {
      ...(config["mcp.servers"] ?? {}),
      [GENMEM_ENTRY_NAME]: entry,
    },
  };
  return { next, action: existing ? "updated" : "installed" };
}

/** Merge into a Continue config (array form under experimental.*). */
function mergeContinue(
  raw: Record<string, unknown>,
  entry: ContinueServerEntry,
  opts: MergeOptions,
): { next: ContinueConfig; action: MergeAction; reason?: string } {
  const config = raw as ContinueConfig;
  const list = config.experimental?.modelContextProtocolServers ?? [];
  const existing = findGenmemInContinue(config);
  if (existing && !opts.force) {
    if (continueEntriesEqual(existing, entry)) {
      return { next: config, action: "exists" };
    }
    return {
      next: config,
      action: "skipped",
      reason: "existing genmem entry differs; use --force to overwrite",
    };
  }
  // Remove any prior genmem entry, then append the new one.
  const filtered = list.filter((s) => s.name !== GENMEM_ENTRY_NAME);
  filtered.push(entry);
  const next: ContinueConfig = {
    ...config,
    experimental: {
      ...(config.experimental ?? {}),
      modelContextProtocolServers: filtered,
    },
  };
  return { next, action: existing ? "updated" : "installed" };
}

/**
 * Merge the genmem entry into the config for a given client. Returns
 * a MergeResult describing what happened (or what would happen, in
 * dry-run mode).
 */
export function mergeClient(
  client: ClientId,
  binPath: string,
  scopeRoot: string,
  opts: MergeOptions = {},
): MergeResult {
  const paths = resolveClientPaths();
  const configPath = paths[client];
  const baseEntry = buildMcpEntry(binPath, scopeRoot);
  const raw = readJsonFile(configPath);
  const fileExisted = existsSync(configPath);

  let result: { next: Record<string, unknown>; action: MergeAction; reason?: string };

  switch (client) {
    case "claude-desktop":
    case "cursor":
    case "windsurf": {
      const m = mergeClaudeStyle(raw, baseEntry, opts);
      result = { next: m.next as unknown as Record<string, unknown>, action: m.action, reason: m.reason };
      break;
    }
    case "vscode-cline": {
      const vsEntry: VscodeMcpEntry = { type: "stdio", ...baseEntry };
      const m = mergeVscode(raw, vsEntry, opts);
      result = { next: m.next as unknown as Record<string, unknown>, action: m.action, reason: m.reason };
      break;
    }
    case "continue": {
      const contEntry: ContinueServerEntry = { name: GENMEM_ENTRY_NAME, transport: "stdio", ...baseEntry };
      const m = mergeContinue(raw, contEntry, opts);
      result = { next: m.next as unknown as Record<string, unknown>, action: m.action, reason: m.reason };
      break;
    }
  }

  const out: MergeResult = {
    client,
    path: configPath,
    action: result.action,
    reason: result.reason,
  };

  if (result.action === "installed" || result.action === "updated") {
    if (!opts.dryRun) {
      if (fileExisted && !opts.noBackup) {
        out.backupPath = writeBackup(configPath);
      }
      writeJsonFile(configPath, result.next);
    }
  }

  return out;
}

/**
 * Remove the genmem entry from a client's config. If a `.bak.<ts>` file
 * exists, restore the most recent one. Otherwise rewrite the config
 * without the genmem entry.
 */
export function unmergeClient(
  client: ClientId,
  opts: MergeOptions = {},
): MergeResult {
  const paths = resolveClientPaths();
  const configPath = paths[client];
  if (!existsSync(configPath)) {
    return { client, path: configPath, action: "no-config" };
  }

  const raw = readJsonFile(configPath);
  const fileExisted = existsSync(configPath);
  let next: Record<string, unknown>;
  let hadEntry = false;

  switch (client) {
    case "claude-desktop":
    case "cursor":
    case "windsurf": {
      const config = raw as ClaudeStyleConfig;
      hadEntry = !!config.mcpServers?.[GENMEM_ENTRY_NAME];
      const mcpServers = { ...(config.mcpServers ?? {}) };
      delete mcpServers[GENMEM_ENTRY_NAME];
      next = { ...config, mcpServers };
      break;
    }
    case "vscode-cline": {
      const config = raw as VscodeConfig;
      hadEntry = !!config["mcp.servers"]?.[GENMEM_ENTRY_NAME];
      const servers = { ...(config["mcp.servers"] ?? {}) };
      delete servers[GENMEM_ENTRY_NAME];
      next = { ...config, "mcp.servers": servers };
      break;
    }
    case "continue": {
      const config = raw as ContinueConfig;
      const list = config.experimental?.modelContextProtocolServers ?? [];
      hadEntry = list.some((s) => s.name === GENMEM_ENTRY_NAME);
      const filtered = list.filter((s) => s.name !== GENMEM_ENTRY_NAME);
      next = {
        ...config,
        experimental: {
          ...(config.experimental ?? {}),
          modelContextProtocolServers: filtered,
        },
      };
      break;
    }
  }

  if (!hadEntry) {
    return { client, path: configPath, action: "exists" };
  }

  const out: MergeResult = {
    client,
    path: configPath,
    action: "installed", // semantic: we wrote the config
  };
  if (!opts.dryRun) {
    if (fileExisted && !opts.noBackup) {
      out.backupPath = writeBackup(configPath);
    }
    writeJsonFile(configPath, next);
  }
  return out;
}
