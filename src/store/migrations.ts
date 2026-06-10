// Versioned migrations. PRAGMA user_version is the source of truth;
// meta.schema_version is mirrored for human inspection.

import type { Database } from "better-sqlite3";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";

export interface Migration {
  version: number;
  up: (db: Database) => void;
  description: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: SCHEMA_VERSION,
    description: "Initial schema: notes, FTS5, topic stats, note links",
    up: (db) => {
      db.exec(SCHEMA_SQL);
    },
  },
];

export function getCurrentVersion(db: Database): number {
  const row = db.pragma("user_version", { simple: true }) as number;
  return typeof row === "number" ? row : 0;
}

/** Run all pending migrations in order. Idempotent. */
export function runMigrations(db: Database): { applied: number[]; current: number } {
  const current = getCurrentVersion(db);
  const applied: number[] = [];

  if (current === 0) {
    // Fresh DB — apply all migrations.
    db.transaction(() => {
      for (const m of MIGRATIONS) {
        m.up(db);
        db.pragma(`user_version = ${m.version}`);
        applied.push(m.version);
      }
    })();
  } else if (current < SCHEMA_VERSION) {
    db.transaction(() => {
      for (const m of MIGRATIONS) {
        if (m.version > current) {
          m.up(db);
          db.pragma(`user_version = ${m.version}`);
          applied.push(m.version);
        }
      }
    })();
  }

  return { applied, current: SCHEMA_VERSION };
}
