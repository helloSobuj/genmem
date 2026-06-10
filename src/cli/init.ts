// `genmem init` — create the scope directory structure, config.json,
// and an empty index.sqlite so the MCP server can start immediately.

import { mkdir, writeFile, access } from "node:fs/promises";
import { CONFIG } from "../config.js";
import { resolveScope, type ResolvedScope } from "../fs/scope.js";
import {
  attachmentsDir,
  configPath,
  dbPath,
  indexDir,
  memoryDir,
  topicsDir,
  trashDir,
} from "../fs/paths.js";
import { openDb } from "../store/db.js";
import { getLogger } from "../ui/log.js";

export interface InitOptions {
  user?: string;
  scope?: string;
  force?: boolean;
  quiet?: boolean;
}

export interface InitResult {
  scopeRoot: string;
  configPath: string;
  dbPath: string;
  created: boolean;
}

export async function initCommand(opts: InitOptions = {}): Promise<InitResult> {
  const log = getLogger();
  const scope: ResolvedScope = await resolveScope(
    { user: opts.user, scope: opts.scope },
  );

  const exists = await pathExists(scope.scopeRoot);

  // A "genmem scope" requires both a directory AND a config.json. A bare
  // directory (e.g. a fresh `mkdtemp`) is not an existing scope — it's
  // just an empty folder we're about to claim. This keeps `genmem init`
  // safe to call against any path the user points it at.
  const cfgPath = configPath(scope.scopeRoot);
  const configExists = await pathExists(cfgPath);
  const isInitialized = exists && configExists;
  if (isInitialized && !opts.force) {
    throw new Error(
      `scope already exists at ${scope.scopeRoot}. Use --force to re-initialize.`,
    );
  }

  // Create directory structure.
  await mkdir(memoryDir(scope.scopeRoot), { recursive: true });
  await mkdir(topicsDir(scope.scopeRoot), { recursive: true });
  await mkdir(attachmentsDir(scope.scopeRoot), { recursive: true });
  await mkdir(trashDir(scope.scopeRoot), { recursive: true });
  await mkdir(indexDir(scope.scopeRoot), { recursive: true });

  // Write config.json.
  const cfg = {
    version: 1,
    user: scope.user,
    active_profile: "default",
    created_at: new Date().toISOString(),
    schema_version: CONFIG.schemaVersion,
  };
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");

  // Create the empty index.sqlite so the MCP server can start without
  // requiring a separate `doctor --rebuild` step. This is a no-op if
  // the file already exists (e.g. re-running init after a partial setup).
  const dbFile = dbPath(scope.scopeRoot);
  const db = openDb({ path: dbFile });
  db.close();

  if (!opts.quiet) {
    log.info(`initialized scope at ${scope.scopeRoot}`);
    log.info(`user: ${scope.user}`);
  }

  return { scopeRoot: scope.scopeRoot, configPath: cfgPath, dbPath: dbFile, created: true };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
