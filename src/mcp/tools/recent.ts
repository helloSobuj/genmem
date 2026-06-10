// `memory_recent` — list most-recently-updated notes, optionally filtered by topic.

import { z } from "zod";
import type { Database } from "better-sqlite3";
import { ErrorCode, fail, ok, type ToolResult } from "../format.js";
import { CONFIG } from "../../config.js";

const RecentInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  topic: z.string().regex(CONFIG.topicPattern).optional(),
});
export type RecentInput = z.infer<typeof RecentInputSchema>;

export interface RecentItem {
  id: string;
  title: string;
  topic: string;
  tags: string[];
  updated_at: string;
  path: string;
}

export interface RecentData {
  items: RecentItem[];
}

const RecentDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      topic: z.string(),
      tags: z.array(z.string()),
      updated_at: z.string(),
      path: z.string(),
    }),
  ),
});

export function recentNotes(
  db: Database,
  scopeRoot: string,
  rawInput: unknown,
): ToolResult<RecentData> {
  const parsed = RecentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(ErrorCode.ValidationError, "invalid input", parsed.error.flatten());
  }
  const input = parsed.data;

  const rows = input.topic
    ? (db
        .prepare(
          `SELECT id, title, topic, path, tags_json, updated_at
           FROM notes
           WHERE deleted_at IS NULL AND topic = ?
           ORDER BY updated_at DESC
           LIMIT ?`,
        )
        .all(input.topic, input.limit) as Array<{
        id: string;
        title: string;
        topic: string;
        path: string;
        tags_json: string;
        updated_at: string;
      }>)
    : (db
        .prepare(
          `SELECT id, title, topic, path, tags_json, updated_at
           FROM notes
           WHERE deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT ?`,
        )
        .all(input.limit) as Array<{
        id: string;
        title: string;
        topic: string;
        path: string;
        tags_json: string;
        updated_at: string;
      }>);

  const items: RecentItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    topic: r.topic,
    tags: JSON.parse(r.tags_json) as string[],
    updated_at: r.updated_at,
    path: r.path,
  }));

  return ok(RecentDataSchema.parse({ items }));
  void scopeRoot;
}

export const recentTool = {
  name: "memory_recent",
  description: "List most recently updated notes. Optionally filter by topic.",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: { type: "number", description: "Max items, 1-100, default 20." },
      topic: { type: "string", description: "Optional topic filter." },
    },
  },
  handler: recentNotes,
};
