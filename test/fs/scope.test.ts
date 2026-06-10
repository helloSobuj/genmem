import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveScope } from "../../src/fs/scope.js";

let envSnapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  envSnapshot = { ...process.env };
});
afterEach(() => {
  process.env = envSnapshot;
});

describe("resolveScope", () => {
  it("uses defaults with no env or flags", async () => {
    delete process.env.GENMEM_SCOPE;
    delete process.env.GENMEM_USER;
    const r = await resolveScope({}, process.env);
    expect(r.source).toBe("default");
    expect(r.user).toBeTruthy();
    expect(r.scopeRoot).toContain(".genmem");
  });

  it("honors --user / --scope flags (source=flag)", async () => {
    delete process.env.GENMEM_SCOPE;
    const r = await resolveScope(
      { user: "alice", scope: "C:/scopes/alice" },
      process.env,
    );
    expect(r.source).toBe("flag");
    expect(r.user).toBe("alice");
    expect(r.scopeRoot.toLowerCase()).toBe(
      resolve("C:/scopes/alice").toLowerCase(),
    );
  });

  it("honors GENMEM_SCOPE env var (source=env)", async () => {
    process.env.GENMEM_SCOPE = "C:/from/env";
    const r = await resolveScope({}, process.env);
    expect(r.source).toBe("env");
    expect(r.scopeRoot.toLowerCase()).toBe(resolve("C:/from/env").toLowerCase());
  });

  it("honors config file when present", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "genmem-cfg-"));
    const cfg = { version: 1, user: "bob", active_profile: "work" };
    await writeFile(join(tmp, "config.json"), JSON.stringify(cfg));
    process.env.GENMEM_SCOPE = tmp;
    const r = await resolveScope({}, process.env);
    expect(r.source).toBe("env");
    await rm(tmp, { recursive: true, force: true });
  });
});
