import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ulid } from "ulid";
import { linkNotes } from "../../../src/mcp/tools/link.js";
import { saveNote } from "../../../src/mcp/tools/save.js";
import { openDbFile } from "../../../src/store/db.js";
import { initCommand } from "../../../src/cli/init.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;
let db: Awaited<ReturnType<typeof openDbFile>>;
let scopeRoot: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-link-"));
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

describe("memory_link", () => {
  it("creates a typed edge between two notes", async () => {
    const a = await saveNote(db, scopeRoot, { body: "a", title: "A" });
    const b = await saveNote(db, scopeRoot, { body: "b", title: "B" });
    if (!a.ok || !b.ok) throw new Error("setup failed");

    const r = linkNotes(db, scopeRoot, {
      src_id: a.data.id,
      dst_id: b.data.id,
      kind: "related",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.created).toBe(true);

    // The src note's links_json now includes dst_id.
    const row = db
      .prepare(`SELECT links_json FROM notes WHERE id = ?`)
      .get(a.data.id) as { links_json: string };
    const links = JSON.parse(row.links_json) as string[];
    expect(links).toContain(b.data.id);
  });

  it("is idempotent: second call returns created=false", async () => {
    const a = await saveNote(db, scopeRoot, { body: "a", title: "A" });
    const b = await saveNote(db, scopeRoot, { body: "b", title: "B" });
    if (!a.ok || !b.ok) throw new Error("setup failed");

    const r1 = linkNotes(db, scopeRoot, { src_id: a.data.id, dst_id: b.data.id });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.data.created).toBe(true);

    const r2 = linkNotes(db, scopeRoot, { src_id: a.data.id, dst_id: b.data.id });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.data.created).toBe(false);
  });

  it("rejects self-links", async () => {
    const a = await saveNote(db, scopeRoot, { body: "a", title: "A" });
    if (!a.ok) throw new Error("setup failed");

    const r = linkNotes(db, scopeRoot, { src_id: a.data.id, dst_id: a.data.id });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("validation_error");
  });

  it("returns not_found for missing source", async () => {
    const b = await saveNote(db, scopeRoot, { body: "b", title: "B" });
    if (!b.ok) throw new Error("setup failed");

    const r = linkNotes(db, scopeRoot, { src_id: ulid(), dst_id: b.data.id });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("not_found");
  });
});
