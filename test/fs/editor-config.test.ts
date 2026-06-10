import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import {
  ALL_CLIENTS,
  buildMcpEntry,
  detectClients,
  GENMEM_ENTRY_NAME,
  mergeClient,
  prettyClientName,
  resolveBinPath,
  resolveClientPaths,
  unmergeClient,
  type ClientId,
} from "../../src/fs/editor-config.js";

let tmp: string;
let envSnapshot: NodeJS.ProcessEnv;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "genmem-editor-cfg-"));
  envSnapshot = { ...process.env };
});

afterEach(async () => {
  process.env = envSnapshot;
  await rm(tmp, { recursive: true, force: true });
});

/**
 * Build a fake APPDATA pointing at a temp dir so that
 * `resolveClientPaths()` returns paths we control. We also override
 * USERPROFILE for the non-APPDATA clients (Cursor, Continue, Windsurf).
 */
function setupEnv() {
  process.env.APPDATA = join(tmp, "AppData", "Roaming");
  process.env.LOCALAPPDATA = join(tmp, "AppData", "Local");
  // USERPROFILE controls homedir() in Node 22+ when HOMEDRIVE/HOMEPATH
  // are unset, but the most reliable cross-version override is to set
  // HOME on POSIX. On Windows, the homedir() function checks USERPROFILE
  // first, so we set that.
  process.env.USERPROFILE = join(tmp, "home");
}

