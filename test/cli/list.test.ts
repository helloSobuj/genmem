import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ulid } from "ulid";
import { initCommand } from "../../src/cli/init.js";
import { listCommand } from "../../src/cli/list.js";
import { openDbFile } from "../../src/store/db.js";
import { syncFts } from "../../src/store/fts.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;

const NOW = "2026-01-15T14:32:11.045Z";

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-list-"));
  envSnapshot = { ...process.env };
  delete process.env.GENMEM_SCOPE;
  delete process.env.GENMEM_USER;
  await initCommand({ scope: tmp });
});
afterEach(async () => {
  process.env = envSnapshot;
  await rm(tmp, { recursive: true, force: true });
});

async function seedNote(opts: {
  id: string;
  title: string;
  body: string;
  topic: string;
  tags?: string[];
}) {
  const db = await openDbFile(join(tmp, "index", "index.sqlite"));
  db.prepare(
    `INSERT INTO notes (id, title, topic, path, rel_path, body, body_size, tags_json, links_json, source, schema_ver, created_at, updated_at, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.id,
    opts.title,
    opts.topic,
    `/tmp/${opts.id}.md`,
    `${opts.id}.md`,
    opts.body,
    opts.body.length,
    JSON.stringify(opts.tags ?? []),
    "[]",
    "cli",
    1,
    NOW,
    NOW,
    "h",
  );
  syncFts(db, {
    id: opts.id,
    title: opts.title,
    topic: opts.topic,
    path: `/tmp/${opts.id}.md`,
    rel_path: `${opts.id}.md`,
    body: opts.body,
    body_size: opts.body.length,
    tags: opts.tags ?? [],
    links: [],
    source: "cli",
    schema_ver: 1,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    content_hash: "h",
  });
  db.close();
}

describe("list", () => {
  it("returns empty when DB is empty", async () => {
    const items = await listCommand({ scope: tmp });
    expect(items).toEqual([]);
  });

  it("lists notes from the DB", async () => {
    const id = ulid();
    await seedNote({ id, title: "Alpha", body: "alpha body", topic: "inbox" });
    const items = await listCommand({ scope: tmp });
    expect(items.length).toBe(1);
    expect(items[0]?.id).toBe(id);
    expect(items[0]?.title).toBe("Alpha");
    expect(items[0]?.topic).toBe("inbox");
  });

  it("filters by topic", async () => {
    const a = ulid();
    const b = ulid();
    await seedNote({ id: a, title: "A", body: "a", topic: "work" });
    await seedNote({ id: b, title: "B", body: "b", topic: "personal" });
    const workItems = await listCommand({ scope: tmp, topic: "work" });
    expect(workItems.length).toBe(1);
    expect(workItems[0]?.id).toBe(a);
  });

  it("respects --limit", async () => {
    for (let i = 0; i < 5; i++) {
      await seedNote({ id: ulid(), title: `n${i}`, body: "x", topic: "inbox" });
    }
    const items = await listCommand({ scope: tmp, limit: 3 });
    expect(items.length).toBe(3);
  });
});
