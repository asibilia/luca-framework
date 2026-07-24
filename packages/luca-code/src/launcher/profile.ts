/**
 * launcher/profile.ts — step 14 (launcher profile preparation).
 *
 * Ports macaz `internal/launcher/launcher.go`'s `prepareClaudeProfile`,
 * `configureGatewayModels`, and `shareClaudeAsset` to TypeScript/Bun.
 *
 * The profile directory is a sandboxed Claude Code config tree that points at
 * the loopback gateway. We build it under `<configDir>/luca-code/profile/`
 * (mode 0o700), seed it from the user's `~/.claude` source tree, scrub any
 * gateway-related settings/env keys the source may carry, and then write the
 * gateway model selection back in atomically.
 *
 * Schema-first per the global rules: `PrepareOptsSchema` owns every default;
 * `safeParse` is used for input validation; types are inferred with `z.infer`.
 * Functional style only — no classes.
 */

import { homedir } from "node:os";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Leaf segment of the profile directory inside the config dir. */
const PROFILE_LEAF = join("luca-code", "profile");

/** Assets shared (symlinked) from the source `.claude` tree into the profile. */
const SHARED_ASSETS = ["agents", "commands", "skills", "plugins", "CLAUDE.md"];

/**
 * Filename of Claude Code's main state file. When `CLAUDE_CONFIG_DIR` is set
 * the state file lives INSIDE the config dir (`<configDir>/.claude.json`); in
 * the default layout it is the legacy `~/.claude.json` SIBLING of the `~/.claude`
 * assets dir. {@link readSourceMcpServers} checks both locations.
 */
const CLAUDE_STATE_FILE = ".claude.json";

/** Settings keys that drive gateway model selection — scrubbed before re-write. */
const GATEWAY_SETTING_KEYS = [
  "availableModels",
  "enforceAvailableModels",
  "modelOverrides",
  "fallbackModel",
  "fallbackModels",
];

/** Env keys scrubbed from settings.env on every prepare. */
const CLAUDE_CODE_USE_GATEWAY = "CLAUDE_CODE_USE_GATEWAY";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Options for `prepareClaudeProfile`. All defaults live here — never set via
 * destructuring at the call site.
 */
export const PrepareOptsSchema = z.object({
  /** Provider id being activated (e.g. "openai", "anthropic"). Drives change detection. */
  provider: z.string().min(1),
  /** Model id to pin as `settings.model`. */
  selectedModel: z.string().min(1),
  /** Models to advertise as `settings.availableModels`. Defaults to `[]`. */
  allowedModels: z.array(z.string()).default([]),
  /**
   * Base config directory. Defaults to `CLAUDE_CONFIG_DIR` env var or `~/.claude`.
   * The profile tree is built at `<configDir>/luca-code/profile/`.
   */
  configDir: z.string().min(1).optional(),
  /** Environment map used for `CLAUDE_CONFIG_DIR` resolution. Defaults to Bun.env. */
  env: z.record(z.string(), z.string().optional()).default(() => ({ ...Bun.env })),
});

/** Inferred options type — single source of truth. */
export type PrepareOpts = z.infer<typeof PrepareOptsSchema>;

/** Result of `prepareClaudeProfile`. */
export interface PrepareResult {
  /** Absolute path to the prepared profile directory. */
  profileDir: string;
  /** The model id that was written to `settings.model`. */
  selectedModel: string;
}

/** Result of `shareClaudeAsset`. */
export interface ShareResult {
  /** "symlink" | "copy" | "none" (source missing). */
  method: "symlink" | "copy" | "none";
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the base config directory.
 *
 * Priority: explicit `configDir` option → `CLAUDE_CONFIG_DIR` env → `~/.claude`.
 */
function resolveConfigDir(opts: PrepareOpts): string {
  if (opts.configDir && opts.configDir.length > 0) return opts.configDir;
  const fromEnv = opts.env["CLAUDE_CONFIG_DIR"];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return join(homedir(), ".claude");
}

/**
 * Resolve the source `.claude` tree to share assets from.
 *
 * The source must NOT equal the profileDir (would self-reference). When
 * `CLAUDE_CONFIG_DIR` points at the profile tree itself, fall back to
 * `~/.claude`.
 */
function resolveSourceDir(configDir: string, profileDir: string): string {
  if (configDir === profileDir) return join(homedir(), ".claude");
  return configDir;
}

// ---------------------------------------------------------------------------
// JSON I/O (atomic, 0o600)
// ---------------------------------------------------------------------------

/**
 * Atomically write a JSON file with mode 0o600.
 *
 * Writes to a temp path in the same directory, then renames over the target.
 * The same-directory temp guarantees the rename is atomic on POSIX.
 */
function writePrivateJSON(path: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const tmp = `${path}.tmp-${crypto.randomUUID()}`;
  writeFileSync(tmp, json, { mode: 0o600 });
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// Settings load / scrub / configure
// ---------------------------------------------------------------------------

/** Best-effort JSON object read; returns `{}` for missing/invalid files. */
function readSettingsObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // swallow — fall through to empty settings
  }
  return {};
}

