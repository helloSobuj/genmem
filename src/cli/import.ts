// `genmem import` — restore a scope from a zip produced by
// `genmem export`. Extracts memory/, topics/, attachments/, and
// (optionally) config.json into the target scope, then runs
// `genmem doctor --rebuild` to repopulate the FTS index.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ulid } from "ulid";
import { resolveScope } from "../fs/scope.js";
import { attachmentsDir, configPath, memoryDir, topicsDir } from "../fs/paths.js";
import { getLogger } from "../ui/log.js";
import { ensureZipSupport, readZipFile } from "../util/zip.js";
import { reindex } from "../store/reindex.js";
import { openDbFile } from "../store/db.js";
import { initCommand } from "./init.js";

export interface ImportOptions {
  user?: string;
  scope?: string;
  /** Path to the zip file. Required. */
  in: string;
  /** Replace an existing scope instead of merging. */
  replace?: boolean;
  /** Quiet mode. */
  quiet?: boolean;
}

export interface ImportResult {
  scopeRoot: string;
  inPath: string;
  fileCount: number;
  merged: number;
  rebuilt: number;
}

export async function importCommand(opts: ImportOptions): Promise<ImportResult> {
  const log = getLogger();
  await ensureZipSupport();

  const scope = await resolveScope({ user: opts.user, scope: opts.scope });

  // Ensure the scope exists (we'll write into it). When --replace is
  // passed, force re-initialization so we can write into the same scope.
  // We pass the resolved user (not undefined) so initCommand's scope
  // resolution matches ours — otherwise it falls back to the OS user
  // and may try to re-init a different scope.
  await initCommand({
    user: scope.user,
    scope: scope.scopeRoot,
    force: !!opts.replace,
    quiet: true,
  });

  // Read all entries from the zip.
  const entries = await readZipFile(opts.in);

  let merged = 0;
  let replaced = 0;
  const collisionSuffix = ulid().slice(-6);

  for (const e of entries) {
    if (e.name === "config.json") {
      await writeFile(configPath(scope.scopeRoot), e.data);
      continue;
    }
    const target = join(scope.scopeRoot, e.name.replace(/\//g, require("node:path").sep));
    await mkdir(dirname(target), { recursive: true });
    if (opts.replace) {
      await writeFile(target, e.data);
      replaced++;
    } else {
      const ext = target.endsWith(".md") ? ".md" : "";
      const base = target.slice(0, target.length - ext.length);
      const safe = `${base}.${collisionSuffix}${ext}`;
      await writeFile(safe, e.data);
      merged++;
    }
  }

  if (!opts.quiet) {
    log.info(
      `imported ${entries.length} entries from ${opts.in} (${replaced} replaced, ${merged} merged)`,
    );
  }

  // Rebuild the FTS index from the restored markdown files.
  const db = await openDbFile(join(scope.scopeRoot, "index", "index.sqlite"));
  let rebuilt = 0;
  try {
    const r = await reindex(db, scope.scopeRoot);
    rebuilt = r.scanned;
    if (!opts.quiet) {
      log.info(
        `rebuilt: scanned ${r.scanned}, inserted ${r.inserted}, updated ${r.updated}, removed ${r.removed}`,
      );
    }
  } finally {
    db.close();
  }

  return {
    scopeRoot: scope.scopeRoot,
    inPath: opts.in,
    fileCount: entries.length,
    merged,
    rebuilt,
  };
}

// Suppress unused
void memoryDir;
void topicsDir;
void attachmentsDir;
