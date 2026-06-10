import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { ulid } from "ulid";
import {
  assertWithin,
  configPath,
  dbPath,
  fromPortable,
  memoryDir,
  parseUlidFromFilename,
  PathError,
  scopeRootPath,
  toPortable,
  topicDir,
  trashDir,
  topicsDir,
} from "../../src/fs/paths.js";

describe("paths", () => {
  it("scopeRootPath uses ~/.genmem by default", () => {
    const r = scopeRootPath({});
    expect(r).toBe(resolve(join(homedir(), ".genmem")));
  });

  it("scopeRootPath honors GENMEM_SCOPE", () => {
    const r = scopeRootPath({ GENMEM_SCOPE: "C:/custom/scope" });
    expect(r.toLowerCase()).toBe(resolve("C:/custom/scope").toLowerCase());
  });

  it("toPortable and fromPortable round-trip", () => {
    const sample = ["a", "b", "c"].join(sep);
    expect(fromPortable(toPortable(sample))).toBe(sample);
  });

  it("toPortable uses forward slashes", () => {
    expect(toPortable(`a${sep}b${sep}c`)).toBe("a/b/c");
  });

  it("memoryDir / topicsDir / dbPath / trashDir / configPath compose correctly", () => {
    const root = resolve("/tmp/scope");
    expect(memoryDir(root)).toBe(join(root, "memory"));
    expect(topicsDir(root)).toBe(join(root, "topics"));
    expect(dbPath(root)).toBe(join(root, "index", "index.sqlite"));
    expect(trashDir(root)).toBe(join(root, ".trash"));
    expect(configPath(root)).toBe(join(root, "config.json"));
  });

  it("topicDir rejects traversal in topic", () => {
    expect(() => topicDir("/tmp/scope", "../etc")).toThrow(PathError);
    expect(() => topicDir("/tmp/scope", "..")).toThrow(PathError);
  });

  it("assertWithin accepts descendants", () => {
    const parent = "/tmp/scope";
    expect(() => assertWithin(parent, "/tmp/scope/a/b")).not.toThrow();
  });

  it("assertWithin rejects escapees", () => {
    expect(() => assertWithin("/tmp/scope", "/tmp/other")).toThrow(PathError);
    expect(() => assertWithin("/tmp/scope", "/tmp/scope/../escape")).toThrow(
      PathError,
    );
  });

  it("parseUlidFromFilename accepts valid ULIDs", () => {
    const id = ulid();
    const name = `${id}-my-note.md`;
    expect(parseUlidFromFilename(name)).toBe(id);
  });

  it("parseUlidFromFilename rejects non-ULID names", () => {
    expect(parseUlidFromFilename("not-a-ulid.md")).toBeNull();
    expect(parseUlidFromFilename("xxxxxxxxxxxxxxxxxxxxxxxxxx.md")).toBeNull();
  });
});
