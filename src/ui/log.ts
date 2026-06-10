// Stderr-only logger. Honors --quiet, --no-color, and GENMEM_LOG.
// Stdout is reserved for the MCP JSON-RPC stream and CLI --json output.

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GRAY = "\x1b[90m";
const CYAN = "\x1b[36m";

function colorize(color: string, text: string, enabled: boolean): string {
  return enabled ? `${color}${text}${RESET}` : text;
}

export interface LogOptions {
  level?: LogLevel;
  /** Disable ANSI colors. Auto-detected from NO_COLOR env and TTY. */
  noColor?: boolean;
  /** Suppress all non-error output. */
  quiet?: boolean;
  /** Stream to write to. Default: process.stderr. */
  stream?: NodeJS.WritableStream;
}

export class Logger {
  private level: LogLevel;
  private noColor: boolean;
  private quiet: boolean;
  private stream: NodeJS.WritableStream;

  constructor(opts: LogOptions = {}) {
    const envLevel = (process.env.GENMEM_LOG ?? "info") as LogLevel;
    this.level = opts.level ?? envLevel;
    this.noColor =
      opts.noColor ?? (process.env.NO_COLOR ? true : !process.stderr.isTTY);
    this.quiet = opts.quiet ?? false;
    this.stream = opts.stream ?? process.stderr;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
  }

  private log(level: LogLevel, color: string, prefix: string, msg: string): void {
    if (this.quiet && level !== "error") return;
    if (LEVELS[level] < LEVELS[this.level]) return;
    const line = `${colorize(color, prefix, !this.noColor)} ${msg}\n`;
    this.stream.write(line);
  }

  debug(msg: string): void {
    this.log("debug", GRAY, "[debug]", msg);
  }
  info(msg: string): void {
    this.log("info", CYAN, "[info]", msg);
  }
  warn(msg: string): void {
    this.log("warn", YELLOW, "[warn]", msg);
  }
  error(msg: string): void {
    this.log("error", RED, "[error]", msg);
  }
  /** Bare message, no prefix, no level filtering. Always shown unless quiet. */
  raw(msg: string): void {
    if (this.quiet) return;
    this.stream.write(`${msg}\n`);
  }
}

let defaultLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!defaultLogger) defaultLogger = new Logger();
  return defaultLogger;
}

export function setLogger(logger: Logger): void {
  defaultLogger = logger;
}