/**
 * Load Claude settings, preferring the profile's `settings.json` over the
 * source tree's. Returns a fresh mutable object.
 */
function loadClaudeSettings(profileDir: string, sourceDir: string): Record<string, unknown> {
  const profileSettings = join(profileDir, "settings.json");
  if (existsSync(profileSettings)) return readSettingsObject(profileSettings);
  return readSettingsObject(join(sourceDir, "settings.json"));
}

/**
 * Determine whether an env key should be scrubbed.
 *
 * Matches `ANTHROPIC_*`, `luca_code_*` (case-insensitive), and the exact
 * `CLAUDE_CODE_USE_GATEWAY` key.
 */
function shouldScrubEnvKey(key: string): boolean {
  if (key === CLAUDE_CODE_USE_GATEWAY) return true;
  if (/^ANTHROPIC_/i.test(key)) return true;
  if (/^luca_code_/i.test(key)) return true;
  return false;
}

/**
 * Scrub gateway-related settings in place.
 *
 * Deletes `availableModels`, `enforceAvailableModels`, `modelOverrides`, and
 * any `fallback*` keys, and removes `ANTHROPIC_*` / `luca_code_*` /
 * `CLAUDE_CODE_USE_GATEWAY` keys from `settings.env`.
 */
export function scrubGatewaySettings(settings: Record<string, unknown>): void {
  for (const key of GATEWAY_SETTING_KEYS) {
    delete settings[key];
  }
  // Also scrub any fallback* keys not enumerated above.
  for (const key of Object.keys(settings)) {
    if (key.toLowerCase().startsWith("fallback")) delete settings[key];
  }
  const envVal = settings["env"];
  if (envVal && typeof envVal === "object" && !Array.isArray(envVal)) {
    const env = envVal as Record<string, unknown>;
    for (const key of Object.keys(env)) {
      if (shouldScrubEnvKey(key)) delete env[key];
    }
  }
}

/**
 * Configure gateway model selection on a settings object in place.
 *
 * Sets `settings.model = selectedModel`, `settings.availableModels = allowed`,
 * and `settings.enforceAvailableModels = true`. Returns the same settings
 * object for chaining.
 */
export function configureGatewayModels(
  settings: Record<string, unknown>,
  selectedModel: string,
  allowed: string[],
): Record<string, unknown> {
  settings["model"] = selectedModel;
  settings["availableModels"] = allowed;
  settings["enforceAvailableModels"] = true;
  return settings;
}

// ---------------------------------------------------------------------------
// Provider marker
// ---------------------------------------------------------------------------

