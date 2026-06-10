import { describe, it, expect } from "vitest";
import { openDb } from "../../src/store/db.js";
import { runMigrations, getCurrentVersion } from "../../src/store/migrations.js";
import { SCHEMA_VERSION } from "../../src/store/schema.js";

describe("migrations", () => {
  it("apply on a fresh DB", () => {
    const db = openDb({ path: ":memory:" });
    expect(getCurrentVersion(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it("are idempotent", () => {
    const db = openDb({ path: ":memory:", skipMigrations: true });
    const r1 = runMigrations(db);
    const r2 = runMigrations(db);
    expect(r1.applied.length).toBe(1);
    expect(r2.applied.length).toBe(0);
    db.close();
  });
});
