import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNote } from "../../../src/mcp/tools/get.js";
import { saveNote } from "../../../src/mcp/tools/save.js";
import { openDbFile } from "../../../src/store/db.js";
import { initCommand } from "../../../src/cli/init.js";
import { ulid } from "ulid";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;
let db: Awaited<ReturnType<typeof openDbFile>>;
let scopeRoot: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-get-"));
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

describe("memory_get", () => {
  it("returns a note with body by default", async () => {
    const saved = await saveNote(db, scopeRoot, {
      body: "the body content",
      title: "Title",
      tags: ["a", "b"],
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const r = getNote(db, scopeRoot, { id: saved.data.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.id).toBe(saved.data.id);
    expect(r.data.title).toBe("Title");
    expect(r.data.body).toBe("the body content");
    expect(r.data.tags).toEqual(["a", "b"]);
    expect(r.data.size_bytes).toBe("the body content".length);
  });

  it("omits body when include_body=false", async () => {
    const saved = await saveNote(db, scopeRoot, { body: "x", title: "x" });
    if (!saved.ok) throw new Error("setup failed");

    const r = getNote(db, scopeRoot, { id: saved.data.id, include_body: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.body).toBe("");
    expect(r.data.title).toBe("x");
  });

  it("returns not_found for missing id", async () => {
    const r = getNote(db, scopeRoot, { id: ulid() });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("not_found");
  });

  it("rejects invalid input", async () => {
    const r = getNote(db, scopeRoot, { id: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("validation_error");
  });
});
