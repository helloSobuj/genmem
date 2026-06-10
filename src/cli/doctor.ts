// `genmem doctor` — run diagnostics, optionally rebuild the FTS index.

import { access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolveScope } from "../fs/scope.js";
import { openDb, openDbFile } from "../store/db.js";
import { configPath, dbPath } from "../fs/paths.js";
import { reindex } from "../store/reindex.js";
import { getLogger } from "../ui/log.js";

export interface DoctorOptions {
  user?: string;
  scope?: string;
  json?: boolean;
  rebuild?: boolean;
  quiet?: boolean;
}

export interface DoctorReport {
  ok: boolean;
  scopeRoot: string;
  scopeExists: boolean;
  configExists: boolean;
  dbExists: boolean;
  dbIntegrity: "ok" | "fail" | "skipped";
  ftsCount: number;
  notesCount: number;
  onedriveWarning: boolean;
  errors: string[];
  warnings: string[];
  rebuild?: { scanned: number; inserted: number; updated: number; removed: number; errors: Array<{ file: string; message: string }> };
}

export async function doctorCommand(opts: DoctorOptions = {}): Promise<DoctorReport> {
  const log = getLogger();
  const scope = await resolveScope({ user: opts.user, scope: opts.scope });
  const report: DoctorReport = {
    ok: true,
    scopeRoot: scope.scopeRoot,
    scopeExists: false,
    configExists: false,
    dbExists: false,
    dbIntegrity: "skipped",
    ftsCount: 0,
    notesCount: 0,
    onedriveWarning: false,
    errors: [],
    warnings: [],
  };

  // 1. Scope directory exists?
  try {
    await access(scope.scopeRoot);
    report.scopeExists = true;
  } catch {
    report.errors.push(`scope root does not exist: ${scope.scopeRoot}`);
    report.ok = false;
  }

  // 2. Config file exists?
  const cfgPath = configPath(scope.scopeRoot);
  report.configExists = existsSync(cfgPath);
  if (!report.configExists && report.scopeExists) {
    report.warnings.push(`config.json missing at ${cfgPath} — run \`genmem init\``);
  }

  // 3. DB file exists?
  const dbFile = dbPath(scope.scopeRoot);
  report.dbExists = existsSync(dbFile);

  if (!report.dbExists && report.scopeExists) {
    report.warnings.push(`index.sqlite missing at ${dbFile} — will be created on first write`);
  }

  // 4. OneDrive warning: scope inside a known synced folder.
  if (isInsideOneDrive(scope.scopeRoot)) {
    report.onedriveWarning = true;
    report.warnings.push(
      `scope is inside a OneDrive folder; sync conflicts may corrupt notes. Move to %USERPROFILE%\\.genmem`,
    );
  }

  // 5. Open DB and run integrity check (if it exists).
  if (report.dbExists) {
    const db = openDb({ path: dbFile, readonly: true });
    try {
      const result = db.pragma("integrity_check", { simple: true });
      if (result === "ok") {
        report.dbIntegrity = "ok";
      } else {
        report.dbIntegrity = "fail";
        report.errors.push(`sqlite integrity_check failed: ${result}`);
        report.ok = false;
      }
      report.notesCount = (db.prepare(`SELECT count(*) as c FROM notes`).get() as { c: number }).c;
      report.ftsCount = (db.prepare(`SELECT count(*) as c FROM notes_fts`).get() as { c: number }).c;
    } catch (e) {
      report.dbIntegrity = "fail";
      report.errors.push(`sqlite error: ${(e as Error).message}`);
      report.ok = false;
    } finally {
      db.close();
    }
  }

  // 6. Optional rebuild.
  if (opts.rebuild && report.scopeExists) {
    const db = await openDbFile(dbFile);
    try {
      // Drop any rows with deleted_at set; reindex scans disk and re-inserts.
      const r = await reindex(db, scope.scopeRoot);
      report.rebuild = { scanned: r.scanned, inserted: r.inserted, updated: r.updated, removed: r.removed, errors: r.errors };
      report.notesCount = (db.prepare(`SELECT count(*) as c FROM notes`).get() as { c: number }).c;
      report.ftsCount = (db.prepare(`SELECT count(*) as c FROM notes_fts`).get() as { c: number }).c;
      if (!opts.quiet && !opts.json) {
        log.info(
          `rebuilt: scanned ${r.scanned}, inserted ${r.inserted}, updated ${r.updated}, removed ${r.removed}`,
        );
      }
    } finally {
      db.close();
    }
  }

  if (report.errors.length > 0) report.ok = false;

  return report;
}

const ONEDRIVE_HINTS = ["onedrive", "OneDrive", "OneDrive - "];

function isInsideOneDrive(p: string): boolean {
  const lower = p.toLowerCase();
  return ONEDRIVE_HINTS.some((h) => lower.includes(h.toLowerCase()));
}
