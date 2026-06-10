// `genmem serve` — start the MCP server on stdio.

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolveScope } from "../fs/scope.js";
import { createServer } from "../mcp/server.js";
import { initCommand } from "./init.js";
import { getLogger } from "../ui/log.js";
import { join } from "node:path";

export interface ServeOptions {
  user?: string;
  scope?: string;
  /** If true, run `genmem init` first if the scope doesn't exist. */
  initIfMissing?: boolean;
}

export async function serveCommand(opts: ServeOptions = {}): Promise<void> {
  const log = getLogger();
  const scope = await resolveScope({ user: opts.user, scope: opts.scope });
  const cfgPath = join(scope.scopeRoot, "config.json");

  if (!existsSync(cfgPath) && opts.initIfMissing) {
    await initCommand({ user: opts.user, scope: opts.scope, quiet: true });
  }

  if (!existsSync(cfgPath)) {
    log.error(
      `no scope at ${scope.scopeRoot} — run \`genmem init\` first, or pass --init-if-missing`,
    );
    process.exit(1);
  }

  const server = await createServer({ user: opts.user, scope: opts.scope });
  await server.runStdio();

  // Keep the event loop alive. The MCP SDK's StdioServerTransport
  // drains process.stdin internally and closes it, which would
  // otherwise let Node's event loop exit. We park here on a ref'd
  // heartbeat interval and only resolve on an explicit termination
  // signal. The SDK's transport reads from stdin asynchronously, so
  // requests from the client will still be processed.
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      // no-op: the interval handle keeps the event loop alive.
    }, 60_000);
    const done = () => {
      clearInterval(timer);
      resolve();
    };
    process.on("SIGINT", done);
    process.on("SIGTERM", done);
    process.on("SIGHUP", done);
  });

  await server.close();
}

// When run directly (not imported), invoke serveCommand.
const isDirectRun =
  import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : "");
if (isDirectRun) {
  serveCommand().catch((err) => {
    process.stderr.write(`[error] ${(err as Error).message}\n`);
    process.exit(1);
  });
}
