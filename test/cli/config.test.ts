import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initCommand } from "../../src/cli/init.js";
import {
  configGetCommand,
  configPathCommand,
  configSetCommand,
  readConfig,
} from "../../src/cli/config.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-cfg-cli-"));
  envSnapshot = { ...process.env };
  delete process.env.GENMEM_SCOPE;
  delete process.env.GENMEM_USER;
  await initCommand({ scope: tmp, user: "alice" });
});
afterEach(async () => {
  process.env = envSnapshot;
  await rm(tmp, { recursive: true, force: true });
});

describe("config CLI", () => {
  it("config path returns the config.json path", async () => {
    const p = await configPathCommand({ scope: tmp });
    expect(p).toBe(join(tmp, "config.json"));
  });

  it("config get reads a value", async () => {
    const v = await configGetCommand("user", { scope: tmp });
    expect(v).toBe("alice");
  });

  it("config set updates a value", async () => {
    await configSetCommand("active_profile", "work", { scope: tmp, quiet: true });
    const cfg = await readConfig({ scope: tmp });
    expect(cfg.active_profile).toBe("work");
  });

  it("config get rejects unknown key", async () => {
    await expect(configGetCommand("nonexistent", { scope: tmp })).rejects.toThrow(
      /unknown config key/,
    );
  });
});
