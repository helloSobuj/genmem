// Typed row interfaces and zod schemas. Keep DTOs and DB rows separate.

import { z } from "zod";
import { CONFIG } from "../config.js";

export const NoteRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  topic: z.string(),
  path: z.string(),
  rel_path: z.string(),
  body: z.string(),
  body_size: z.number().int().nonnegative(),
  tags_json: z.string(),
  links_json: z.string(),
  source: z.enum(["chat", "cli", "import", "api"]),
  schema_ver: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  content_hash: z.string(),
});

export type NoteRow = z.infer<typeof NoteRowSchema>;

export const NoteSummarySchema = NoteRowSchema.pick({
  id: true,
  title: true,
  topic: true,
  path: true,
  tags_json: true,
  updated_at: true,
});

export type NoteSummary = z.infer<typeof NoteSummarySchema>;

export interface NoteRecord {
  id: string;
  title: string;
  topic: string;
  path: string;
  rel_path: string;
  body: string;
  body_size: number;
  tags: string[];
  links: string[];
  source: "chat" | "cli" | "import" | "api";
  schema_ver: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  content_hash: string;
}

export function rowToRecord(row: NoteRow): NoteRecord {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    path: row.path,
    rel_path: row.rel_path,
    body: row.body,
    body_size: row.body_size,
    tags: JSON.parse(row.tags_json) as string[],
    links: JSON.parse(row.links_json) as string[],
    source: row.source,
    schema_ver: row.schema_ver,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    content_hash: row.content_hash,
  };
}

export interface TopicStat {
  name: string;
  count: number;
  last_updated: string;
}

export const SearchHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  topic: z.string().nullable(),
  path: z.string(),
  score: z.number(),
  snippet: z.string(),
  tags: z.array(z.string()),
  updated_at: z.string(),
});

export type SearchHit = z.infer<typeof SearchHitSchema>;

export const SourceSchema = z.enum(["chat", "cli", "import", "api"]);
export type Source = z.infer<typeof SourceSchema>;

/** Re-export for convenience. */
export { CONFIG };
