// SQLite DDL for genmem schema v1. Single source of truth for the schema.
// Migrations are append-only: never edit SCHEMA_SQL after a release.
//
// Note: FTS5 sync is handled in app code (src/store/reindex.ts) rather than
// SQL triggers, because:
//   1. SQLite's FTS5 'delete-all' + insert pattern inside triggers is brittle
//      and has produced obscure "SQL logic error" failures on some platforms.
//   2. App-level sync gives us full control over content (e.g., JSON->space
//      tag normalization) and transaction boundaries.
//   3. The on-disk markdown files remain the source of truth, so the FTS
//      index is always rebuildable from disk via `genmem doctor --rebuild`.

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE notes (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  topic         TEXT NOT NULL DEFAULT 'inbox',
  path          TEXT NOT NULL UNIQUE,
  rel_path      TEXT NOT NULL,
  body          TEXT NOT NULL,
  body_size     INTEGER NOT NULL,
  tags_json     TEXT NOT NULL DEFAULT '[]',
  links_json    TEXT NOT NULL DEFAULT '[]',
  source        TEXT NOT NULL DEFAULT 'chat',
  schema_ver    INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  content_hash  TEXT NOT NULL,
  CHECK (length(id) = 26),
  CHECK (deleted_at IS NULL OR deleted_at >= updated_at)
);

CREATE INDEX idx_notes_topic       ON notes(topic)       WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_updated_at  ON notes(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_created_at  ON notes(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_deleted_at  ON notes(deleted_at)  WHERE deleted_at IS NOT NULL;

CREATE VIRTUAL TABLE notes_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  tags,
  topic,
  tokenize = 'porter unicode61 remove_diacritics 2'
);

CREATE TABLE topic_stats (
  topic        TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL
);

CREATE TABLE note_links (
  src_id TEXT NOT NULL,
  dst_id TEXT NOT NULL,
  kind   TEXT NOT NULL DEFAULT 'related',
  created_at TEXT NOT NULL,
  PRIMARY KEY (src_id, dst_id, kind),
  FOREIGN KEY (src_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (dst_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX idx_note_links_dst ON note_links(dst_id);

INSERT INTO meta(key, value) VALUES ('schema_version', '1');
INSERT INTO meta(key, value) VALUES ('created_at', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
`;
