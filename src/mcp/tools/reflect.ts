// `memory_reflect` — client-driven context gathering for synthesis.
//
// This tool does NOT call an LLM. It gathers the most relevant recent
// notes and returns them alongside a `prompt_hint` string the calling
// LLM can paste into its own reasoning to produce a reflection.

import { z } from "zod";
import type { Database } from "better-sqlite3";
import { ErrorCode, fail, ok, type ToolResult } from "../format.js";
import { CONFIG } from "../../config.js";

const ReflectInputSchema = z.object({
  topic: z.string().regex(CONFIG.topicPattern).optional(),
  since: z.string().datetime({ offset: true }).optional(),
  max_items: z.number().int().min(1).max(200).default(50),
});
export type ReflectInput = z.infer<typeof ReflectInputSchema>;

export interface ReflectItem {
  id: string;
  title: string;
  snippet: string;
  topic: string;
  updated_at: string;
  tags: string[];
}

export interface ReflectData {
  items: ReflectItem[];
  prompt_hint: string;
}

const ReflectDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      snippet: z.string(),
      topic: z.string(),
      updated_at: z.string(),
      tags: z.array(z.string()),
    }),
  ),
  prompt_hint: z.string(),
});

export function reflectContext(
  db: Database,
  scopeRoot: string,
  rawInput: unknown,
): ToolResult<ReflectData> {
  const parsed = ReflectInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(ErrorCode.ValidationError, "invalid input", parsed.error.flatten());
  }
  const input = parsed.data;

  const where: string[] = ["deleted_at IS NULL"];
  const params: Array<string | number> = [];
  if (input.topic) {
    where.push("topic = ?");
    params.push(input.topic);
  }
  if (input.since) {
    where.push("updated_at >= ?");
    params.push(input.since);
  }
  params.push(input.max_items);

  const sql = `
    SELECT id, title, topic, updated_at, tags_json, body
    FROM notes
    WHERE ${where.join(" AND ")}
    ORDER BY updated_at DESC
    LIMIT ?`;

  const rows = db.prepare(sql).all(...params) as Array<{
    id: string;
    title: string;
    topic: string;
    updated_at: string;
    tags_json: string;
    body: string;
  }>;

  const items: ReflectItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.body.slice(0, 280).replace(/\s+/g, " ").trim(),
    topic: r.topic,
    updated_at: r.updated_at,
    tags: JSON.parse(r.tags_json) as string[],
  }));

  const promptHint = items.length === 0
    ? "No notes found. Save a few memories first, then call memory_reflect again."
    : [
        `Review these ${items.length} recent notes and synthesize a higher-level reflection.`,
        `Look for recurring themes, contradictions, and preferences the user has expressed.`,
        `Then call memory_save with title="Reflection on ${new Date().toISOString().slice(0, 10)}" and a body that summarizes your synthesis.`,
        `Use the same topic as the notes you reviewed (or 'inbox' if mixed).`,
      ].join(" ");

  return ok(ReflectDataSchema.parse({ items, prompt_hint: promptHint }));
  void scopeRoot;
}

export const reflectTool = {
  name: "memory_reflect",
  description: "Gather recent notes and a prompt hint for the calling LLM to synthesize a reflection.",
  inputSchema: {
    type: "object" as const,
    properties: {
      topic: { type: "string", description: "Optional topic filter." },
      since: { type: "string", description: "Optional ISO timestamp; only notes updated after this are included." },
      max_items: { type: "number", description: "Max items, 1-200, default 50." },
    },
  },
  handler: reflectContext,
};
