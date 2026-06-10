import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initCommand } from "../../src/cli/init.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-init-"));
  envSnapshot = { ...process.env };
  delete process.env.GENMEM_SCOPE;
  delete process.env.GENMEM_USER;
});
afterEach(async () => {
  process.env = envSnapshot;
  await rm(tmp, { recursive: true, force: true });
});

describe("init", () => {
  it("creates scope directories and config.json", async () => {
    const r = await initCommand({ scope: tmp });
    expect(r.scopeRoot).toBe(tmp);
    expect(r.configPath).toBe(join(tmp, "config.json"));
    expect(r.created).toBe(true);

    const dirs = ["memory", "topics", "attachments", ".trash", "index"];
    for (const d of dirs) {
      const s = await stat(join(tmp, d));
      expect(s.isDirectory()).toBe(true);
    }
  });

  it("writes valid config.json", async () => {
    await initCommand({ scope: tmp, user: "alice" });
    const raw = await readFile(join(tmp, "config.json"), "utf8");
    const cfg = JSON.parse(raw);
    expect(cfg.version).toBe(1);
    expect(cfg.user).toBe("alice");
    expect(cfg.active_profile).toBe("default");
    expect(cfg.schema_version).toBe(1);
  });

  it("refuses to overwrite without --force", async () => {
    await initCommand({ scope: tmp });
    await expect(initCommand({ scope: tmp })).rejects.toThrow(/already exists/);
  });

  it("--force re-initializes", async () => {
    await initCommand({ scope: tmp });
    const r = await initCommand({ scope: tmp, force: true });
    expect(r.created).toBe(true);
  });
});
