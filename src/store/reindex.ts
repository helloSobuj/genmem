// Disk → DB reconciliation. Scans every .md file under the scope, parses
// frontmatter, and upserts into the `notes` table + FTS index. Used by
// `genmem doctor --rebuild` and `genmem import`.

import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Database } from "better-sqlite3";
import { readNote } from "../fs/markdown.js";
import { toPortable } from "../fs/paths.js";

export interface ReindexResult {
  scanned: number;
  inserted: number;
  updated: number;
  removed: number;
  errors: Array<{ file: string; message: string }>;
}

interface NoteRow {
  id: string;
  content_hash: string;
  deleted_at: string | null;
}

function contentHash(fm: { id: string; updated_at: string }, body: string): string {
  return createHash("sha256")
    .update(`${fm.id}\n${fm.updated_at}\n${body}`)
    .digest("hex");
}

async function* walkMarkdown(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".trash" || entry.name === "index" || entry.name === "attachments") continue;
      yield* walkMarkdown(p);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield p;
    }
  }
}

export async function reindex(
  db: Database,
  scopeRoot: string,
): Promise<ReindexResult> {
  const result: ReindexResult = { scanned: 0, inserted: 0, updated: 0, removed: 0, errors: [] };

  // Collect all .md files on disk.
  const diskFiles: string[] = [];
  for await (const f of walkMarkdown(scopeRoot)) {
    diskFiles.push(f);
  }

  // Existing note ids in the DB.
  const existing = new Map<string, NoteRow>();
  for (const row of db.prepare(`SELECT id, content_hash, deleted_at FROM notes`).all() as NoteRow[]) {
    existing.set(row.id, row);
  }
  const seen = new Set<string>();

  const upsert = db.transaction((args: {
    id: string;
    title: string;
    topic: string;
    path: string;
    relPath: string;
    body: string;
    tags: string[];
    links: string[];
    source: string;
    createdAt: string;
    updatedAt: string;
    contentHash: string;
    isNew: boolean;
  }) => {
    const r = db.prepare(
      `INSERT INTO notes (id, title, topic, path, rel_path, body, body_size, tags_json, links_json, source, schema_ver, created_at, updated_at, content_hash, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title,
         topic=excluded.topic,
         path=excluded.path,
         rel_path=excluded.rel_path,
         body=excluded.body,
         body_size=excluded.body_size,
         tags_json=excluded.tags_json,
         links_json=excluded.links_json,
         source=excluded.source,
         updated_at=excluded.updated_at,
         content_hash=excluded.content_hash,
         deleted_at=NULL`,
    ).run(
      args.id,
      args.title,
      args.topic,
      args.path,
      args.relPath,
      args.body,
      args.body.length,
      JSON.stringify(args.tags),
      JSON.stringify(args.links),
      args.source,
      1,
      args.createdAt,
      args.updatedAt,
      args.contentHash,
    );
    if (r.changes === 1 && args.isNew) result.inserted++;
    else if (r.changes === 1) result.updated++;
  });

  for (const filePath of diskFiles) {
    result.scanned++;
    try {
      const parsed = await readNote(filePath);
      const fm = parsed.frontmatter;
      const id = fm.id;
      seen.add(id);

      const relPath = toPortable(relative(scopeRoot, filePath));
      const absPath = toPortable(resolve(filePath));
      const contentHashVal = contentHash(fm, parsed.body);

      const prior = existing.get(id);
      if (prior && prior.content_hash === contentHashVal && prior.deleted_at === null) {
        continue; // unchanged
      }

      const isNew = !prior;
      upsert({
        id,
        title: fm.title,
        topic: fm.topic,
        path: absPath,
        relPath,
        body: parsed.body,
        tags: fm.tags,
        links: fm.links,
        source: fm.source,
        createdAt: fm.created_at,
        updatedAt: fm.updated_at,
        contentHash: contentHashVal,
        isNew,
      });
    } catch (e) {
      result.errors.push({ file: filePath, message: (e as Error).message });
    }
  }

  // Remove notes from DB that are no longer on disk.
  for (const [id] of existing) {
    if (seen.has(id)) continue;
    db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
    result.removed++;
  }

  // Rebuild FTS from current `notes` content. This is the simplest correct
  // path: drop all FTS rows and re-insert from the authoritative source.
  db.exec(`DELETE FROM notes_fts`);
  const allNotes = db.prepare(
    `SELECT id, title, topic, body, tags_json FROM notes WHERE deleted_at IS NULL`,
  ).all() as Array<{ id: string; title: string; topic: string; body: string; tags_json: string }>;
  const insertFts = db.prepare(
    `INSERT INTO notes_fts(id, title, body, tags, topic) VALUES (?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    for (const n of allNotes) {
      const tags = JSON.parse(n.tags_json) as string[];
      insertFts.run(n.id, n.title, n.body, tags.join(" "), n.topic);
    }
  });
  tx();

  return result;
}

/** Wipe the FTS index and rebuild from the `notes` table. */
export function rebuildFts(db: Database): { count: number } {
  db.exec(`DELETE FROM notes_fts`);
  const allNotes = db.prepare(
    `SELECT id, title, topic, body, tags_json FROM notes WHERE deleted_at IS NULL`,
  ).all() as Array<{ id: string; title: string; topic: string; body: string; tags_json: string }>;
  const insertFts = db.prepare(
    `INSERT INTO notes_fts(id, title, body, tags, topic) VALUES (?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    for (const n of allNotes) {
      const tags = JSON.parse(n.tags_json) as string[];
      insertFts.run(n.id, n.title, n.body, tags.join(" "), n.topic);
    }
  });
  tx();
  return { count: allNotes.length };
}
