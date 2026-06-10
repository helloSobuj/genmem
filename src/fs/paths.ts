// Cross-platform path helpers for the scope layout. All paths are absolute
// and normalized. Returned paths use forward slashes for JSON safety;
// internal comparisons normalize via path.resolve on the local platform.

import { homedir } from "node:os";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

export class PathError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "PathError";
  }
}

/** Resolve the absolute scope root. Honors GENMEM_SCOPE. */
export function scopeRootPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.GENMEM_SCOPE;
  if (override && override.trim().length > 0) {
    return resolve(normalize(override));
  }
  return resolve(join(homedir(), ".genmem"));
}

/** Replace backslashes with forward slashes for portable JSON/DB storage. */
export function toPortable(p: string): string {
  return p.split(sep).join("/");
}

/** Reverse of toPortable: forward slashes → platform separator. */
export function fromPortable(p: string): string {
  return p.split("/").join(sep);
}

/** Memory dir for notes saved with no topic. */
export function memoryDir(scopeRoot: string): string {
  return join(scopeRoot, "memory");
}

/** Topics dir. */
export function topicsDir(scopeRoot: string): string {
  return join(scopeRoot, "topics");
}

/** A specific topic dir. */
export function topicDir(scopeRoot: string, topic: string): string {
  if (topic.includes("..") || topic.includes("\\") || topic.startsWith("/")) {
    throw new PathError(`invalid topic: ${topic}`, "invalid_topic");
  }
  return join(topicsDir(scopeRoot), topic);
}

/** Attachments dir. */
export function attachmentsDir(scopeRoot: string): string {
  return join(scopeRoot, "attachments");
}

/** Trash dir. */
export function trashDir(scopeRoot: string): string {
  return join(scopeRoot, ".trash");
}

/** SQLite dir + file. */
export function indexDir(scopeRoot: string): string {
  return join(scopeRoot, "index");
}

export function dbPath(scopeRoot: string): string {
  return join(indexDir(scopeRoot), "index.sqlite");
}

/** Config file. */
export function configPath(scopeRoot: string): string {
  return join(scopeRoot, "config.json");
}

/**
 * Assert that `child` resolves inside `parent`. Throws PathError otherwise.
 * Used by every writer to defend against path-traversal in user input.
 */
export function assertWithin(parent: string, child: string): void {
  const rel = relative(resolve(parent), resolve(child));
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathError(
      `path escapes scope root: ${child} not within ${parent}`,
      "path_traversal",
    );
  }
}

/** Filename for a memory: `{ulid}-{slug}.md`. */
export function memoryFilename(ulid: string, slug: string): string {
  return `${ulid}-${slug}.md`;
}

/** Extract the ULID prefix from a memory filename. Returns null if invalid. */
export function parseUlidFromFilename(name: string): string | null {
  const m = /^([0-9A-HJKMNP-TV-Z]{26})-/.exec(name);
  return m ? (m[1] ?? null) : null;
}
