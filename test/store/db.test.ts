import { describe, it, expect } from "vitest";
import { openDb } from "../../src/store/db.js";
import { runMigrations, getCurrentVersion } from "../../src/store/migrations.js";
import { SCHEMA_VERSION } from "../../src/store/schema.js";
import { syncFts, removeFromFts, tagsToFts } from "../../src/store/fts.js";
import { ulid } from "ulid";
import type { NoteRecord } from "../../src/store/models.js";

function fresh(): ReturnType<typeof openDb> {
  return openDb({ path: ":memory:" });
}

function blank(): ReturnType<typeof openDb> {
  return openDb({ path: ":memory:", skipMigrations: true });
}

const ID_A = ulid();
const ID_B = ulid();
const NOW = "2026-01-15T14:32:11.045Z";

function makeNote(id: string, title: string, body: string, tags: string[] = []): NoteRecord {
  return {
    id,
    title,
    topic: "inbox",
    path: "/tmp/a.md",
    rel_path: "a.md",
    body,
    body_size: body.length,
    tags,
    links: [],
    source: "cli",
    schema_ver: 1,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    content_hash: "h",
  };
}

/** Insert a note into the `notes` table and return its rowid. */
function insertNote(db: ReturnType<typeof openDb>, note: NoteRecord): number {
  const result = db
    .prepare(
      `INSERT INTO notes (id, title, topic, path, rel_path, body, body_size, tags_json, links_json, source, schema_ver, created_at, updated_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      note.id,
      note.title,
      note.topic,
      note.path,
      note.rel_path,
      note.body,
      note.body_size,
      JSON.stringify(note.tags),
      JSON.stringify(note.links),
      note.source,
      note.schema_ver,
      note.created_at,
      note.updated_at,
      note.content_hash,
    );
  syncFts(db, note);
  return Number(result.lastInsertRowid);
}

describe("db", () => {
  it("opens with WAL pragma (no-op for in-memory but shouldn't throw)", () => {
    const db = fresh();
    expect(db).toBeDefined();
    db.close();
  });

  it("runs migrations on a fresh DB", () => {
    const db = fresh();
    const v = getCurrentVersion(db);
    expect(v).toBe(SCHEMA_VERSION);
    db.close();
  });

  it("idempotent: re-running migrations is a no-op", () => {
    const db = blank();
    const r1 = runMigrations(db);
    const r2 = runMigrations(db);
    expect(r1.applied).toEqual([SCHEMA_VERSION]);
    expect(r2.applied).toEqual([]);
    db.close();
  });

  it("FTS5 is reachable and syncFts makes notes searchable", () => {
    const db = fresh();
    insertNote(db, makeNote(ID_A, "SSH tunnels", "configuring ssh tunnels for windows", ["infra"]));
    const hits = db
      .prepare(`SELECT id FROM notes_fts WHERE notes_fts MATCH ?`)
      .all("ssh") as Array<{ id: string }>;
    expect(hits.length).toBe(1);
    expect(hits[0]?.id).toBe(ID_A);
    db.close();
  });

  it("FTS5 sync handles update and delete", () => {
    const db = fresh();
    insertNote(db, makeNote(ID_A, "alpha", "alpha body"));

    // Update: re-sync with new content. The FTS row should be replaced.
    syncFts(db, makeNote(ID_A, "beta", "beta body"));
    expect(
      (db.prepare(`SELECT id FROM notes_fts WHERE notes_fts MATCH ?`).all("alpha") as unknown[]).length,
    ).toBe(0);
    expect(
      (db.prepare(`SELECT id FROM notes_fts WHERE notes_fts MATCH ?`).all("beta") as unknown[]).length,
    ).toBe(1);

    // Delete: removeFromFts should drop the FTS row
    removeFromFts(db, ID_A);
    expect(
      (db.prepare(`SELECT id FROM notes_fts WHERE notes_fts MATCH ?`).all("beta") as unknown[]).length,
    ).toBe(0);

    expect(ID_B.length).toBe(26);
    db.close();
  });

  it("tagsToFts joins tags with spaces", () => {
    expect(tagsToFts(["a", "b", "c"])).toBe("a b c");
    expect(tagsToFts([])).toBe("");
    expect(tagsToFts(["  Trim  ", "Me"])).toBe("trim me");
  });
});
