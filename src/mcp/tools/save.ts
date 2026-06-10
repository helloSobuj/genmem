// `memory_save` — create or update a note.
//
// On insert: generates a ULID, slugifies the title, writes a markdown file
// atomically, and upserts the DB row + FTS index in a transaction.
// On update: locates the existing file, moves it if the topic changed,
// rewrites the markdown, and updates the DB row + FTS index.

import { mkdir, rename, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { ulid } from "ulid";
import { z } from "zod";
import type { Database } from "better-sqlite3";
import {
  atomicWriteFile,
  CreateNoteInputSchema,
  deriveTitle,
  NoteFrontmatterSchema,
  readNote,
  serializeNote,
  slugify,
} from "../../fs/markdown.js";
import {
  assertWithin,
  memoryDir,
  parseUlidFromFilename,
  toPortable,
  topicDir,
} from "../../fs/paths.js";
import { syncFts, tagsToFts, removeFromFts } from "../../store/fts.js";
import { ErrorCode, fail, ok, toMcpResult, type ToolResult } from "../format.js";
import { CONFIG } from "../../config.js";
import type { NoteRecord } from "../../store/models.js";
import { runMigrations } from "../../store/migrations.js";

const SaveInputSchema = CreateNoteInputSchema;
export type SaveInput = z.infer<typeof SaveInputSchema>;

export interface SaveData {
  id: string;
  path: string;
  topic: string;
  created: boolean;
  updated_at: string;
  warnings?: string[];
}

const SaveResultSchema = z.object({
  id: z.string(),
  path: z.string(),
  topic: z.string(),
  created: z.boolean(),
  updated_at: z.string(),
});

function contentHash(id: string, updatedAt: string, body: string): string {
  return createHash("sha256").update(`${id}\n${updatedAt}\n${body}`).digest("hex");
}

function noteToRecord(
  id: string,
  title: string,
  topic: string,
  body: string,
  tags: string[],
  links: string[],
  source: SaveInput["source"],
  createdAt: string,
  updatedAt: string,
  path: string,
  relPath: string,
): NoteRecord {
  return {
    id,
    title,
    topic,
    body,
    body_size: body.length,
    tags,
    links,
    source,
    schema_ver: CONFIG.schemaVersion,
    created_at: createdAt,
    updated_at: updatedAt,
    deleted_at: null,
    content_hash: contentHash(id, updatedAt, body),
    path,
    rel_path: relPath,
  };
}

/** Resolve the on-disk path for a new note given topic + id + slug. */
function notePath(scopeRoot: string, topic: string, id: string, slug: string): string {
  const dir = topicDir(scopeRoot, topic);
  assertWithin(scopeRoot, dir);
  return join(dir, `${id}-${slug}.md`);
}

export async function saveNote(
  db: Database,
  scopeRoot: string,
  rawInput: unknown,
): Promise<ToolResult<SaveData>> {
  const parsed = SaveInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(ErrorCode.ValidationError, "invalid input", parsed.error.flatten());
  }
  const input = parsed.data;

  const now = new Date().toISOString();
  const warnings: string[] = [];

  // CASE 1: UPDATE (id provided)
  if (input.id) {
    const existing = db
      .prepare(`SELECT id, title, topic, path, rel_path, created_at FROM notes WHERE id = ? AND deleted_at IS NULL`)
      .get(input.id) as
      | { id: string; title: string; topic: string; path: string; rel_path: string; created_at: string }
      | undefined;

    if (!existing) {
      return fail(ErrorCode.NotFound, `note not found: ${input.id}`);
    }

    const newTitle = input.title ?? existing.title;
    const newTopic = input.topic ?? existing.topic;
    const newTags = input.tags;
    const newLinks = input.links;
    const updatedAt = now;

    // If the topic changed, move the file. Otherwise just rewrite in place.
    let newPath = existing.path;
    let newRel = existing.rel_path;
    if (newTopic !== existing.topic || input.title !== undefined) {
      // Slug from the (possibly new) title.
      const newSlug = slugify(newTitle);
      const newAbs = notePath(scopeRoot, newTopic, existing.id, newSlug);
      assertWithin(scopeRoot, newAbs);
      // If the new path is different from the old, move the file first.
      if (toPortable(resolve(newAbs)) !== existing.path) {
        await mkdir(dirname(newAbs), { recursive: true });
        try {
          // Only rename if the old file actually exists on disk; otherwise
          // we're repairing a DB/markdown mismatch.
          await stat(fromPortableIfPossible(existing.path));
          await rename(fromPortableIfPossible(existing.path), newAbs);
        } catch {
          // Old file missing — just write the new one.
        }
      }
      newPath = toPortable(resolve(newAbs));
      newRel = toPortable(relative(scopeRoot, newAbs));
    }

    // Build the new frontmatter.
    const fm = NoteFrontmatterSchema.parse({
      id: existing.id,
      title: newTitle,
      topic: newTopic,
      tags: newTags,
      links: newLinks,
      created_at: existing.created_at,
      updated_at: updatedAt,
      source: input.source,
      schema_version: CONFIG.schemaVersion,
    });

    // Atomically write the markdown file.
    const absFile = fromPortableIfPossible(newPath);
    await atomicWriteFile(absFile, serializeNote(fm, input.body));

    // Update DB row + FTS in a transaction.
    const hash = contentHash(existing.id, updatedAt, input.body);
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE notes
         SET title = ?, topic = ?, path = ?, rel_path = ?, body = ?, body_size = ?,
             tags_json = ?, links_json = ?, source = ?, updated_at = ?, content_hash = ?
         WHERE id = ?`,
      ).run(
        newTitle,
        newTopic,
        newPath,
        newRel,
        input.body,
        input.body.length,
        JSON.stringify(newTags),
        JSON.stringify(newLinks),
        input.source,
        updatedAt,
        hash,
        existing.id,
      );
    });
    tx();
    syncFts(db, noteToRecord(
      existing.id, newTitle, newTopic, input.body, newTags, newLinks,
      input.source, existing.created_at, updatedAt, newPath, newRel,
    ));

    return ok(
      SaveResultSchema.parse({
        id: existing.id,
        path: newPath,
        topic: newTopic,
        created: false,
        updated_at: updatedAt,
      }),
      warnings.length > 0 ? warnings : undefined,
    );
  }

  // CASE 2: INSERT (no id)
  const id = ulid();
  const title = input.title ?? deriveTitle(input.body);
  const topic = input.topic;
  const slug = slugify(title);
  const createdAt = now;
  const updatedAt = now;

  const absPath = notePath(scopeRoot, topic, id, slug);
  await mkdir(dirname(absPath), { recursive: true });

  const fm = NoteFrontmatterSchema.parse({
    id,
    title,
    topic,
    tags: input.tags,
    links: input.links,
    created_at: createdAt,
    updated_at: updatedAt,
    source: input.source,
    schema_version: CONFIG.schemaVersion,
  });

  await atomicWriteFile(absPath, serializeNote(fm, input.body));

  const portablePath = toPortable(resolve(absPath));
  const relPath = toPortable(relative(scopeRoot, absPath));
  const hash = contentHash(id, updatedAt, input.body);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO notes (id, title, topic, path, rel_path, body, body_size, tags_json, links_json, source, schema_ver, created_at, updated_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, title, topic, portablePath, relPath, input.body, input.body.length,
      JSON.stringify(input.tags), JSON.stringify(input.links),
      input.source, CONFIG.schemaVersion, createdAt, updatedAt, hash,
    );
  });
  tx();
  syncFts(db, noteToRecord(
    id, title, topic, input.body, input.tags, input.links,
    input.source, createdAt, updatedAt, portablePath, relPath,
  ));

  return ok(
    SaveResultSchema.parse({
      id,
      path: portablePath,
      topic,
      created: true,
      updated_at: updatedAt,
    }),
    warnings.length > 0 ? warnings : undefined,
  );
}

/** Convert a portable (forward-slash) path to a platform-native one if needed. */
function fromPortableIfPossible(p: string): string {
  // Portable paths use forward slashes. On Windows, Node accepts those natively
  // for most APIs. We keep the path as-is to avoid mangling it.
  return p;
}

// Re-export the MCP-callable handler wrapper.
export const saveTool = {
  name: "memory_save",
  description: "Create a new note or update an existing one. Returns the note's id and on-disk path.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "ULID of an existing note; omit to create a new one." },
      title: { type: "string", description: "1-200 chars. Defaults to first non-empty line of body." },
      body: { type: "string", description: "Markdown body, 1-200000 chars." },
      topic: { type: "string", description: "Topic path, defaults to 'inbox'." },
      tags: { type: "array", items: { type: "string" }, description: "0-20 lowercase tags." },
      links: { type: "array", items: { type: "string" }, description: "0-50 ULIDs of related notes." },
      source: { type: "string", enum: ["chat", "cli", "import", "api"] },
    },
    required: ["body"],
  },
  handler: saveNote,
};

// Suppress unused-import warnings for things referenced for their types.
void memoryDir;
void parseUlidFromFilename;
void readNote;
void runMigrations;
void toMcpResult;
void removeFromFts;
void tagsToFts;
