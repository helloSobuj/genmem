// Integration test: spawn the genmem MCP server as a child process and
// drive it over stdio using the official MCP client SDK. This exercises
// the real JSON-RPC transport, tool registration, and request handlers
// end-to-end — the closest we can get to a real Claude Desktop / Cursor
// client without invoking them.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { initCommand } from "../../src/cli/init.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

let scopeRoot: string;
let client: Client | null = null;

beforeAll(async () => {
  scopeRoot = await mkdtemp(join(tmpdir(), "genmem-mcp-int-"));
  await initCommand({ scope: scopeRoot, quiet: true });

  // The StdioClientTransport spawns its own child process. We just point
  // it at the bin dispatcher, which routes "serve" to the MCP server.
  const binPath = join(REPO_ROOT, "bin", "genmem-mcp.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [binPath, "serve"],
    env: { ...process.env, GENMEM_SCOPE: scopeRoot } as Record<string, string>,
  });
  client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
}, 30000);

afterAll(async () => {
  await client?.close();
  if (scopeRoot) await rm(scopeRoot, { recursive: true, force: true });
});

describe("MCP server over stdio", () => {
  it("lists all 8 tools", async () => {
    const { tools } = await client!.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "memory_delete",
      "memory_get",
      "memory_link",
      "memory_recent",
      "memory_reflect",
      "memory_save",
      "memory_search",
      "memory_topics",
    ]);
  });

  it("round-trips a save → search → get sequence", async () => {
    // 1. Save a note.
    const saveResult = await client!.callTool({
      name: "memory_save",
      arguments: {
        body: "configuring ssh tunnels for windows",
        title: "SSH Integration Test",
        topic: "infra",
        tags: ["ssh", "test"],
      },
    });
    expect(saveResult.isError).toBeFalsy();
    const saveText = (saveResult.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(saveText).toBeDefined();
    const saveJson = JSON.parse(saveText!) as { ok: boolean; data: { id: string; created: boolean } };
    expect(saveJson.ok).toBe(true);
    expect(saveJson.data.created).toBe(true);
    const id = saveJson.data.id;
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    // 2. Search for it.
    const searchResult = await client!.callTool({
      name: "memory_search",
      arguments: { query: "ssh" },
    });
    expect(searchResult.isError).toBeFalsy();
    const searchText = (searchResult.content as Array<{ type: string; text: string }>)[0]?.text;
    const searchJson = JSON.parse(searchText!) as { ok: boolean; data: { results: Array<{ id: string }> } };
    expect(searchJson.ok).toBe(true);
    expect(searchJson.data.results.some((r) => r.id === id)).toBe(true);

    // 3. Fetch the full note.
    const getResult = await client!.callTool({
      name: "memory_get",
      arguments: { id },
    });
    expect(getResult.isError).toBeFalsy();
    const getText = (getResult.content as Array<{ type: string; text: string }>)[0]?.text;
    const getJson = JSON.parse(getText!) as { ok: boolean; data: { id: string; body: string } };
    expect(getJson.ok).toBe(true);
    expect(getJson.data.id).toBe(id);
    expect(getJson.data.body).toContain("ssh tunnels");
  });

  it("returns validation_error for bad input", async () => {
    const r = await client!.callTool({
      name: "memory_save",
      arguments: { body: "" },
    });
    expect(r.isError).toBe(true);
    const text = (r.content as Array<{ type: string; text: string }>)[0]?.text;
    const json = JSON.parse(text!) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("validation_error");
  });

  it("returns not_found for missing note", async () => {
    const r = await client!.callTool({
      name: "memory_get",
      arguments: { id: "01JABCDEF1234567890ABCDEF" },
    });
    expect(r.isError).toBe(true);
    const text = (r.content as Array<{ type: string; text: string }>)[0]?.text;
    const json = JSON.parse(text!) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("not_found");
  });

  it("handles unknown tool names gracefully", async () => {
    const r = await client!.callTool({
      name: "memory_nonexistent",
      arguments: {},
    });
    expect(r.isError).toBe(true);
  });
});
