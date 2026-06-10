// Frozen configuration object. Resolved once at startup; immutable after.

import { userInfo } from "node:os";

export const CONFIG = Object.freeze({
  /** npm package name. */
  name: "genmem-mcp",
  /** Semantic version, mirrored from package.json. */
  version: "0.1.0",
  /** Default scope root: %USERPROFILE%\.genmem */
  defaultScopeRoot: ".genmem",
  /** Default scope/user: OS user. */
  defaultUser: () => userInfo().username || "default",
  /** DB file name inside scopeRoot/index/. */
  dbFileName: "index.sqlite",
  /** Schema version this build ships with. */
  schemaVersion: 1,
  /** FTS5 tokenizer. */
  ftsTokenizer: "porter unicode61 remove_diacritics 2",
  /** Markdown body size limit (bytes). */
  maxBodySize: 200_000,
  /** Tag count limit per note. */
  maxTags: 20,
  /** Outbound link count limit per note. */
  maxLinks: 50,
  /** Default snippet length in characters. */
  defaultSnippetChars: 200,
  /** Reserved directory names inside the scope root. */
  reservedDirs: ["index", ".trash", "attachments"] as const,
  /** ULID pattern (Crockford base32, 26 chars). */
  ulidPattern: /^[0-9A-HJKMNP-TV-Z]{26}$/,
  /** Slug pattern: lowercase alnum + dashes, 1-80 chars. */
  slugPattern: /^[a-z0-9-]{1,80}$/,
  /** Topic path pattern: lowercase alnum + dashes/slashes, 1-64 chars. */
  topicPattern: /^[a-z0-9][a-z0-9-_/]{0,63}$/,
  /** Tag pattern. */
  tagPattern: /^[a-z0-9][a-z0-9-_]{0,31}$/,
});

export type AppConfig = typeof CONFIG;
