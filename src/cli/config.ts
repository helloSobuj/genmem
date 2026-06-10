// `genmem config get|set|path` — read/write the scope's config.json.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { z } from "zod";
import { resolveScope } from "../fs/scope.js";
import { configPath } from "../fs/paths.js";
import { getLogger } from "../ui/log.js";

const ConfigSchema = z.object({
  version: z.literal(1),
  user: z.string().min(1),
  active_profile: z.string().optional(),
  created_at: z.string().optional(),
  schema_version: z.number().int().optional(),
});

export type ScopeConfig = z.infer<typeof ConfigSchema>;

export interface ConfigOptions {
  user?: string;
  scope?: string;
  quiet?: boolean;
}

export async function readConfig(opts: ConfigOptions = {}): Promise<ScopeConfig> {
  const scope = await resolveScope({ user: opts.user, scope: opts.scope });
  const cfgPath = configPath(scope.scopeRoot);
  if (!existsSync(cfgPath)) {
    throw new Error(`no config.json at ${cfgPath} — run \`genmem init\``);
  }
  const raw = await readFile(cfgPath, "utf8");
  return ConfigSchema.parse(JSON.parse(raw));
}

export async function writeConfig(
  cfg: ScopeConfig,
  opts: ConfigOptions = {},
): Promise<string> {
  const scope = await resolveScope({ user: opts.user, scope: opts.scope });
  const cfgPath = configPath(scope.scopeRoot);
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  return cfgPath;
}

export async function configPathCommand(opts: ConfigOptions = {}): Promise<string> {
  const scope = await resolveScope({ user: opts.user, scope: opts.scope });
  return configPath(scope.scopeRoot);
}

export async function configGetCommand(
  key: string,
  opts: ConfigOptions = {},
): Promise<string> {
  const cfg = await readConfig(opts);
  const value = (cfg as Record<string, unknown>)[key];
  if (value === undefined) {
    throw new Error(`unknown config key: ${key}`);
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

export async function configSetCommand(
  key: string,
  value: string,
  opts: ConfigOptions = {},
): Promise<void> {
  const cfg = await readConfig(opts);
  const log = getLogger();
  if (key === "user") {
    cfg.user = value;
  } else if (key === "active_profile") {
    cfg.active_profile = value;
  } else {
    throw new Error(`unknown config key: ${key} (allowed: user, active_profile)`);
  }
  await writeConfig(cfg, opts);
  if (!opts.quiet) log.info(`set ${key} = ${value}`);
}
