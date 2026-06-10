// App-level FTS5 sync. We use this instead of SQL triggers for portability
// and testability. The FTS table is contentless (no `content=` clause), so
// FTS5 stores its own copy of the data and we manage inserts/deletes from
// app code. The on-disk markdown files remain the source of truth, so the
// FTS index is always rebuildable from disk via `genmem doctor --rebuild`.

import type { Database } from "better-sqlite3";
import type { NoteRecord } from "./models.js";

/** Convert a tag array into a space-joined string for FTS5 indexing. */
export function tagsToFts(tags: string[]): string {
  return tags
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 0)
    .join(" ");
}

/**
 * Sync a single note into the FTS index. Call inside a transaction.
 * Idempotent: safe to call on every save. The FTS table is contentless
 * (no `content=` clause), so we use plain SQL DELETE for removal and
 * INSERT for upsert. The `'delete'` special command is avoided because
 * it's brittle across SQLite versions and trigger contexts.
 */
export function syncFts(db: Database, note: NoteRecord): void {
  db.prepare(`DELETE FROM notes_fts WHERE id = ?`).run(note.id);
  db.prepare(
    `INSERT INTO notes_fts(id, title, body, tags, topic) VALUES (?, ?, ?, ?, ?)`,
  ).run(note.id, note.title, note.body, tagsToFts(note.tags), note.topic);
}

/** Remove a note from the FTS index. No-op if not present. */
export function removeFromFts(db: Database, id: string): void {
  db.prepare(`DELETE FROM notes_fts WHERE id = ?`).run(id);
}