describe("editor-config", () => {
  describe("resolveClientPaths", () => {
    it("returns a path for every known client", () => {
      setupEnv();
      const paths = resolveClientPaths();
      for (const id of ALL_CLIENTS) {
        expect(paths[id]).toBeTruthy();
        expect(paths[id].length).toBeGreaterThan(0);
      }
    });
  });

  describe("buildMcpEntry", () => {
    it("builds an entry that points at the dispatcher", () => {
      const entry = buildMcpEntry("C:/path/bin/genmem-mcp.js", "C:/scope");
      expect(entry.command).toBe("node");
      expect(entry.args).toEqual(["C:/path/bin/genmem-mcp.js", "serve"]);
      expect(entry.env?.GENMEM_SCOPE).toBe("C:/scope");
    });
  });

  describe("resolveBinPath", () => {
    it("returns an absolute path to the bin script", () => {
      const p = resolveBinPath();
      expect(p.endsWith(`bin${sep}genmem-mcp.js`)).toBe(true);
    });
  });

  describe("prettyClientName", () => {
    it("maps each client id to a friendly name", () => {
      expect(prettyClientName("claude-desktop")).toBe("Claude Desktop");
      expect(prettyClientName("cursor")).toBe("Cursor");
      expect(prettyClientName("vscode-cline")).toBe("VS Code (Cline)");
      expect(prettyClientName("continue")).toBe("Continue");
      expect(prettyClientName("windsurf")).toBe("Windsurf");
    });
  });

  describe("detectClients", () => {
    it("reports which clients are installed (none in empty env)", () => {
      setupEnv();
      const detected = detectClients();
      expect(detected.length).toBe(ALL_CLIENTS.length);
      for (const c of detected) {
        expect(c.configExists).toBe(false);
        expect(c.appDirExists).toBe(false);
      }
    });

    it("marks a client as detected when its app dir exists", async () => {
      setupEnv();
      const paths = resolveClientPaths();
      const appDir = paths["claude-desktop"].split("/").slice(0, -1).join("/");
      await mkdir(appDir, { recursive: true });
      const detected = detectClients();
      const claude = detected.find((c) => c.id === "claude-desktop");
      expect(claude?.appDirExists).toBe(true);
    });
  });

  describe("mergeClient — claude-desktop / cursor / windsurf (Claude style)", () => {
    for (const client of ["claude-desktop", "cursor", "windsurf"] as ClientId[]) {
      it(`${client}: installs into an empty/missing file`, async () => {
        setupEnv();
        const r = mergeClient(client, "/bin/genmem-mcp.js", "/scope", { dryRun: false });
        expect(r.action).toBe("installed");
        expect(r.path).toContain(prettyClientName(client) === "Claude Desktop" ? "Claude" : client === "cursor" ? ".cursor" : "windsurf");
        // The config file should now exist with our entry under mcpServers.genmem.
        const content = JSON.parse(await readFile(r.path, "utf8") as string);
        expect(content.mcpServers?.[GENMEM_ENTRY_NAME]).toBeDefined();
        expect(content.mcpServers[GENMEM_ENTRY_NAME].command).toBe("node");
        expect(content.mcpServers[GENMEM_ENTRY_NAME].args).toEqual(["/bin/genmem-mcp.js", "serve"]);
        expect(content.mcpServers[GENMEM_ENTRY_NAME].env.GENMEM_SCOPE).toBe("/scope");
      });

      it(`${client}: is idempotent — second merge is "exists"`, async () => {
        setupEnv();
        mergeClient(client, "/bin/genmem-mcp.js", "/scope");
        const r2 = mergeClient(client, "/bin/genmem-mcp.js", "/scope");
        expect(r2.action).toBe("exists");
      });

      it(`${client}: preserves other mcpServers entries`, async () => {
        setupEnv();
        const paths = resolveClientPaths();
        await mkdir(paths[client].split("/").slice(0, -1).join("/"), { recursive: true });
        const other = { other: { command: "node", args: ["other.js"] } };
        await writeFile(paths[client], JSON.stringify({ mcpServers: other }));
        const r = mergeClient(client, "/bin/genmem-mcp.js", "/scope");
        expect(r.action).toBe("installed");
        const after = JSON.parse(await readFile(paths[client], "utf8") as string);
        expect(after.mcpServers.other).toEqual(other.other);
        expect(after.mcpServers[GENMEM_ENTRY_NAME]).toBeDefined();
      });

      it(`${client}: skips when existing entry differs (without --force)`, async () => {
        setupEnv();
        const paths = resolveClientPaths();
        await mkdir(paths[client].split("/").slice(0, -1).join("/"), { recursive: true });
        const existing = {
          mcpServers: {
            [GENMEM_ENTRY_NAME]: {
              command: "node",
              args: ["/different/path.js", "serve"],
              env: { GENMEM_SCOPE: "/other" },
            },
          },
        };
        await writeFile(paths[client], JSON.stringify(existing));
        const r = mergeClient(client, "/bin/genmem-mcp.js", "/scope");
        expect(r.action).toBe("skipped");
        expect(r.reason).toMatch(/force/);
        // File is unchanged.
        const after = JSON.parse(await readFile(paths[client], "utf8") as string);
        expect(after.mcpServers[GENMEM_ENTRY_NAME].args).toEqual(["/different/path.js", "serve"]);
      });

      it(`${client}: --force overwrites a different existing entry`, async () => {
        setupEnv();
        const paths = resolveClientPaths();
        await mkdir(paths[client].split("/").slice(0, -1).join("/"), { recursive: true });
        await writeFile(paths[client], JSON.stringify({
          mcpServers: { [GENMEM_ENTRY_NAME]: { command: "node", args: ["old.js"] } },
        }));
        const r = mergeClient(client, "/bin/genmem-mcp.js", "/scope", { force: true });
        expect(r.action).toBe("updated");
        expect(r.backupPath).toBeDefined();
        const after = JSON.parse(await readFile(paths[client], "utf8") as string);
        expect(after.mcpServers[GENMEM_ENTRY_NAME].args).toEqual(["/bin/genmem-mcp.js", "serve"]);
      });

      it(`${client}: dry-run does not write`, async () => {
        setupEnv();
        const paths = resolveClientPaths();
        const r = mergeClient(client, "/bin/genmem-mcp.js", "/scope", { dryRun: true });
        expect(r.action).toBe("installed");
        // File must not have been created.
        const fs = await import("node:fs");
        expect(fs.existsSync(paths[client])).toBe(false);
      });
    }
  });

  describe("mergeClient — vscode-cline (mcp.servers subkey)", () => {
    it("installs under mcp.servers.genmem", async () => {
      setupEnv();
      const r = mergeClient("vscode-cline", "/bin/genmem-mcp.js", "/scope");
      expect(r.action).toBe("installed");
      const content = JSON.parse(await readFile(r.path, "utf8") as string);
      expect(content["mcp.servers"]?.[GENMEM_ENTRY_NAME]).toBeDefined();
      expect(content["mcp.servers"][GENMEM_ENTRY_NAME].type).toBe("stdio");
    });

    it("preserves other VS Code settings", async () => {
      setupEnv();
      const paths = resolveClientPaths();
      await mkdir(paths["vscode-cline"].split("/").slice(0, -1).join("/"), { recursive: true });
      await writeFile(paths["vscode-cline"], JSON.stringify({
        "editor.fontSize": 14,
        "files.autoSave": "afterDelay",
      }));
      mergeClient("vscode-cline", "/bin/genmem-mcp.js", "/scope");
      const after = JSON.parse(await readFile(paths["vscode-cline"], "utf8") as string);
      expect(after["editor.fontSize"]).toBe(14);
      expect(after["files.autoSave"]).toBe("afterDelay");
      expect(after["mcp.servers"][GENMEM_ENTRY_NAME]).toBeDefined();
    });
  });

  describe("mergeClient — continue (array form)", () => {
    it("appends to experimental.modelContextProtocolServers", async () => {
      setupEnv();
      const r = mergeClient("continue", "/bin/genmem-mcp.js", "/scope");
      expect(r.action).toBe("installed");
      const content = JSON.parse(await readFile(r.path, "utf8") as string);
      expect(content.experimental?.modelContextProtocolServers).toHaveLength(1);
      expect(content.experimental.modelContextProtocolServers[0].name).toBe(GENMEM_ENTRY_NAME);
      expect(content.experimental.modelContextProtocolServers[0].transport).toBe("stdio");
    });

    it("preserves other Continue MCP servers", async () => {
      setupEnv();
      const paths = resolveClientPaths();
      await mkdir(paths["continue"].split("/").slice(0, -1).join("/"), { recursive: true });
      await writeFile(paths["continue"], JSON.stringify({
        experimental: {
          modelContextProtocolServers: [
            { name: "other", transport: "stdio", command: "node", args: ["other.js"] },
          ],
        },
      }));
      mergeClient("continue", "/bin/genmem-mcp.js", "/scope");
      const after = JSON.parse(await readFile(paths["continue"], "utf8") as string);
      const names = after.experimental.modelContextProtocolServers.map((s: { name: string }) => s.name);
      expect(names).toContain("other");
      expect(names).toContain(GENMEM_ENTRY_NAME);
    });

    it("is idempotent (second merge returns exists)", async () => {
      setupEnv();
      mergeClient("continue", "/bin/genmem-mcp.js", "/scope");
      const r2 = mergeClient("continue", "/bin/genmem-mcp.js", "/scope");
      expect(r2.action).toBe("exists");
    });
  });

  describe("unmergeClient", () => {
    it("removes the genmem entry from a Claude-style config", async () => {
      setupEnv();
      mergeClient("claude-desktop", "/bin/genmem-mcp.js", "/scope");
      const r = unmergeClient("claude-desktop");
      expect(r.action).toBe("installed");
      const after = JSON.parse(await readFile(r.path, "utf8") as string);
      expect(after.mcpServers[GENMEM_ENTRY_NAME]).toBeUndefined();
    });

    it("returns no-config when the file doesn't exist", () => {
      setupEnv();
      const r = unmergeClient("claude-desktop");
      expect(r.action).toBe("no-config");
    });

    it("returns exists when there was no genmem entry to remove", async () => {
      setupEnv();
      const paths = resolveClientPaths();
      await mkdir(paths["claude-desktop"].split("/").slice(0, -1).join("/"), { recursive: true });
      await writeFile(paths["claude-desktop"], JSON.stringify({
        mcpServers: { other: { command: "x", args: [] } },
      }));
      const r = unmergeClient("claude-desktop");
      expect(r.action).toBe("exists");
    });
  });
});
