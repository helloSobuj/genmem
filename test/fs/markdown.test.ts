import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ulid } from "ulid";
import {
  atomicWriteFile,
  deriveTitle,
  NoteFrontmatterSchema,
  readNote,
  serializeNote,
  slugify,
  writeNote,
} from "../../src/fs/markdown.js";

const SAMPLE_FM = {
  id: ulid(),
  title: "Sample note",
  topic: "inbox",
  tags: ["test", "sample"],
  links: [],
  created_at: "2026-01-15T14:32:11.045Z",
  updated_at: "2026-01-15T14:32:11.045Z",
  source: "cli" as const,
  schema_version: 1 as const,
};

describe("slugify", () => {
  it("lowercases and replaces non-alnum", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });
  it("collapses dashes", () => {
    expect(slugify("foo --- bar")).toBe("foo-bar");
  });
  it("trims to 80 chars", () => {
    const long = "a".repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });
  it("falls back to 'note' for empty input", () => {
    expect(slugify("")).toBe("note");
    expect(slugify("---")).toBe("note");
  });
});

describe("frontmatter schema", () => {
  it("accepts a complete frontmatter", () => {
    expect(NoteFrontmatterSchema.safeParse(SAMPLE_FM).success).toBe(true);
  });
  it("rejects missing id", () => {
    const { id: _id, ...rest } = SAMPLE_FM;
    expect(NoteFrontmatterSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects non-ULID id", () => {
    expect(
      NoteFrontmatterSchema.safeParse({ ...SAMPLE_FM, id: "not-a-ulid" }).success,
    ).toBe(false);
  });
});

describe("serializeNote", () => {
  it("produces parseable output", () => {
    const out = serializeNote(SAMPLE_FM, "# Hello\n\nWorld");
    expect(out).toContain("id: " + SAMPLE_FM.id);
    expect(out).toContain("title: Sample note");
    expect(out).toContain("schema_version: 1");
    expect(out).toContain("Hello");
  });
  it("ends with a single trailing newline", () => {
    const out = serializeNote(SAMPLE_FM, "body");
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
  it("normalizes CRLF in body to LF", () => {
    const out = serializeNote(SAMPLE_FM, "line1\r\nline2\r\n");
    expect(out).not.toContain("\r\n");
  });
});

describe("deriveTitle", () => {
  it("uses first non-empty line", () => {
    expect(deriveTitle("\n\n# Real Title\nbody")).toBe("Real Title");
  });
  it("falls back to 'Untitled' for empty body", () => {
    expect(deriveTitle("")).toBe("Untitled");
  });
  it("truncates long titles to 200 chars", () => {
    const long = "x".repeat(500);
    expect(deriveTitle(long).length).toBe(200);
  });
});

describe("atomicWriteFile + readNote", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "genmem-md-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a note", async () => {
    const path = join(dir, "note.md");
    await writeNote(path, SAMPLE_FM, "Body content");
    const parsed = await readNote(path);
    expect(parsed.frontmatter.id).toBe(SAMPLE_FM.id);
    expect(parsed.body).toBe("Body content");
  });

  it("does not leave .tmp files on success", async () => {
    const path = join(dir, "note.md");
    await atomicWriteFile(path, "hello");
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir);
    expect(entries.filter((e) => e.endsWith(".tmp"))).toEqual([]);
  });

  it("writes LF line endings", async () => {
    const path = join(dir, "note.md");
    await writeNote(path, SAMPLE_FM, "line1\r\nline2\r\n");
    const raw = await readFile(path, "utf8");
    expect(raw).not.toContain("\r\n");
  });
});
