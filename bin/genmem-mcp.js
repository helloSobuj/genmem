#!/usr/bin/env node
// Dispatcher:
//   - `genmem-mcp` (no subcommand) or `genmem-mcp serve` → MCP server on stdio
//   - anything else → CLI (re-spawned as a child)
//
// For the serve path we re-spawn `dist/cli/serve.js` as a child process
// with stdio inherited. This mirrors how real MCP clients (Claude
// Desktop, Cursor, etc.) launch the server. The serve entry keeps the
// child process alive via a heartbeat — see src/cli/serve.ts.
//
// Stdout is reserved for the MCP JSON-RPC stream in the serve path;
// every other code path uses stderr for diagnostics.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isPkg = !process.env.GENMEM_DEV;

const argv = process.argv.slice(2);
const isMcpLaunch = argv.length === 0 || argv[0] === "serve";

if (isMcpLaunch) {
  const entry = isPkg
    ? join(__dirname, "..", "dist", "cli", "serve.js")
    : join(__dirname, "..", "src", "cli", "serve.ts");
  const args = isPkg ? [entry, ...argv] : ["--import", "tsx", entry, ...argv];
  const child = spawn(process.execPath, args, { stdio: "inherit" });
  child.on("exit", (code, sig) => {
    if (sig) process.kill(process.pid, sig);
    else process.exit(code ?? 0);
  });
} else {
  const entry = isPkg
    ? join(__dirname, "..", "dist", "cli", "index.js")
    : join(__dirname, "..", "src", "cli", "index.ts");
  const args = isPkg ? [entry, ...argv] : ["--import", "tsx", entry, ...argv];
  const child = spawn(process.execPath, args, { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
}
