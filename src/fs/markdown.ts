// Markdown read/write with frontmatter. Atomic save: write to *.tmp in the
// same directory, fsync, rename over target. Same-directory tmp avoids
// Windows cross-volume copy+delete fallback on crash.

import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { open } from "node:fs/promises";
import matter from "gray-matter";
import { z } from "zod";
import { CONFIG } from "../config.js";

export const NoteFrontmatterSchema = z.object({
  id: z.string().regex(CONFIG.ulidPattern),
  title: z.string().min(1).max(200),
  topic: z.string().regex(CONFIG.topicPattern).default("inbox"),
  tags: z.array(z.string().regex(CONFIG.tagPattern)).max(CONFIG.maxTags).default([]),
  links: z
    .array(z.string().regex(CONFIG.ulidPattern))
    .max(CONFIG.maxLinks)
    .default([]),
  // gray-matter auto-parses ISO timestamps into JS Date objects. Accept
  // either and normalize to an ISO 8601 string with the `Z` suffix.
  created_at: z
    .union([z.string().datetime({ offset: true }), z.date()])
    .transform(toIsoString),
  updated_at: z
    .union([z.string().datetime({ offset: true }), z.date()])
    .transform(toIsoString),
  source: z.enum(["chat", "cli", "import", "api"]),
  schema_version: z.literal(CONFIG.schemaVersion),
});

function toIsoString(v: string | Date): string {
  if (v instanceof Date) return v.toISOString();
  // Normalize "2026-01-15T14:32:11.045Z" / "+00:00" variants to a single
  // "Z" suffix so downstream consumers can rely on one shape.
  return v.endsWith("Z") ? v : v.replace(/[+-]\d{2}:?\d{2}$/, "Z");
}

export type NoteFrontmatter = z.infer<typeof NoteFrontmatterSchema>;

export const CreateNoteInputSchema = z.object({
  id: z.string().regex(CONFIG.ulidPattern).optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(CONFIG.maxBodySize),
  topic: z.string().regex(CONFIG.topicPattern).default("inbox"),
  tags: z
    .array(z.string().regex(CONFIG.tagPattern))
    .max(CONFIG.maxTags)
    .default([]),
  links: z
    .array(z.string().regex(CONFIG.ulidPattern))
    .max(CONFIG.maxLinks)
    .default([]),
  source: z.enum(["chat", "cli", "import", "api"]).default("chat"),
});

export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;

export class NoteFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteFormatError";
  }
}

/** Normalize line endings to LF. */
export function normalizeLineEndings(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Slugify a string into [a-z0-9-]{1,80}. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const cleaned = base.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "note";
}

export interface ParsedNote {
  frontmatter: NoteFrontmatter;
  body: string;
  raw: string;
}

/** Parse a markdown file. Validates frontmatter with zod. */
export async function readNote(filePath: string): Promise<ParsedNote> {
  const raw = await readFile(filePath, "utf8");
  const parsed = matter(raw, { delimiters: "---" });
  const fm = NoteFrontmatterSchema.safeParse(parsed.data);
  if (!fm.success) {
    throw new NoteFormatError(
      `invalid frontmatter in ${filePath}: ${fm.error.message}`,
    );
  }
  return {
    frontmatter: fm.data,
    body: normalizeLineEndings(parsed.content).replace(/\n+$/, ""),
    raw,
  };
}

/** Serialize frontmatter + body to a markdown string. */
export function serializeNote(fm: NoteFrontmatter, body: string): string {
  const normalized = normalizeLineEndings(body);
  const stripped = normalized.replace(/^---\s*\n/, "").replace(/\n---\s*$/, "");
  const yaml = matter.stringify(stripped, fm, { delimiters: "---" });
  return yaml.endsWith("\n") ? yaml : yaml + "\n";
}

export interface AtomicWriteOptions {
  /** Directory to place the *.tmp file in. Must be the same as the target. */
  tmpDir: string;
}

/** Atomically write `content` to `filePath`. */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  const tmp = join(dir, `.${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`);
  let fh: import("node:fs/promises").FileHandle | null = null;
  try {
    fh = await open(tmp, "w");
    await fh.writeFile(content, "utf8");
    await fh.sync();
    await fh.close();
    fh = null;
    await rename(tmp, filePath);
  } catch (err) {
    if (fh) {
      try { await fh.close(); } catch { /* ignore */ }
    }
    try { await unlink(tmp); } catch { /* ignore */ }
    throw err;
  }
}

/** Write a new note atomically. Creates the topic dir if missing. */
export async function writeNote(
  filePath: string,
  fm: NoteFrontmatter,
  body: string,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const content = serializeNote(fm, body);
  await atomicWriteFile(filePath, content);
}

/** Derive a default title from the first non-empty body line. */
export function deriveTitle(body: string): string {
  const line = body.split("\n").find((l) => l.trim().length > 0) ?? "";
  const stripped = line.replace(/^#+\s*/, "").trim();
  return stripped.slice(0, 200) || "Untitled";
}
