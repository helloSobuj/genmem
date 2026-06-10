import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ulid } from "ulid";
import { saveNote } from "../../../src/mcp/tools/save.js";
import { openDbFile } from "../../../src/store/db.js";
import { initCommand } from "../../../src/cli/init.js";
import { syncFts } from "../../../src/store/fts.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;
let db: Awaited<ReturnType<typeof openDbFile>>;
let scopeRoot: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-save-"));
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

describe("memory_save", () => {
  it("creates a new note and writes the markdown file", async () => {
    const r = await saveNote(db, scopeRoot, {
      body: "Hello world",
      title: "Greeting",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.created).toBe(true);
    expect(r.data.topic).toBe("inbox");
    expect(r.data.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    // File exists on disk.
    const s = await stat(fromPortable(r.data.path));
    expect(s.isFile()).toBe(true);

    // File contains frontmatter.
    const content = await readFile(fromPortable(r.data.path), "utf8");
    expect(content).toContain("id:");
    expect(content).toContain("title: Greeting");
    expect(content).toContain("Hello world");
  });

  it("derives title from first body line when omitted", async () => {
    const r = await saveNote(db, scopeRoot, { body: "# My Auto Title\n\nbody" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const content = await readFile(fromPortable(r.data.path), "utf8");
    expect(content).toContain("title: My Auto Title");
  });

  it("updates an existing note when id is provided", async () => {
    const r1 = await saveNote(db, scopeRoot, { body: "v1", title: "Versioned" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const r2 = await saveNote(db, scopeRoot, {
      id: r1.data.id,
      body: "v2 with new content",
      title: "Versioned (updated)",
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.data.created).toBe(false);
    expect(r2.data.id).toBe(r1.data.id);

    const content = await readFile(fromPortable(r2.data.path), "utf8");
    expect(content).toContain("v2 with new content");
    expect(content).toContain("title: Versioned (updated)");
  });

  it("moves the file when the topic changes on update", async () => {
    const r1 = await saveNote(db, scopeRoot, { body: "hello", title: "Topic Move" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const r2 = await saveNote(db, scopeRoot, {
      id: r1.data.id,
      body: "hello",
      title: "Topic Move",
      topic: "work",
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.data.topic).toBe("work");
    expect(r2.data.path).not.toBe(r1.data.path);

    // The new file is under topics/work/.
    const s = await stat(fromPortable(r2.data.path));
    expect(s.isFile()).toBe(true);
  });

  it("validates input", async () => {
    const r = await saveNote(db, scopeRoot, { body: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("validation_error");
  });

  it("returns not_found when updating a missing id", async () => {
    const r = await saveNote(db, scopeRoot, { id: ulid(), body: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("not_found");
  });

  it("makes the note searchable via syncFts", async () => {
    const r = await saveNote(db, scopeRoot, {
      body: "configuring ssh tunnels for windows",
      title: "SSH",
      topic: "infra",
      tags: ["ssh", "windows"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const hits = db
      .prepare(`SELECT id FROM notes_fts WHERE notes_fts MATCH ?`)
      .all("ssh") as Array<{ id: string }>;
    expect(hits.length).toBe(1);
    expect(hits[0]?.id).toBe(r.data.id);

    // Suppress unused.
    void syncFts;
  });
});

/** Convert a portable (forward-slash) path back to a native OS path. */
function fromPortable(p: string): string {
  // On Windows, Node accepts forward slashes natively, so this is safe.
  return p;
}
