// Result envelope for MCP tool returns. Every tool returns a TextContent
// whose `.text` is a JSON-serialized `ToolResult<T>`. Errors are NEVER
// thrown across the protocol boundary — they're caught and shaped.

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolResult<T> =
  | { ok: true; data: T; warnings?: string[] }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export function ok<T>(data: T, warnings?: string[]): ToolResult<T> {
  return warnings && warnings.length > 0
    ? { ok: true, data, warnings }
    : { ok: true, data };
}

export function fail(
  code: string,
  message: string,
  details?: unknown,
): ToolResult<never> {
  return { ok: false, error: { code, message, details } };
}

export function toMcpResult<T>(r: ToolResult<T>): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(r, null, 2),
      },
    ],
    isError: !r.ok,
  };
}

/** Error codes used across tools. Keep these stable — callers pattern-match on them. */
export const ErrorCode = {
  ValidationError: "validation_error",
  NotFound: "not_found",
  Conflict: "conflict",
  TrashPurgeRequired: "trash_purge_required",
  IoError: "io_error",
  InternalError: "internal_error",
} as const;
