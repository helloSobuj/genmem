// `memory_delete` — soft-delete a note by moving it to .trash/ and setting deleted_at.

import { join } from "node:path";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { z } from "zod";
import type { Database } from "better-sqlite3";
import { ErrorCode, fail, ok, type ToolResult } from "../format.js";
import { assertWithin, toPortable, trashDir } from "../../fs/paths.js";
import { removeFromFts } from "../../store/fts.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const DeleteInputSchema = z.object({
  id: z.string().min(1),
  hard: z.boolean().default(false),
});
export type DeleteInput = z.infer<typeof DeleteInputSchema>;

export interface DeleteData {
  id: string;
  trashed_path: string;
  hard: boolean;
}

const DeleteDataSchema = z.object({
  id: z.string(),
  trashed_path: z.string(),
  hard: z.boolean(),
});

export function deleteNote(
  db: Database,
  scopeRoot: string,
  rawInput: unknown,
): ToolResult<DeleteData> {
  const parsed = DeleteInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(ErrorCode.ValidationError, "invalid input", parsed.error.flatten());
  }
  const input = parsed.data;

  const row = db
    .prepare(`SELECT id, path, deleted_at FROM notes WHERE id = ?`)
    .get(input.id) as { id: string; path: string; deleted_at: string | null } | undefined;

  if (!row) {
    return fail(ErrorCode.NotFound, `note not found: ${input.id}`);
  }

  // Hard delete requires the note to already be in trash for >= 7 days.
  if (input.hard) {
    if (row.deleted_at === null) {
      return fail(
        ErrorCode.TrashPurgeRequired,
        `note must be soft-deleted for ${SEVEN_DAYS_MS / 86400000} days before hard delete`,
      );
    }
    const ageMs = Date.now() - new Date(row.deleted_at).getTime();
    if (ageMs < SEVEN_DAYS_MS) {
      return fail(
        ErrorCode.TrashPurgeRequired,
        `note has been in trash for ${Math.floor(ageMs / 86400000)}d; need ${SEVEN_DAYS_MS / 86400000}d before hard delete`,
      );
    }
  }

  // Compute the trash path.
  const sourceAbs = row.path;
  const filename = sourceAbs.split("/").pop() ?? `${row.id}.md`;
  const trashedName = `${row.id}-${Date.now()}-${filename}`;
  const trashAbs = join(trashDir(scopeRoot), trashedName);
  assertWithin(scopeRoot, trashAbs);

  // Move the file on disk (best-effort: DB may have a stale path).
  try {
    mkdirSync(trashDir(scopeRoot), { recursive: true });
    if (existsSync(sourceAbs)) {
      renameSync(sourceAbs, trashAbs);
    }
  } catch {
    // Ignore filesystem errors — the DB is the source of truth for the
    // delete; the file move is best-effort.
  }

  // Update DB in a transaction.
  const tx = db.transaction(() => {
    if (input.hard) {
      db.prepare(`DELETE FROM notes WHERE id = ?`).run(row.id);
    } else {
      db.prepare(`UPDATE notes SET deleted_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        row.id,
      );
    }
  });
  tx();

  // Drop from FTS index (whether soft or hard).
  removeFromFts(db, row.id);

  return ok(
    DeleteDataSchema.parse({
      id: row.id,
      trashed_path: toPortable(trashAbs),
      hard: input.hard,
    }),
  );
}

export const deleteTool = {
  name: "memory_delete",
  description: "Soft-delete a note (moves to .trash/) or hard-delete (requires 7-day trash age).",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "ULID of the note to delete." },
      hard: { type: "boolean", description: "Permanently delete. Requires 7-day trash age." },
    },
    required: ["id"],
  },
  handler: deleteNote,
};
