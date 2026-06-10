// `genmem install` — detect installed AI clients and merge a genmem
// MCP server entry into each one's config file.

import {
  ALL_CLIENTS,
  detectClients,
  mergeClient,
  prettyClientName,
  resolveBinPath,
  resolveClientPaths,
  type ClientId,
  type ClientInfo,
  type MergeResult,
} from "../fs/editor-config.js";
import { getLogger } from "../ui/log.js";
import { resolveScope } from "../fs/scope.js";

export interface InstallOptions {
  /** Target a specific client (default: all detected). */
  client?: ClientId;
  /** Override the resolved scope root. */
  scope?: string;
  /** Override the resolved user. */
  user?: string;
  /** Overwrite an existing genmem entry (with backup). */
  force?: boolean;
  /** Don't write backup files. */
  noBackup?: boolean;
  /** Don't actually write; print what would change. */
  dryRun?: boolean;
  /** Suppress non-error output. */
  quiet?: boolean;
}

export interface InstallReport {
  scopeRoot: string;
  binPath: string;
  detected: ClientInfo[];
  results: MergeResult[];
}

export async function installCommand(opts: InstallOptions = {}): Promise<InstallReport> {
  const log = getLogger();
  const scope = await resolveScope({ user: opts.user, scope: opts.scope });
  const binPath = resolveBinPath();
  const detected = detectClients();

  // Filter to the requested client, if any.
  const targets: ClientInfo[] = opts.client
    ? detected.filter((c) => c.id === opts.client)
    : detected;

  if (targets.length === 0) {
    if (!opts.quiet) {
      log.warn(opts.client
        ? `client '${opts.client}' is not a known target`
        : "no supported AI clients detected on this system");
    }
    return { scopeRoot: scope.scopeRoot, binPath, detected, results: [] };
  }

  const results: MergeResult[] = [];
  for (const c of targets) {
    const r = mergeClient(c.id, binPath, scope.scopeRoot, {
      force: opts.force,
      noBackup: opts.noBackup,
      dryRun: opts.dryRun,
    });
    results.push(r);
  }

  return { scopeRoot: scope.scopeRoot, binPath, detected, results };
}

/**
 * Print a human-readable report to stderr. JSON output goes to stdout
 * (for piping) when opts.json is true.
 */
export function printInstallReport(
  report: InstallReport,
  json: boolean,
  dryRun: boolean,
  log = getLogger(),
): void {
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  log.raw(`${dryRun ? "[dry-run] " : ""}genmem install report`);
  log.raw(`  scope:  ${report.scopeRoot}`);
  log.raw(`  bin:    ${report.binPath}`);
  log.raw("");
  log.raw("  detected clients:");
  for (const c of report.detected) {
    const mark = c.configExists ? "✓" : c.appDirExists ? "·" : "✗";
    log.raw(`    ${mark} ${prettyClientName(c.id).padEnd(18)} ${c.configPath}`);
  }
  log.raw("");
  if (report.results.length === 0) {
    log.raw("  no clients targeted");
    return;
  }
  log.raw("  results:");
  for (const r of report.results) {
    const verb = actionVerb(r.action, dryRun);
    let line = `    ${verb.padEnd(10)} ${prettyClientName(r.client).padEnd(18)} ${r.path}`;
    if (r.reason) line += `\n      reason: ${r.reason}`;
    if (r.backupPath) line += `\n      backup: ${r.backupPath}`;
    log.raw(line);
  }
}

function actionVerb(action: MergeResult["action"], dryRun: boolean): string {
  const prefix = dryRun ? "would-" : "";
  switch (action) {
    case "installed": return prefix + "installed";
    case "updated": return prefix + "updated";
    case "exists": return "unchanged";
    case "no-config": return "no-config";
    case "skipped": return "skipped";
  }
}

// Suppress unused
void ALL_CLIENTS;
void resolveClientPaths;
