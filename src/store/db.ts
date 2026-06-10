// SQLite connection helper. Sets safe pragmas on every open. Single instance
// per scope is fine; better-sqlite3 is synchronous and serializable.

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { runMigrations } from "./migrations.js";

export interface OpenOptions {
  /** File path or ":memory:". */
  path: string;
  /** Skip running migrations (used by tests for blank-DB scenarios). */
  skipMigrations?: boolean;
  /** Read-only mode. */
  readonly?: boolean;
}

export function openDb(opts: OpenOptions): DatabaseType {
  const db = new Database(opts.path, { readonly: opts.readonly ?? false });
  if (!opts.readonly) {
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    db.pragma("temp_store = MEMORY");
  }
  if (!opts.skipMigrations && !opts.readonly) {
    runMigrations(db);
  }
  return db;
}

/** Open a DB on disk after ensuring the parent dir exists. */
export async function openDbFile(path: string): Promise<DatabaseType> {
  await mkdir(dirname(path), { recursive: true });
  return openDb({ path });
}
