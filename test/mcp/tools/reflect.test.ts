import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reflectContext } from "../../../src/mcp/tools/reflect.js";
import { saveNote } from "../../../src/mcp/tools/save.js";
import { openDbFile } from "../../../src/store/db.js";
import { initCommand } from "../../../src/cli/init.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;
let db: Awaited<ReturnType<typeof openDbFile>>;
let scopeRoot: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-reflect-"));
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

describe("memory_reflect", () => {
  it("returns a helpful prompt_hint when no notes exist", async () => {
    const r = reflectContext(db, scopeRoot, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items).toEqual([]);
    expect(r.data.prompt_hint).toMatch(/no notes/i);
  });

  it("gathers recent notes and a synthesis prompt", async () => {
    await saveNote(db, scopeRoot, { body: "User prefers dark mode", title: "Theme", tags: ["preference"] });
    await saveNote(db, scopeRoot, { body: "User works at Acme", title: "Work", tags: ["job"] });

    const r = reflectContext(db, scopeRoot, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items.length).toBe(2);
    expect(r.data.prompt_hint).toMatch(/synthesize/i);
  });

  it("filters by topic", async () => {
    await saveNote(db, scopeRoot, { body: "x", title: "A", topic: "work" });
    await saveNote(db, scopeRoot, { body: "x", title: "B", topic: "personal" });

    const r = reflectContext(db, scopeRoot, { topic: "work" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items.length).toBe(1);
    expect(r.data.items[0]?.topic).toBe("work");
  });

  it("respects max_items", async () => {
    for (let i = 0; i < 5; i++) {
      await saveNote(db, scopeRoot, { body: `n${i}`, title: `n${i}` });
    }
    const r = reflectContext(db, scopeRoot, { max_items: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items.length).toBe(2);
  });

  it("includes a snippet of the body", async () => {
    await saveNote(db, scopeRoot, {
      body: "This is a long body that should be truncated to a snippet for the LLM.",
      title: "Long",
    });
    const r = reflectContext(db, scopeRoot, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items[0]?.snippet.length).toBeLessThanOrEqual(280);
    expect(r.data.items[0]?.snippet).toMatch(/long body/);
  });
});
