// `memory_get` — fetch a single note by id, optionally including the body.

import { z } from "zod";
import type { Database } from "better-sqlite3";
import { ErrorCode, fail, ok, type ToolResult } from "../format.js";

const GetInputSchema = z.object({
  id: z.string().min(1),
  include_body: z.boolean().default(true),
});
export type GetInput = z.infer<typeof GetInputSchema>;

export interface GetData {
  id: string;
  title: string;
  topic: string;
  tags: string[];
  links: string[];
  body: string;
  frontmatter: Record<string, unknown>;
  path: string;
  created_at: string;
  updated_at: string;
  size_bytes: number;
}

const GetDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  topic: z.string(),
  tags: z.array(z.string()),
  links: z.array(z.string()),
  body: z.string(),
  frontmatter: z.record(z.unknown()),
  path: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  size_bytes: z.number(),
});

export function getNote(
  db: Database,
  scopeRoot: string,
  rawInput: unknown,
): ToolResult<GetData> {
  const parsed = GetInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(ErrorCode.ValidationError, "invalid input", parsed.error.flatten());
  }
  const input = parsed.data;

  const row = db
    .prepare(
      `SELECT id, title, topic, path, body, body_size, tags_json, links_json,
              source, schema_ver, created_at, updated_at
       FROM notes WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(input.id) as
    | {
        id: string;
        title: string;
        topic: string;
        path: string;
        body: string;
        body_size: number;
        tags_json: string;
        links_json: string;
        source: string;
        schema_ver: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return fail(ErrorCode.NotFound, `note not found: ${input.id}`);
  }

  const tags = JSON.parse(row.tags_json) as string[];
  const links = JSON.parse(row.links_json) as string[];

  const data: GetData = {
    id: row.id,
    title: row.title,
    topic: row.topic,
    tags,
    links,
    body: input.include_body ? row.body : "",
    frontmatter: {
      id: row.id,
      title: row.title,
      topic: row.topic,
      tags,
      links,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source: row.source,
      schema_version: row.schema_ver,
    },
    path: row.path,
    created_at: row.created_at,
    updated_at: row.updated_at,
    size_bytes: row.body_size,
  };

  return ok(GetDataSchema.parse(data));
  void scopeRoot;
}

export const getTool = {
  name: "memory_get",
  description: "Fetch a single note by id. Optionally omit the body for metadata-only reads.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "ULID of the note." },
      include_body: { type: "boolean", description: "Whether to include the body (default true)." },
    },
    required: ["id"],
  },
  handler: getNote,
};
