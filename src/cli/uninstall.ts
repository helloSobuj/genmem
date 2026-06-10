// `genmem uninstall` — remove the genmem MCP server entry from each
// detected AI client's config file.

import {
  detectClients,
  prettyClientName,
  unmergeClient,
  type ClientId,
  type ClientInfo,
  type MergeResult,
} from "../fs/editor-config.js";
import { getLogger } from "../ui/log.js";

export interface UninstallOptions {
  client?: ClientId;
  noBackup?: boolean;
  dryRun?: boolean;
  quiet?: boolean;
}

export interface UninstallReport {
  detected: ClientInfo[];
  results: MergeResult[];
}

export async function uninstallCommand(opts: UninstallOptions = {}): Promise<UninstallReport> {
  const log = getLogger();
  const detected = detectClients();

  const targets: ClientInfo[] = opts.client
    ? detected.filter((c) => c.id === opts.client)
    : detected;

  if (targets.length === 0) {
    if (!opts.quiet) {
      log.warn(opts.client
        ? `client '${opts.client}' is not a known target`
        : "no supported AI clients detected");
    }
    return { detected, results: [] };
  }

  const results: MergeResult[] = [];
  for (const c of targets) {
    const r = unmergeClient(c.id, { noBackup: opts.noBackup, dryRun: opts.dryRun });
    results.push(r);
  }
  return { detected, results };
}

export function printUninstallReport(
  report: UninstallReport,
  json: boolean,
  dryRun: boolean,
  log = getLogger(),
): void {
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }
  log.raw(`${dryRun ? "[dry-run] " : ""}genmem uninstall report`);
  log.raw("");
  if (report.results.length === 0) {
    log.raw("  no clients targeted");
    return;
  }
  for (const r of report.results) {
    const verb = r.action === "installed" ? (dryRun ? "would-remove" : "removed")
      : r.action === "exists" ? "no-entry"
      : r.action === "no-config" ? "no-config"
      : "skipped";
    let line = `    ${verb.padEnd(12)} ${prettyClientName(r.client).padEnd(18)} ${r.path}`;
    if (r.backupPath) line += `\n      backup: ${r.backupPath}`;
    log.raw(line);
  }
}
