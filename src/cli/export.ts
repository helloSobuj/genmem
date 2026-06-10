// `genmem export` — bundle a scope's markdown files (memory/, topics/,
// attachments/) into a portable zip. The DB and config.json are
// excluded by default; the DB is always rebuilt on import via
// `genmem doctor --rebuild`. Use --include-config to bundle the
// scope's config.json (useful for full backups).

import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveScope } from "../fs/scope.js";
import { attachmentsDir, memoryDir, topicsDir, configPath, trashDir } from "../fs/paths.js";
import { getLogger } from "../ui/log.js";
import { ensureZipSupport, zipDirectoryToFile } from "../util/zip.js";

export interface ExportOptions {
  user?: string;
  scope?: string;
  /** Output zip path. Required. */
  out: string;
  /** Include config.json in the archive. */
  includeConfig?: boolean;
  /** Quiet mode (suppress non-error output). */
  quiet?: boolean;
}

export interface ExportResult {
  scopeRoot: string;
  outPath: string;
  fileCount: number;
  totalBytes: number;
}

export async function exportCommand(opts: ExportOptions): Promise<ExportResult> {
  const log = getLogger();
  await ensureZipSupport();

  const scope = await resolveScope({ user: opts.user, scope: opts.scope });

  try {
    await stat(memoryDir(scope.scopeRoot));
  } catch {
    throw new Error(
      `scope has no memory/ directory at ${scope.scopeRoot} — run \`genmem init\` first`,
    );
  }

  await mkdir(dirname(opts.out), { recursive: true });

  const stats = await zipDirectoryToFile({
    source: scope.scopeRoot,
    outFile: opts.out,
    includeDirs: [memoryDir(scope.scopeRoot), topicsDir(scope.scopeRoot), attachmentsDir(scope.scopeRoot)],
    excludeDirs: [trashDir(scope.scopeRoot), join(scope.scopeRoot, "index")],
    includeFiles: opts.includeConfig ? [configPath(scope.scopeRoot)] : [],
    onFile: (rel) => {
      if (!opts.quiet) log.debug(`+ ${rel}`);
    },
  });

  if (!opts.quiet) {
    log.info(`exported ${stats.fileCount} file(s) (${stats.totalBytes} bytes) to ${opts.out}`);
  }

  return {
    scopeRoot: scope.scopeRoot,
    outPath: opts.out,
    fileCount: stats.fileCount,
    totalBytes: stats.totalBytes,
  };
}
