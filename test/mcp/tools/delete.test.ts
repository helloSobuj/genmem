import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { deleteNote } from "../../../src/mcp/tools/delete.js";
import { saveNote } from "../../../src/mcp/tools/save.js";
import { openDbFile } from "../../../src/store/db.js";
import { initCommand } from "../../../src/cli/init.js";
import { ulid } from "ulid";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;
let db: Awaited<ReturnType<typeof openDbFile>>;
let scopeRoot: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-delete-"));
  envSnapshot = { ...process.env };
  delete process.env.GENMEM_SCOPE;
  delete process.env.GENMEM_USER;
  await initCommand({ scope: tmp, quiet: true });
  scopeRoot = tmp;
  db = await openDbFile(join(tmp, "index", "index.sqlite"));
});

afterEach(async () => {
  db.close();
  process.env = envSnapshot;
  await rm(tmp, { recursive: true, force: true });
});

describe("memory_delete", () => {
  it("soft-deletes a note (sets deleted_at, moves to .trash)", async () => {
    const saved = await saveNote(db, scopeRoot, { body: "doomed", title: "Doomed" });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const r = deleteNote(db, scopeRoot, { id: saved.data.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.hard).toBe(false);
    expect(r.data.trashed_path).toContain(".trash");

    // The original file is gone.
    expect(existsSync(saved.data.path)).toBe(false);
    // The trashed file exists.
    expect(existsSync(fromPortable(r.data.trashed_path))).toBe(true);

    // The DB row is marked deleted.
    const row = db
      .prepare(`SELECT deleted_at FROM notes WHERE id = ?`)
      .get(saved.data.id) as { deleted_at: string | null } | undefined;
    expect(row?.deleted_at).not.toBeNull();

    // FTS index no longer returns the note.
    const hits = db
      .prepare(`SELECT id FROM notes_fts WHERE notes_fts MATCH ?`)
      .all("doomed") as Array<{ id: string }>;
    expect(hits.length).toBe(0);
  });

  it("refuses hard delete on a non-trashed note", async () => {
    const saved = await saveNote(db, scopeRoot, { body: "x", title: "x" });
    if (!saved.ok) throw new Error("setup failed");

    const r = deleteNote(db, scopeRoot, { id: saved.data.id, hard: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("trash_purge_required");
  });

  it("returns not_found for missing id", async () => {
    const r = deleteNote(db, scopeRoot, { id: ulid() });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("not_found");
  });

  it("rejects invalid input", async () => {
    const r = deleteNote(db, scopeRoot, { id: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("validation_error");
  });
});

function fromPortable(p: string): string {
  return p;
}

// Suppress unused
void readdir;
