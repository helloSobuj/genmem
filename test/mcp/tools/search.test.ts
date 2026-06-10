import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchNotes } from "../../../src/mcp/tools/search.js";
import { saveNote } from "../../../src/mcp/tools/save.js";
import { openDbFile } from "../../../src/store/db.js";
import { initCommand } from "../../../src/cli/init.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;
let db: Awaited<ReturnType<typeof openDbFile>>;
let scopeRoot: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-search-"));
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

describe("memory_search", () => {
  it("finds notes by free-text query", async () => {
    await saveNote(db, scopeRoot, {
      body: "configuring ssh tunnels for windows",
      title: "SSH",
      topic: "infra",
    });
    await saveNote(db, scopeRoot, {
      body: "how to cook pasta",
      title: "Cooking",
      topic: "recipes",
    });

    const r = searchNotes(db, scopeRoot, { query: "ssh" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.total).toBe(1);
    expect(r.data.results[0]?.title).toBe("SSH");
    expect(r.data.results[0]?.snippet).toContain("<<");
    expect(r.data.results[0]?.snippet).toContain(">>");
  });

  it("filters by topic", async () => {
    await saveNote(db, scopeRoot, { body: "database tips", title: "DB", topic: "work" });
    await saveNote(db, scopeRoot, { body: "database recipes", title: "DB Food", topic: "recipes" });

    const r = searchNotes(db, scopeRoot, { query: "database", topic: "work" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.total).toBe(1);
    expect(r.data.results[0]?.title).toBe("DB");
  });

  it("respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await saveNote(db, scopeRoot, { body: `note number ${i} about testing`, title: `n${i}` });
    }
    const r = searchNotes(db, scopeRoot, { query: "testing", limit: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.results.length).toBe(3);
  });

  it("escapes FTS5 operators in user input", async () => {
    // The user input contains a colon, which is an FTS5 column operator.
    // Without escaping, this would throw a syntax error.
    await saveNote(db, scopeRoot, { body: "hello world", title: "x" });
    const r = searchNotes(db, scopeRoot, { query: "title:hello" });
    expect(r.ok).toBe(true);
  });

  it("rejects invalid input", async () => {
    const r = searchNotes(db, scopeRoot, { query: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("validation_error");
  });
});
