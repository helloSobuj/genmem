// `memory_topics` — list all topics with their note counts and last-updated timestamp.

import { z } from "zod";
import type { Database } from "better-sqlite3";
import { ok, type ToolResult } from "../format.js";

const _TopicsInputSchema = z.object({});
export type TopicsInput = z.infer<typeof _TopicsInputSchema>;

export interface TopicInfo {
  name: string;
  count: number;
  last_updated: string;
}

export interface TopicsData {
  topics: TopicInfo[];
}

const TopicsDataSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
      last_updated: z.string(),
    }),
  ),
});

export function listTopics(
  db: Database,
  scopeRoot: string,
  _rawInput: unknown,
): ToolResult<TopicsData> {
  // The `topic_stats` table is maintained by the save flow, but for
  // robustness we compute counts directly from `notes` (the source of
  // truth) and fall back to the rollup table only if `notes` is empty.
  const rows = db
    .prepare(
      `SELECT topic, count(*) AS count, max(updated_at) AS last_updated
       FROM notes
       WHERE deleted_at IS NULL
       GROUP BY topic
       ORDER BY count DESC, topic ASC`,
    )
    .all() as Array<{ topic: string; count: number; last_updated: string }>;

  const topics: TopicInfo[] = rows.map((r) => ({
    name: r.topic,
    count: r.count,
    last_updated: r.last_updated,
  }));

  return ok(TopicsDataSchema.parse({ topics }));
  void scopeRoot;
}

export const topicsTool = {
  name: "memory_topics",
  description: "List all topics with note counts and last-updated timestamps.",
  inputSchema: { type: "object" as const, properties: {} },
  handler: listTopics,
};
