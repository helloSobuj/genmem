# MCP Tools Reference

genmem exposes 8 tools over the [Model Context Protocol](https://modelcontextprotocol.io). All tools return a `TextContent` whose `.text` is a JSON-serialized `ToolResult<T>`:

```ts
type ToolResult<T> =
  | { ok: true;  data: T; warnings?: string[] }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

When `ok: false`, the MCP `isError` flag is also set. Errors are **never thrown** across the protocol boundary.

## Error codes

| Code | Meaning |
|---|---|
| `validation_error` | Input failed zod validation. |
| `not_found` | The requested note id doesn't exist (or was soft-deleted). |
| `conflict` | An operation would overwrite something the caller may not want to lose. |
| `trash_purge_required` | Hard delete attempted on a note younger than 7 days. |
| `io_error` | Disk I/O failure (permissions, disk full, etc.). |
| `internal_error` | Unhandled exception. |
| `unknown_tool` | Tool name not recognized by the server. |

## `memory_save`

Create or update a note. Writes the markdown file atomically, then upserts the DB row + FTS index in a transaction.

### Input

```ts
{
  id?: string;       // ULID of an existing note; omit to create.
  title?: string;    // 1-200 chars. Defaults to first non-empty body line.
  body: string;      // Markdown body, 1-200,000 chars.
  topic?: string;    // Defaults to "inbox". See CONFIG.topicPattern.
  tags?: string[];   // 0-20 lowercase tags.
  links?: string[];  // 0-50 ULIDs of related notes.
  source?: "chat" | "cli" | "import" | "api";  // default "chat"
}
```

### Output

```ts
{ id: string; path: string; topic: string; created: boolean; updated_at: string }
```

`created: true` means a new note was inserted; `false` means an existing note was updated. If `topic` changed on an update, the file is moved to the new topic directory.

## `memory_search`

FTS5 full-text search with BM25 ranking and highlighted snippets.

### Input

```ts
{
  query: string;         // 1-500 chars. User text is escaped to prevent FTS5 injection.
  topic?: string;        // Optional exact topic filter.
  limit?: number;        // 1-50, default 10.
  snippet_chars?: number; // 40-1000, default 200.
}
```

### Output

```ts
{
  query: string;
  total: number;        // total matches (not capped by limit)
  results: Array<{
    id: string;
    title: string;
    topic: string | null;
    path: string;
    score: number;       // BM25 (lower is better)
    snippet: string;     // contains <<...>> highlights
    tags: string[];
    updated_at: string;
  }>;
}
```

## `memory_get`

Fetch one note by id. Returns the full frontmatter and optionally the body.

### Input

```ts
{ id: string; include_body?: boolean; }  // include_body defaults to true
```

### Output

```ts
{
  id, title, topic, tags, links,
  body: string,
  frontmatter: { ... },   // all parsed frontmatter fields
  path: string,
  created_at, updated_at,
  size_bytes: number,
}
```

## `memory_recent`

List the N most recently updated notes, optionally filtered by topic.

### Input

```ts
{ limit?: number; topic?: string; }  // limit default 20, max 100
```

### Output

```ts
{ items: Array<{ id, title, topic, tags, updated_at, path }> }
```

## `memory_topics`

List all topics with note counts and last-updated timestamps. Aggregated directly from the `notes` table (source of truth).

### Input

None.

### Output

```ts
{
  topics: Array<{
    name: string;
    count: number;
    last_updated: string;
  }>;
}
```

Ordered by count descending, then name ascending.

## `memory_delete`

Soft-delete or hard-delete a note. Soft delete moves the file to `.trash/{id}-{ts}.md` and sets `deleted_at`. Hard delete requires the note to have been in trash for at least 7 days.

### Input

```ts
{ id: string; hard?: boolean; }  // hard defaults to false
```

### Output

```ts
{ id: string; trashed_path: string; hard: boolean }
```

Errors:
- `not_found` — id doesn't exist.
- `trash_purge_required` — `hard: true` but the note is in trash for < 7 days.

## `memory_link`

Create a typed edge between two notes. Idempotent. The edge is stored in `note_links` and mirrored into each note's `links_json`.

### Input

```ts
{ src_id: ULID; dst_id: ULID; kind?: string; }  // kind defaults to "related"
```

### Output

```ts
{ src_id, dst_id, kind, created: boolean }  // created: false if edge already existed
```

## `memory_reflect`

**Client-driven** context gathering. This tool does NOT call an LLM — it returns recent notes and a `prompt_hint` string the calling LLM can paste into its own reasoning to produce a reflection.

### Input

```ts
{
  topic?: string;      // Optional topic filter.
  since?: string;      // ISO 8601; only notes updated after this.
  max_items?: number;  // 1-200, default 50.
}
```

### Output

```ts
{
  items: Array<{
    id, title, snippet, topic, updated_at, tags
  }>;
  prompt_hint: string;  // "Review these N recent notes and synthesize..."
}
```

## Tool name conventions

All tool names use `snake_case` and live under the `memory_` namespace. New tools should follow the same convention.
