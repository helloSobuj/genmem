// MCP server. Registers all 8 tools, wires them to the per-tool handlers,
// and connects over stdio. This is the only file in the codebase that
// imports from `@modelcontextprotocol/sdk`.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Database } from "better-sqlite3";
import { existsSync } from "node:fs";
import { openDbFile } from "../store/db.js";
import { resolveScope } from "../fs/scope.js";
import { dbPath } from "../fs/paths.js";
import { getLogger } from "../ui/log.js";
import { toMcpResult, type ToolResult } from "./format.js";
import { saveTool } from "./tools/save.js";
import { searchTool } from "./tools/search.js";
import { getTool } from "./tools/get.js";
import { recentTool } from "./tools/recent.js";
import { topicsTool } from "./tools/topics.js";
import { deleteTool } from "./tools/delete.js";
import { linkTool } from "./tools/link.js";
import { reflectTool } from "./tools/reflect.js";

export interface ServerOptions {
  /** Override user (otherwise resolved from env/config). */
  user?: string;
  /** Override scope root. */
  scope?: string;
  /** Pre-opened DB (used by tests). If omitted, the server opens its own. */
  db?: Database;
}

export interface GenmemServer {
  server: Server;
  runStdio: () => Promise<void>;
  close: () => Promise<void>;
}

const ALL_TOOLS = [
  saveTool,
  searchTool,
  getTool,
  recentTool,
  topicsTool,
  deleteTool,
  linkTool,
  reflectTool,
] as const;

type Handler = (
  db: Database,
  scopeRoot: string,
  rawInput: unknown,
) => ToolResult<unknown> | Promise<ToolResult<unknown>>;

export async function createServer(opts: ServerOptions = {}): Promise<GenmemServer> {
  const log = getLogger();
  const scope = await resolveScope({ user: opts.user, scope: opts.scope });
  const dbFile = dbPath(scope.scopeRoot);

  if (!existsSync(dbFile)) {
    throw new Error(
      `no index at ${dbFile} — run \`genmem init\` and \`genmem doctor --rebuild\` first`,
    );
  }

  const db = opts.db ?? (await openDbFile(dbFile));

  const server = new Server(
    { name: "genmem-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = ALL_TOOLS.find((t) => t.name === name);
    if (!tool) {
      return toMcpResult({
        ok: false,
        error: { code: "unknown_tool", message: `unknown tool: ${name}` },
      });
    }
    try {
      const result = await (tool.handler as Handler)(db, scope.scopeRoot, args ?? {});
      return toMcpResult(result);
    } catch (e) {
      log.error(`tool ${name} threw: ${(e as Error).message}`);
      return toMcpResult({
        ok: false,
        error: {
          code: "internal_error",
          message: (e as Error).message,
        },
      });
    }
  });

  return {
    server,
    async runStdio() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
    async close() {
      try {
        await server.close();
      } catch {
        // ignore close errors during shutdown
      }
      if (!opts.db) db.close();
    },
  };
}
