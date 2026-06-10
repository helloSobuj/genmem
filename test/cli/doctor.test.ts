import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ulid } from "ulid";
import { initCommand } from "../../src/cli/init.js";
import { doctorCommand } from "../../src/cli/doctor.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-doctor-"));
  envSnapshot = { ...process.env };
  delete process.env.GENMEM_SCOPE;
  delete process.env.GENMEM_USER;
});
afterEach(async () => {
  process.env = envSnapshot;
  await rm(tmp, { recursive: true, force: true });
});

describe("doctor", () => {
  it("reports ok on a healthy fresh scope", async () => {
    await initCommand({ scope: tmp });
    const r = await doctorCommand({ scope: tmp });
    expect(r.ok).toBe(true);
    expect(r.scopeRoot).toBe(tmp);
    expect(r.scopeExists).toBe(true);
    expect(r.configExists).toBe(true);
    // init creates an empty index.sqlite, so integrity is "ok" (not "skipped").
    expect(r.dbIntegrity).toBe("ok");
    expect(r.notesCount).toBe(0);
  });

  it("flags missing scope", async () => {
    // Point at a path that definitely does not exist.
    const missing = join(tmp, "does-not-exist");
    const r = await doctorCommand({ scope: missing });
    expect(r.ok).toBe(false);
    expect(r.scopeExists).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("rebuilds index from disk files", async () => {
    await initCommand({ scope: tmp });
    const id = ulid();
    const fm = `---
id: ${id}
title: Test Note
topic: inbox
tags: [test]
links: []
created_at: 2026-01-15T14:32:11.045Z
updated_at: 2026-01-15T14:32:11.045Z
source: cli
schema_version: 1
---

body content`;
    await mkdir(join(tmp, "topics", "inbox"), { recursive: true });
    await writeFile(join(tmp, "topics", "inbox", `${id}-test.md`), fm, "utf8");

    const r = await doctorCommand({ scope: tmp, rebuild: true });
    if (r.rebuild?.errors.length) {
      // surface the reindex error to make debugging easier
      throw new Error(`reindex errors: ${JSON.stringify(r.rebuild.errors)}`);
    }
    expect(r.rebuild).toBeDefined();
    expect(r.rebuild?.scanned).toBe(1);
    expect(r.rebuild?.inserted).toBe(1);
    expect(r.notesCount).toBe(1);
    expect(r.ftsCount).toBe(1);
  });

  it("warns about OneDrive paths", async () => {
    const od = join(tmp, "OneDrive", "genmem");
    await mkdir(od, { recursive: true });
    const r = await doctorCommand({ scope: od });
    expect(r.onedriveWarning).toBe(true);
    expect(r.warnings.some((w) => w.toLowerCase().includes("onedrive"))).toBe(true);
  });
});
