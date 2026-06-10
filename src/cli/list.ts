// `genmem list` — list notes from the DB (with --topic filter).

import { existsSync } from "node:fs";
import { resolveScope } from "../fs/scope.js";
import { openDb } from "../store/db.js";
import { dbPath } from "../fs/paths.js";
import { getLogger } from "../ui/log.js";

export interface ListOptions {
  user?: string;
  scope?: string;
  topic?: string;
  limit?: number;
  json?: boolean;
  quiet?: boolean;
}

export interface ListItem {
  id: string;
  title: string;
  topic: string;
  tags: string[];
  updated_at: string;
  path: string;
}

export async function listCommand(opts: ListOptions = {}): Promise<ListItem[]> {
  const log = getLogger();
  const scope = await resolveScope({ user: opts.user, scope: opts.scope });
  const dbFile = dbPath(scope.scopeRoot);

  if (!existsSync(dbFile)) {
    if (!opts.quiet) {
      log.warn(`no index found at ${dbFile} — run \`genmem init\` and \`genmem doctor --rebuild\``);
    }
    return [];
  }

  const db = openDb({ path: dbFile, readonly: true });
  try {
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 500));
    const rows = opts.topic
      ? (db
          .prepare(
            `SELECT id, title, topic, path, tags_json, updated_at FROM notes
             WHERE deleted_at IS NULL AND topic = ?
             ORDER BY updated_at DESC LIMIT ?`,
          )
          .all(opts.topic, limit) as Array<{
          id: string;
          title: string;
          topic: string;
          path: string;
          tags_json: string;
          updated_at: string;
        }>)
      : (db
          .prepare(
            `SELECT id, title, topic, path, tags_json, updated_at FROM notes
             WHERE deleted_at IS NULL
             ORDER BY updated_at DESC LIMIT ?`,
          )
          .all(limit) as Array<{
          id: string;
          title: string;
          topic: string;
          path: string;
          tags_json: string;
          updated_at: string;
        }>);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      topic: r.topic,
      tags: JSON.parse(r.tags_json) as string[],
      updated_at: r.updated_at,
      path: r.path,
    }));
  } finally {
    db.close();
  }
}

/** Print a list of items in a human-readable table (stderr) or JSON (stdout). */
export function printList(items: ListItem[], json: boolean, log = getLogger()): void {
  if (json) {
    process.stdout.write(JSON.stringify({ items, count: items.length }, null, 2) + "\n");
    return;
  }
  if (items.length === 0) {
    log.raw("(no notes)");
    return;
  }
  for (const item of items) {
    const tags = item.tags.length > 0 ? ` [${item.tags.join(", ")}]` : "";
    log.raw(`${item.id.slice(-8)}  ${item.topic.padEnd(16)}  ${item.title}${tags}`);
  }
  log.raw(`\n${items.length} note(s)`);
}
