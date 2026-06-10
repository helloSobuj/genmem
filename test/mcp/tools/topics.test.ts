import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listTopics } from "../../../src/mcp/tools/topics.js";
import { saveNote } from "../../../src/mcp/tools/save.js";
import { openDbFile } from "../../../src/store/db.js";
import { initCommand } from "../../../src/cli/init.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;
let db: Awaited<ReturnType<typeof openDbFile>>;
let scopeRoot: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-topics-"));
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

describe("memory_topics", () => {
  it("returns empty list when no notes", async () => {
    const r = listTopics(db, scopeRoot, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.topics).toEqual([]);
  });

  it("aggregates counts per topic", async () => {
    await saveNote(db, scopeRoot, { body: "x", title: "A", topic: "work" });
    await saveNote(db, scopeRoot, { body: "x", title: "B", topic: "work" });
    await saveNote(db, scopeRoot, { body: "x", title: "C", topic: "personal" });

    const r = listTopics(db, scopeRoot, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const work = r.data.topics.find((t) => t.name === "work");
    const personal = r.data.topics.find((t) => t.name === "personal");
    expect(work?.count).toBe(2);
    expect(personal?.count).toBe(1);
  });

  it("orders by count desc, then name asc", async () => {
    await saveNote(db, scopeRoot, { body: "x", title: "A", topic: "alpha" });
    await saveNote(db, scopeRoot, { body: "x", title: "B", topic: "beta" });
    await saveNote(db, scopeRoot, { body: "x", title: "C", topic: "beta" });
    await saveNote(db, scopeRoot, { body: "x", title: "D", topic: "gamma" });
    await saveNote(db, scopeRoot, { body: "x", title: "E", topic: "gamma" });
    await saveNote(db, scopeRoot, { body: "x", title: "F", topic: "gamma" });

    const r = listTopics(db, scopeRoot, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.topics[0]?.name).toBe("gamma");
    expect(r.data.topics[1]?.name).toBe("beta");
    expect(r.data.topics[2]?.name).toBe("alpha");
  });
});