/** Read the previously-activated provider id, or `null` if none. */
function readProfileProvider(profileDir: string): string | null {
  const markerPath = join(profileDir, "provider.json");
  if (!existsSync(markerPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf-8"));
    if (parsed && typeof parsed === "object") {
      const provider = (parsed as Record<string, unknown>)["provider"];
      if (typeof provider === "string" && provider.length > 0) return provider;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Write the provider marker atomically. */
function writeProfileProvider(profileDir: string, provider: string): void {
  writePrivateJSON(join(profileDir, "provider.json"), {
    provider,
    createdAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Cache cleanup
// ---------------------------------------------------------------------------

/** Path to the gateway-models cache file inside the profile. */
function gatewayModelsCachePath(profileDir: string): string {
  return join(profileDir, "cache", "gateway-models.json");
}

/** Remove the gateway-models cache file (no-op if absent). */
function removeGatewayModelsCache(profileDir: string): void {
  rmSync(gatewayModelsCachePath(profileDir), { force: true });
}

// ---------------------------------------------------------------------------
// Asset sharing (symlink preferred, copy fallback)
// ---------------------------------------------------------------------------

/** Recursively copy a directory, applying 0o600 to each file. */
function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcEntry = join(src, entry.name);
    const destEntry = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcEntry, destEntry);
    } else {
      // copyFileSync follows symlinks (copies the target's content). For a
      // dangling symlink it throws, which we swallow to keep the copy robust.
      try {
        copyFileSync(srcEntry, destEntry);
        chmodSync(destEntry, 0o600);
      } catch {
        // skip unreadable / dangling entries
      }
    }
  }
}

/**
 * Share a single asset (directory or file) from `source` into `target`.
 *
 * Symlink is preferred (zero-copy, stays in sync with the source tree). On
 * symlink failure — or when `forceCopy` is set — falls back to a recursive
 * copy with file mode 0o600. Any pre-existing target is removed first.
 *
 * Returns the method used: "symlink" | "copy" | "none" (source missing).
 */
export function shareClaudeAsset(
  source: string,
  target: string,
  opts: { forceCopy?: boolean } = {},
): ShareResult {
  // Detect a pre-existing target (including a dangling symlink, which
  // existsSync misses) and clear it before sharing.
  let targetExists = false;
  try {
    lstatSync(target);
    targetExists = true;
  } catch {
    targetExists = false;
  }
  if (targetExists) {
    rmSync(target, { recursive: true, force: true });
  }
  if (opts.forceCopy !== true) {
    try {
      symlinkSync(source, target);
      return { method: "symlink" };
    } catch {
      // fall through to copy
    }
  }
  if (!existsSync(source)) {
    return { method: "none" };
  }
  const stat = lstatSync(source);
  if (stat.isDirectory()) {
    copyDirSync(source, target);
  } else {
    copyFileSync(source, target);
    chmodSync(target, 0o600);
  }
  return { method: "copy" };
}

// ---------------------------------------------------------------------------
// MCP server seeding
// ---------------------------------------------------------------------------

/**
 * Read the user's MCP server config from the source Claude state file(s).
 *
 * Claude Code stores MCP servers in its main state file under two keys:
 *   - top-level `mcpServers` — user-scoped servers available in every project
 *   - `projects[<path>].mcpServers` — project-scoped servers
 *
 * The state file lives at `<configDir>/.claude.json` when `CLAUDE_CONFIG_DIR`
 * is set, but in the default layout it is the legacy `~/.claude.json` SIBLING
 * of the `~/.claude` assets dir. Check both so the user's configured servers
 * are found regardless of layout, merging maps from every candidate that
 * exists (a user may have servers in either or both).
 *
 * Returns `{ global, projects }` where `global` is the merged top-level
 * mcpServers map and `projects` maps each project path to its merged mcpServers
 * map. Empty maps when no source state file carries MCP config.
 */
function readSourceMcpServers(sourceDir: string): {
  global: Record<string, unknown>;
  projects: Record<string, Record<string, unknown>>;
} {
  const global: Record<string, unknown> = {};
  const projects: Record<string, Record<string, unknown>> = {};
  const candidates = [
    join(sourceDir, CLAUDE_STATE_FILE),
    join(dirname(sourceDir), CLAUDE_STATE_FILE),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const state = readSettingsObject(path);
    const g = state["mcpServers"];
    if (g && typeof g === "object" && !Array.isArray(g)) {
      Object.assign(global, g as Record<string, unknown>);
    }
    const p = state["projects"];
    if (p && typeof p === "object" && !Array.isArray(p)) {
      for (const [projPath, projVal] of Object.entries(p as Record<string, unknown>)) {
        if (!projVal || typeof projVal !== "object" || Array.isArray(projVal)) continue;
        const mcp = (projVal as Record<string, unknown>)["mcpServers"];
        if (mcp && typeof mcp === "object" && !Array.isArray(mcp)) {
          const bucket = projects[projPath] ?? (projects[projPath] = {});
          Object.assign(bucket, mcp as Record<string, unknown>);
        }
      }
    }
  }
  return { global, projects };
}

/**
 * Seed the user's MCP server config into the profile's `.claude.json`.
 *
 * The profile is a fresh sandbox: Claude Code does NOT inherit the user's
 * `mcpServers` when `CLAUDE_CONFIG_DIR` is redirected to the profile, so
 * without this step a bridge session sees zero MCP servers. The source state
 * file is treated as authoritative for MCP — each prepare mirrors its
 * `mcpServers` (top-level and per-project) into the profile state file,
 * overwriting any previously seeded servers so removals in the user's real
 * config propagate. Non-MCP profile state (numStartups, userID, onboarding
 * flags, …) is preserved.
 *
 * No-op when the source carries no MCP config.
 */
function seedMcpServers(sourceDir: string, profileDir: string): void {
  const { global, projects } = readSourceMcpServers(sourceDir);
  if (Object.keys(global).length === 0 && Object.keys(projects).length === 0) return;

  const profileStatePath = join(profileDir, CLAUDE_STATE_FILE);
  const state = readSettingsObject(profileStatePath);

  if (Object.keys(global).length > 0) {
    state["mcpServers"] = { ...global };
  }
  if (Object.keys(projects).length > 0) {
    const existingProjects =
      (state["projects"] as Record<string, unknown> | undefined) ?? {};
    state["projects"] = existingProjects;
    for (const [projPath, servers] of Object.entries(projects)) {
      const proj =
        (existingProjects[projPath] as Record<string, unknown> | undefined) ?? {};
      existingProjects[projPath] = proj;
      proj["mcpServers"] = { ...servers };
    }
  }

  writePrivateJSON(profileStatePath, state);
}

// ---------------------------------------------------------------------------
// prepareClaudeProfile
// ---------------------------------------------------------------------------

/**
 * Prepare (or refresh) the Claude Code profile directory for the loopback
 * gateway.
 *
 * Flow:
 *  1. Resolve config/source/profile dirs.
 *  2. `mkdir -p profileDir` (0o700).
 *  3. Load settings (profile `settings.json` else source `settings.json`).
 *  4. Scrub gateway settings + env keys.
 *  5. On provider change: delete `settings.model` + remove the
 *     `cache/gateway-models.json` cache.
 *  6. Configure gateway model selection (`model`/`availableModels`/
 *     `enforceAvailableModels`).
 *  7. Atomically write `settings.json` (0o600).
 *  8. Symlink `agents`/`commands`/`skills`/`plugins`/`CLAUDE.md` from source.
 *  9. Seed the user's MCP server config into the profile `.claude.json`
 *     (Claude Code does not inherit `mcpServers` across a `CLAUDE_CONFIG_DIR`
 *     redirect; without this the bridge session sees no MCP servers).
 * 10. Write the provider marker.
 *
 * Returns `{ profileDir, selectedModel }`.
 */
export function prepareClaudeProfile(rawOpts: unknown): PrepareResult {
  const parsed = PrepareOptsSchema.safeParse(rawOpts);
  if (!parsed.success) {
    throw new Error(
      `prepareClaudeProfile: invalid options — ${parsed.error.message}`,
    );
  }
  const opts = parsed.data;

  const configDir = resolveConfigDir(opts);
  const profileDir = join(configDir, PROFILE_LEAF);
  const sourceDir = resolveSourceDir(configDir, profileDir);

  // 2. mkdir 0o700.
  mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  chmodSync(profileDir, 0o700);

  // 3. Load settings.
  const settings = loadClaudeSettings(profileDir, sourceDir);

  // 4. Scrub gateway settings + env keys.
  scrubGatewaySettings(settings);

  // 5. Provider change detection.
  const previousProvider = readProfileProvider(profileDir);
  const providerChanged = previousProvider !== null && previousProvider !== opts.provider;
  if (providerChanged) {
    delete settings["model"];
    removeGatewayModelsCache(profileDir);
  }

  // 6. Configure gateway models.
  configureGatewayModels(settings, opts.selectedModel, opts.allowedModels);

  // 7. Write settings.json atomically.
  writePrivateJSON(join(profileDir, "settings.json"), settings);

  // 8. Share assets from the source tree.
  for (const name of SHARED_ASSETS) {
    shareClaudeAsset(join(sourceDir, name), join(profileDir, name));
  }

  // 9. Seed MCP server config from the user's real state file.
  seedMcpServers(sourceDir, profileDir);

  // 10. Write provider marker.
  writeProfileProvider(profileDir, opts.provider);

  return { profileDir, selectedModel: opts.selectedModel };
}