// `memory_search` — full-text search via FTS5 with BM25 ranking + snippets.

import { z } from "zod";
import type { Database } from "better-sqlite3";
import { ErrorCode, fail, ok, toMcpResult, type ToolResult } from "../format.js";
import { CONFIG } from "../../config.js";
import { tagsToFts } from "../../store/fts.js";

const SearchInputSchema = z.object({
  query: z.string().min(1).max(500),
  topic: z
    .string()
    .regex(CONFIG.topicPattern)
    .optional(),
  limit: z.number().int().min(1).max(50).default(10),
  snippet_chars: z.number().int().min(40).max(1000).default(CONFIG.defaultSnippetChars),
});
export type SearchInput = z.infer<typeof SearchInputSchema>;

export interface SearchHit {
  id: string;
  title: string;
  topic: string | null;
  path: string;
  score: number;
  snippet: string;
  tags: string[];
  updated_at: string;
}

export interface SearchData {
  query: string;
  total: number;
  results: SearchHit[];
}

const SearchDataSchema = z.object({
  query: z.string(),
  total: z.number(),
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      topic: z.string().nullable(),
      path: z.string(),
      score: z.number(),
      snippet: z.string(),
      tags: z.array(z.string()),
      updated_at: z.string(),
    }),
  ),
});

/**
 * Escape user text for FTS5 MATCH. The FTS5 query language treats
 * certain characters (quotes, parens, colons, hyphens) as operators.
 * We wrap the user text in double quotes and escape any internal
 * double quotes — that's the simplest correct approach for arbitrary
 * user input.
 */
function escapeFtsQuery(q: string): string {
  return `"${q.replace(/"/g, '""')}"`;
}

export function searchNotes(
  db: Database,
  _scopeRoot: string,
  rawInput: unknown,
): ToolResult<SearchData> {
  const parsed = SearchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(ErrorCode.ValidationError, "invalid input", parsed.error.flatten());
  }
  const input = parsed.data;

  const ftsQuery = escapeFtsQuery(input.query);
  const sql = `
    SELECT
      m.id, m.title, m.topic, m.path, m.updated_at, m.tags_json,
      snippet(notes_fts, 2, '<<', '>>', '…', ?) AS snippet,
      bm25(notes_fts) AS score
    FROM notes_fts
    JOIN notes m ON m.id = notes_fts.id
    WHERE notes_fts MATCH ?
      AND m.deleted_at IS NULL
      ${input.topic ? "AND m.topic = ?" : ""}
    ORDER BY score
    LIMIT ?`;

  const rows = input.topic
    ? (db.prepare(sql).all(input.snippet_chars, ftsQuery, input.topic, input.limit) as Array<{
        id: string;
        title: string;
        topic: string;
        path: string;
        updated_at: string;
        tags_json: string;
        snippet: string;
        score: number;
      }>)
    : (db.prepare(sql).all(input.snippet_chars, ftsQuery, input.limit) as Array<{
        id: string;
        title: string;
        topic: string;
        path: string;
        updated_at: string;
        tags_json: string;
        snippet: string;
        score: number;
      }>);

  // Total count of matching notes (unbounded by limit) for the caller.
  const countSql = `
    SELECT count(*) AS c
    FROM notes_fts
    JOIN notes m ON m.id = notes_fts.id
    WHERE notes_fts MATCH ?
      AND m.deleted_at IS NULL
      ${input.topic ? "AND m.topic = ?" : ""}`;
  const totalRow = input.topic
    ? (db.prepare(countSql).get(ftsQuery, input.topic) as { c: number })
    : (db.prepare(countSql).get(ftsQuery) as { c: number });

  const results: SearchHit[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    topic: r.topic,
    path: r.path,
    score: r.score,
    snippet: r.snippet,
    tags: JSON.parse(r.tags_json) as string[],
    updated_at: r.updated_at,
  }));

  const data: SearchData = {
    query: input.query,
    total: totalRow.c,
    results,
  };

  return ok(SearchDataSchema.parse(data));
}

export const searchTool = {
  name: "memory_search",
  description: "Search notes by free-text query. Returns ranked hits with highlighted snippets.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query, 1-500 chars." },
      topic: { type: "string", description: "Optional topic filter." },
      limit: { type: "number", description: "Max results, 1-50, default 10." },
      snippet_chars: { type: "number", description: "Snippet length, 40-1000, default 200." },
    },
    required: ["query"],
  },
  handler: searchNotes,
};

// Suppress unused
void toMcpResult;
void tagsToFts;
