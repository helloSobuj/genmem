// User/scope resolution. See plan §6. Single user per OS account in v1.

import { userInfo, homedir } from "node:os";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { join } from "node:path";
import { scopeRootPath } from "./paths.js";

export interface ResolvedScope {
  user: string;
  scopeRoot: string;
  /** Where the resolution came from, for diagnostics. */
  source: "flag" | "env" | "profile" | "config" | "default";
}

const UserConfigSchema = z.object({
  version: z.literal(1),
  user: z.string().min(1),
  active_profile: z.string().optional(),
});

/** Resolve scope from CLI flags, env, and config file. */
export async function resolveScope(
  opts: { user?: string; scope?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedScope> {
  if (opts.user && opts.scope) {
    return {
      user: opts.user,
      scopeRoot: resolve(opts.scope),
      source: "flag",
    };
  }
  if (opts.user) {
    return {
      user: opts.user,
      scopeRoot: scopeRootPath(env),
      source: "flag",
    };
  }
  if (opts.scope) {
    return {
      user: env.GENMEM_USER ?? userInfo().username ?? "default",
      scopeRoot: resolve(opts.scope),
      source: "flag",
    };
  }

  if (env.GENMEM_SCOPE && env.GENMEM_SCOPE.trim().length > 0) {
    return {
      user: env.GENMEM_USER ?? userInfo().username ?? "default",
      scopeRoot: resolve(env.GENMEM_SCOPE),
      source: "env",
    };
  }

  const configFile = join(homedir(), ".genmem", "config.json");
  try {
    const raw = await readFile(configFile, "utf8");
    const parsed = UserConfigSchema.parse(JSON.parse(raw));
    const profile = parsed.active_profile ?? "default";
    const scopeRoot =
      profile === "default"
        ? join(homedir(), ".genmem")
        : join(homedir(), ".genmem", "profiles", profile);
    return {
      user: parsed.user,
      scopeRoot: resolve(scopeRoot),
      source: "config",
    };
  } catch {
    // fall through to default
  }

  return {
    user: userInfo().username ?? "default",
    scopeRoot: scopeRootPath(env),
    source: "default",
  };
}
