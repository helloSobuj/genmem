// `memory_link` — create a typed edge between two notes, and mirror the
// link into each note's `links_json` so search and UI see it.

import { z } from "zod";
import type { Database } from "better-sqlite3";
import { ErrorCode, fail, ok, type ToolResult } from "../format.js";
import { CONFIG } from "../../config.js";

const LinkInputSchema = z.object({
  src_id: z.string().regex(CONFIG.ulidPattern),
  dst_id: z.string().regex(CONFIG.ulidPattern),
  kind: z.string().min(1).max(32).default("related"),
});
export type LinkInput = z.infer<typeof LinkInputSchema>;

export interface LinkData {
  src_id: string;
  dst_id: string;
  kind: string;
  created: boolean;
}

const LinkDataSchema = z.object({
  src_id: z.string(),
  dst_id: z.string(),
  kind: z.string(),
  created: z.boolean(),
});

export function linkNotes(
  db: Database,
  scopeRoot: string,
  rawInput: unknown,
): ToolResult<LinkData> {
  const parsed = LinkInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(ErrorCode.ValidationError, "invalid input", parsed.error.flatten());
  }
  const input = parsed.data;

  if (input.src_id === input.dst_id) {
    return fail(ErrorCode.ValidationError, "src_id and dst_id must differ");
  }

  // Verify both notes exist.
  const src = db.prepare(`SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL`).get(input.src_id);
  const dst = db.prepare(`SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL`).get(input.dst_id);
  if (!src) return fail(ErrorCode.NotFound, `source note not found: ${input.src_id}`);
  if (!dst) return fail(ErrorCode.NotFound, `destination note not found: ${input.dst_id}`);

  // Idempotent: check if the edge already exists.
  const existing = db
    .prepare(`SELECT 1 FROM note_links WHERE src_id = ? AND dst_id = ? AND kind = ?`)
    .get(input.src_id, input.dst_id, input.kind);

  const created = !existing;

  const tx = db.transaction(() => {
    if (created) {
      db.prepare(
        `INSERT INTO note_links (src_id, dst_id, kind, created_at) VALUES (?, ?, ?, ?)`,
      ).run(input.src_id, input.dst_id, input.kind, new Date().toISOString());

      // Mirror into the src note's links_json (idempotent).
      const srcRow = db
        .prepare(`SELECT links_json FROM notes WHERE id = ?`)
        .get(input.src_id) as { links_json: string };
      const srcLinks = JSON.parse(srcRow.links_json) as string[];
      if (!srcLinks.includes(input.dst_id)) {
        srcLinks.push(input.dst_id);
        db.prepare(`UPDATE notes SET links_json = ? WHERE id = ?`).run(
          JSON.stringify(srcLinks),
          input.src_id,
        );
      }
    }
  });
  tx();

  return ok(
    LinkDataSchema.parse({
      src_id: input.src_id,
      dst_id: input.dst_id,
      kind: input.kind,
      created,
    }),
  );
  void scopeRoot;
}

export const linkTool = {
  name: "memory_link",
  description: "Create a typed edge from one note to another. Idempotent.",
  inputSchema: {
    type: "object" as const,
    properties: {
      src_id: { type: "string", description: "Source note ULID." },
      dst_id: { type: "string", description: "Destination note ULID." },
      kind: { type: "string", description: "Edge kind, default 'related'." },
    },
    required: ["src_id", "dst_id"],
  },
  handler: linkNotes,
};
