// Commander root. Wires subcommands and global flags.

import { Command } from "commander";
import { pathToFileURL } from "node:url";
import { CONFIG } from "../config.js";
import { initCommand } from "./init.js";
import { doctorCommand, type DoctorReport } from "./doctor.js";
import { listCommand, printList } from "./list.js";
import { configGetCommand, configPathCommand, configSetCommand } from "./config.js";
import { installCommand, printInstallReport } from "./install.js";
import { uninstallCommand, printUninstallReport } from "./uninstall.js";
import { exportCommand } from "./export.js";
import { importCommand } from "./import.js";
import { setLogger, Logger } from "../ui/log.js";
import { ALL_CLIENTS, type ClientId } from "../fs/editor-config.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("genmem")
    .description("Local-first markdown memory")
    .version(CONFIG.version)
    .option("--user <name>", "scope user override")
    .option("--scope <path>", "scope root override")
    .option("--log-level <level>", "log level (debug|info|warn|error|silent)", "info")
    .option("--json", "output JSON where applicable")
    .option("--quiet", "suppress non-error output")
    .option("--no-color", "disable ANSI colors");

  program
    .command("init")
    .description("create scope directory structure and config.json")
    .option("--force", "re-initialize even if scope exists")
    .action(async (cmdOpts) => {
      const opts = program.opts();
      const log = new Logger({ level: opts.logLevel, noColor: opts.color === false, quiet: opts.quiet });
      setLogger(log);
      const r = await initCommand({ user: opts.user, scope: opts.scope, force: cmdOpts.force, quiet: opts.quiet });
      if (opts.json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });

  program
    .command("doctor")
    .description("run diagnostics; optionally rebuild the FTS index")
    .option("--rebuild", "wipe the index and rebuild from disk")
    .action(async (cmdOpts) => {
      const opts = program.opts();
      const log = new Logger({ level: opts.logLevel, noColor: opts.color === false, quiet: opts.quiet });
      setLogger(log);
      const r: DoctorReport = await doctorCommand({
        user: opts.user,
        scope: opts.scope,
        json: opts.json,
        rebuild: cmdOpts.rebuild,
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      } else {
        log.info(`scope: ${r.scopeRoot}`);
        log.info(`notes: ${r.notesCount}  fts: ${r.ftsCount}  db: ${r.dbIntegrity}`);
        if (r.errors.length > 0) {
          for (const e of r.errors) log.error(e);
        }
        for (const w of r.warnings) log.warn(w);
        log.info(r.ok ? "ok" : "errors found");
      }
      if (!r.ok) process.exit(1);
    });

  program
    .command("list")
    .description("list notes from the index")
    .option("--topic <name>", "filter by topic")
    .option("--limit <n>", "max items", (v) => parseInt(v, 10), 50)
    .action(async (cmdOpts) => {
      const opts = program.opts();
      const log = new Logger({ level: opts.logLevel, noColor: opts.color === false, quiet: opts.quiet });
      setLogger(log);
      const items = await listCommand({
        user: opts.user,
        scope: opts.scope,
        topic: cmdOpts.topic,
        limit: cmdOpts.limit,
        json: opts.json,
        quiet: opts.quiet,
      });
      printList(items, !!opts.json, log);
    });

  const configCmd = program
    .command("config")
    .description("read or write scope config");
  configCmd
    .command("get <key>")
    .description("print a config value")
    .action(async (key) => {
      const opts = program.opts();
      const log = new Logger({ level: opts.logLevel, noColor: opts.color === false, quiet: opts.quiet });
      setLogger(log);
      const v = await configGetCommand(key, { user: opts.user, scope: opts.scope });
      process.stdout.write(v + "\n");
    });
  configCmd
    .command("set <key> <value>")
    .description("update a config value")
    .action(async (key, value) => {
      const opts = program.opts();
      const log = new Logger({ level: opts.logLevel, noColor: opts.color === false, quiet: opts.quiet });
      setLogger(log);
      await configSetCommand(key, value, { user: opts.user, scope: opts.scope, quiet: opts.quiet });
    });
  configCmd
    .command("path")
    .description("print the scope config.json path")
    .action(async () => {
      const opts = program.opts();
      const log = new Logger({ level: opts.logLevel, noColor: opts.color === false, quiet: opts.quiet });
      setLogger(log);
      const p = await configPathCommand({ user: opts.user, scope: opts.scope });
      process.stdout.write(p + "\n");
    });

  const clientList = ALL_CLIENTS.join("|");
  program
    .command("install")
    .description(`register genmem as an MCP server in detected AI clients (${clientList})`)
    .option("--client <name>", `target a single client (${clientList})`)
    .option("--force", "overwrite an existing genmem entry (with backup)")
    .option("--no-backup", "skip writing a .bak.<ts> backup before overwriting")
    .option("--dry-run", "show what would change without writing anything")
    .action(async (cmdOpts) => {
      const opts = program.opts();
      const log = new Logger({ level: opts.logLevel, noColor: opts.color === false, quiet: opts.quiet });
      setLogger(log);
      const client = cmdOpts.client as ClientId | undefined;
      const r = await installCommand({
        client,
        user: opts.user,
        scope: opts.scope,
        force: cmdOpts.force,
        noBackup: cmdOpts.backup === false,
        dryRun: cmdOpts.dryRun,
        quiet: opts.quiet,
      });
      printInstallReport(r, !!opts.json, !!cmdOpts.dryRun, log);
      if (r.results.some((x) => x.action === "skipped")) process.exitCode = 1;
    });

  program
    .command("uninstall")
    .description("remove the genmem MCP server entry from detected AI clients")
    .option("--client <name>", `target a single client (${clientList})`)
    .option("--no-backup", "skip writing a .bak.<ts> backup before removing")
    .option("--dry-run", "show what would change without writing anything")
    .action(async (cmdOpts) => {
      const opts = program.opts();
      const log = new Logger({ level: opts.logLevel, noColor: opts.color === false, quiet: opts.quiet });
      setLogger(log);
      const client = cmdOpts.client as ClientId | undefined;
      const r = await uninstallCommand({
        client,
        noBackup: cmdOpts.backup === false,
        dryRun: cmdOpts.dryRun,
        quiet: opts.quiet,
      });
      printUninstallReport(r, !!opts.json, !!cmdOpts.dryRun, log);
    });

  program
    .command("export")
    .description("bundle a scope's markdown files into a portable zip")
    .requiredOption("--out <file>", "output zip path")
    .option("--include-config", "include config.json in the archive")
    .action(async (cmdOpts) => {
      const opts = program.opts();
      const log = new Logger({ level: opts.logLevel, noColor: opts.color === false, quiet: opts.quiet });
      setLogger(log);
      const r = await exportCommand({
        user: opts.user,
        scope: opts.scope,
        out: cmdOpts.out,
        includeConfig: cmdOpts.includeConfig,
        quiet: opts.quiet,
      });
      if (opts.json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });

  program
    .command("import")
    .description("restore a scope from a zip produced by `genmem export`")
    .requiredOption("--in <file>", "input zip path")
    .option("--replace", "overwrite existing files in the scope")
    .action(async (cmdOpts) => {
      const opts = program.opts();
      const log = new Logger({ level: opts.logLevel, noColor: opts.color === false, quiet: opts.quiet });
      setLogger(log);
      const r = await importCommand({
        user: opts.user,
        scope: opts.scope,
        in: cmdOpts.in,
        replace: cmdOpts.replace,
        quiet: opts.quiet,
      });
      if (opts.json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    });

  return program;
}

const isDirectRun =
  import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : "");
if (isDirectRun) {
  const program = createProgram();
  program.parseAsync(process.argv).catch((err) => {
    process.stderr.write(`[error] ${(err as Error).message}\n`);
    process.exit(1);
  });
}
