import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recentNotes } from "../../../src/mcp/tools/recent.js";
import { saveNote } from "../../../src/mcp/tools/save.js";
import { openDbFile } from "../../../src/store/db.js";
import { initCommand } from "../../../src/cli/init.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;
let db: Awaited<ReturnType<typeof openDbFile>>;
let scopeRoot: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-recent-"));
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

describe("memory_recent", () => {
  it("returns empty list when no notes exist", async () => {
    const r = recentNotes(db, scopeRoot, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items).toEqual([]);
  });

  it("returns most recently updated first", async () => {
    const a = await saveNote(db, scopeRoot, { body: "first", title: "A" });
    // Wait a tick so updated_at differs.
    await new Promise((res) => setTimeout(res, 10));
    const b = await saveNote(db, scopeRoot, { body: "second", title: "B" });
    if (!a.ok || !b.ok) throw new Error("setup failed");

    const r = recentNotes(db, scopeRoot, { limit: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items[0]?.id).toBe(b.data.id);
    expect(r.data.items[1]?.id).toBe(a.data.id);
  });

  it("filters by topic", async () => {
    await saveNote(db, scopeRoot, { body: "x", title: "A", topic: "work" });
    await saveNote(db, scopeRoot, { body: "x", title: "B", topic: "personal" });

    const r = recentNotes(db, scopeRoot, { topic: "work" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items.length).toBe(1);
    expect(r.data.items[0]?.title).toBe("A");
  });

  it("respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await saveNote(db, scopeRoot, { body: `n${i}`, title: `n${i}` });
    }
    const r = recentNotes(db, scopeRoot, { limit: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items.length).toBe(3);
  });
});
