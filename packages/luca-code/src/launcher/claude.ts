/**
 * launcher/claude.ts — step 15 (launch Claude Code through the loopback gateway).
 *
 * Ports macaz `internal/launcher/launcher.go`'s `Claude()` + `gatewayArgs` +
 * env overrides + `stopClaudeDaemon` + `restoreTerminalAfterClaude` to
 * TypeScript/Bun.
 *
 * Responsibilities:
 *   - `gatewayArgs(args, models, selected)` — reject user-owned flags
 *     (`--managed-settings`, `--fallback-model`), resolve the `--model` value
 *     (alias keywords -> selected; allowed public id -> kept; unknown ->
 *     selected), then append our own `--managed-settings <json>` carrying the
 *     gateway model selection.
 *   - `buildClaudeEnv(opts)` — build the Claude-only env-override subset (auth,
 *     model pinning, gateway + privacy toggles, profile dir, optional
 *     auto-compact window / always-enable-effort).
 *   - `stopClaudeDaemon(opts)` — best-effort `claude daemon stop --any` with a
 *     bounded timeout and discarded IO.
 *   - `saveTerminalState` / `restoreTerminalAfterClaude` — save stdin raw/TTY
 *     state, restore it, and emit reset escape codes on exit.
 *   - `launchClaude(opts)` — resolve the `claude` exe via `Bun.which`, build
 *     args + env, spawn with inherited stdio, run to completion, defer
 *     terminal restore + daemon stop, and return the mapped exit code.
 *
 * Schema-first per the global rules: Zod schemas own every default; input is
 * validated with `safeParse`; types are inferred with `z.infer`. No defaults
 * are set via destructuring. Functional style only — no classes.
 *
 * Spawn / which / daemon-spawn are injected via optional seams so the module is
 * fully testable without launching a real `claude` binary.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of an injected spawn call. Mirrors the slice of Bun.Subprocess we use. */
export interface SpawnResult {
  /** Synchronous exit code if already available, else `null`. */
  exitCode: number | null;
  /** Promise that resolves with the exit code when the process exits. */
  exited: Promise<number>;
}

/** Injected spawn function. Defaults to a Bun.spawn wrapper. */
export type SpawnFn = (opts: {
  cmd: string[];
  env: Record<string, string>;
  stdin?: "inherit" | "ignore";
  stdout?: "inherit" | "ignore";
  stderr?: "inherit" | "ignore";
}) => SpawnResult;

/** Saved terminal state for restore-on-exit. */
export interface TerminalState {
  /** Whether stdin was a TTY when saved. */
  isTTY: boolean;
  /** Whether stdin was in raw mode when saved. */
  wasRaw: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Model alias keywords the user may pass to `--model` that we resolve to the
 * gateway-selected model. We own concrete model selection; these are the
 * "give me the default" escape hatches.
 */
const MODEL_ALIASES = ["default", "inherit", "sonnet", "opus", "haiku", "fable"] as const;

/** Zod schema for a model alias keyword. */
const ModelAliasSchema = z.enum(MODEL_ALIASES);

/** Flags we own — the user may not pass them. */
const OWNED_FLAGS = ["--managed-settings", "--fallback-model"] as const;

/** Reset escape codes written to stdout on terminal restore. */
const TERM_RESET = [
  "\x1b[?25h", // show cursor
  "\x1b[0m", // reset attributes
  "\x1b[?1049l", // exit alt screen buffer
  "\x1b[?1000l", // disable mouse tracking (X10)
  "\x1b[?1002l", // disable button-event mouse tracking
  "\x1b[?1003l", // disable any-event mouse tracking
  "\x1b[?1006l", // disable SGR mouse mode
  "\x1b[?1015l", // disable urxvt mouse mode
].join("");

// ---------------------------------------------------------------------------
// Exit code mapping
// ---------------------------------------------------------------------------

/**
 * Map a Claude exit code to the launcher's return code.
 *
 * - `130` (SIGINT / Ctrl-C) is a user interrupt, not an error — map to `0`.
 * - `null` (killed by signal without a code) maps to `1`.
 * - All other codes pass through.
 */
export function mapExitCode(code: number | null): number {
  if (code === null) return 1;
  if (code === 130) return 0;
  return code;
}

// ---------------------------------------------------------------------------
// gatewayArgs
// ---------------------------------------------------------------------------

/** True when `args` contains `flag` (as `--flag` or `--flag=...`). */
function hasFlag(args: readonly string[], flag: string): boolean {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a !== undefined && (a === flag || a.startsWith(`${flag}=`))) return true;
  }
  return false;
}

/**
 * True when `token` can serve as the separate-form `--model` value.
 *
 * A missing token (the flag was last) or one starting with `-` is a flag, never
 * a model id: every public id we hand out is `claude-luca-code-*` (PUBLIC_ID_PREFIX),
 * so a leading `-` is unambiguous. Accepting such a token as a value is how
 * `--model --print` silently deleted the user's `--print`, and how a trailing
 * `--model` swallowed our own `--managed-settings` flag.
 */
function isModelValue(token: string | undefined): token is string {
  return token !== undefined && !token.startsWith("-");
}

/**
 * Resolve a user-supplied `--model` value to the concrete model id.
 *
 * - Alias keyword (default/inherit/sonnet/opus/haiku/fable) -> `selected`.
 * - Allowed public model id (present in `models`) -> kept as-is.
 * - Anything else -> `selected` (we own model selection; unknown ids defer).
 */
function resolveModelValue(value: string, models: readonly string[], selected: string): string {
  if (ModelAliasSchema.safeParse(value).success) return selected;
  if (models.includes(value)) return value;
  return selected;
}

/**
 * Rewrite **every** `--model` occurrence in `argv` (mutated in place) so each one
 * carries a resolved, in-catalog model id, and return the effective model.
 *
 * Claude Code parses `--model` last-wins, so resolving only the first occurrence
 * would leave a trailing out-of-catalog id as the one actually requested —
 * contradicting the `--managed-settings` payload we are about to append.
 *
 * Per occurrence:
 *   - joined (`--model=x`, including the empty `--model=`) -> rewritten in place.
 *   - separate with a real value -> the value is overwritten in place.
 *   - separate with no usable value (flag is last, or the next token is a flag)
 *     -> `selected` is **spliced in** right after the flag, so the following
 *     token survives verbatim and `--model` is never left dangling in front of
 *     the `--managed-settings` we append.
 *
 * `argv` must be a copy owned by the caller — the splice must never reach the
 * caller's array.
 */
function resolveModelFlags(argv: string[], models: readonly string[], selected: string): string {
  let effective = selected;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;

    if (a === "--model") {
      const next = argv[i + 1];
      if (isModelValue(next)) {
        effective = resolveModelValue(next, models, selected);
        argv[i + 1] = effective;
      } else {
        effective = selected;
        argv.splice(i + 1, 0, effective);
      }
      i++; // skip the value we just wrote — it is never itself a flag
      continue;
    }

    if (a.startsWith("--model=")) {
      effective = resolveModelValue(a.slice("--model=".length), models, selected);
      argv[i] = `--model=${effective}`;
    }
  }
  return effective;
}

/**
 * Build the final Claude argv for the gateway launch.
 *
 * - Rejects user-owned flags (`--managed-settings`, `--fallback-model`).
 * - Resolves every `--model` value (alias -> selected, allowed id -> kept,
 *   unknown -> selected, missing -> selected spliced in) in place.
 * - Appends `--managed-settings <json>` where json is
 *   `{ model, availableModels, enforceAvailableModels }`.
 *
 * Does not mutate the caller's `args` array.
 */
export function gatewayArgs(
  args: readonly string[],
  models: readonly string[],
  selected: string,
): string[] {
  for (const flag of OWNED_FLAGS) {
    if (hasFlag(args, flag)) {
      throw new Error(
        `gatewayArgs: --managed-settings/--fallback-model are owned by the launcher; do not pass ${flag}`,
      );
    }
  }

  const out = [...args];
  const resolvedModel = resolveModelFlags(out, models, selected);

  const managed = {
    model: resolvedModel,
    availableModels: [...models],
    enforceAvailableModels: true,
  };
  out.push("--managed-settings", JSON.stringify(managed));
  return out;
}

// ---------------------------------------------------------------------------
// buildClaudeEnv
// ---------------------------------------------------------------------------

/** Options schema for `buildClaudeEnv`. All defaults live here. */
export const ClaudeEnvOptsSchema = z.object({
  baseEnv: z.record(z.string(), z.string().optional()).default(() => ({})),
  baseUrl: z.string().min(1),
  authToken: z.string().min(1),
  launchModel: z.string().min(1),
  profileDir: z.string().min(1),
  contextWindow: z.number().int().positive().optional(),
  hasEfforts: z.boolean().default(false),
});

/** Inferred options type — single source of truth. */
export type ClaudeEnvOpts = z.infer<typeof ClaudeEnvOptsSchema>;

/**
 * Build the Claude-only env-override map.
 *
 * Copies string values from `baseEnv` (dropping `undefined`), then applies the
 * gateway overrides:
 *
 *   - ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY (= token)
 *   - ANTHROPIC_MODEL + ANTHROPIC_SMALL_FAST_MODEL + CLAUDE_CODE_AUTO_MODE_MODEL
 *     + CLAUDE_CODE_BG_CLASSIFIER_MODEL + CLAUDE_CODE_SUBAGENT_MODEL (= launchModel)
 *   - CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP=1
 *   - CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK=1
 *   - CLAUDE_CODE_USE_GATEWAY=1
 *   - CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
 *   - DISABLE_ERROR_REPORTING=1 / DISABLE_FEEDBACK_COMMAND=1 / DO_NOT_TRACK=1
 *   - CLAUDE_CONFIG_DIR=profileDir
 *   - CLAUDE_CODE_AUTO_COMPACT_WINDOW (only when contextWindow known)
 *   - CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1 (only when hasEfforts)
 *
 * Gateway overrides always win over `baseEnv` copies.
 */
export function buildClaudeEnv(rawOpts: unknown): Record<string, string> {
  const parsed = ClaudeEnvOptsSchema.safeParse(rawOpts);
  if (!parsed.success) {
    throw new Error(`buildClaudeEnv: invalid options — ${parsed.error.message}`);
  }
  const opts = parsed.data;

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.baseEnv)) {
    if (typeof v === "string") env[k] = v;
  }

  env["ANTHROPIC_BASE_URL"] = opts.baseUrl;
  env["ANTHROPIC_AUTH_TOKEN"] = opts.authToken;
  env["ANTHROPIC_API_KEY"] = opts.authToken;

  env["ANTHROPIC_MODEL"] = opts.launchModel;
  env["ANTHROPIC_SMALL_FAST_MODEL"] = opts.launchModel;
  env["CLAUDE_CODE_AUTO_MODE_MODEL"] = opts.launchModel;
  env["CLAUDE_CODE_BG_CLASSIFIER_MODEL"] = opts.launchModel;
  env["CLAUDE_CODE_SUBAGENT_MODEL"] = opts.launchModel;

  env["CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP"] = "1";
  env["CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK"] = "1";
  env["CLAUDE_CODE_USE_GATEWAY"] = "1";
  env["CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY"] = "1";
  env["DISABLE_ERROR_REPORTING"] = "1";
  env["DISABLE_FEEDBACK_COMMAND"] = "1";
  env["DO_NOT_TRACK"] = "1";

  env["CLAUDE_CONFIG_DIR"] = opts.profileDir;

  if (opts.contextWindow !== undefined) {
    env["CLAUDE_CODE_AUTO_COMPACT_WINDOW"] = String(opts.contextWindow);
  }
  if (opts.hasEfforts) {
    env["CLAUDE_CODE_ALWAYS_ENABLE_EFFORT"] = "1";
  }

  return env;
}

// ---------------------------------------------------------------------------
// Terminal state
// ---------------------------------------------------------------------------

/**
 * Best-effort read of `process.stdin`'s TTY/raw state.
 *
 * Returns `{ isTTY: false, wasRaw: false }` when stdin is not a TTY or the
 * runtime lacks the properties, so callers can always restore unconditionally.
 */
export function saveTerminalState(): TerminalState {
  const stdin = process.stdin as unknown as {
    isTTY?: boolean;
    isRaw?: boolean;
  };
  const isTTY = typeof stdin?.isTTY === "boolean" ? stdin.isTTY : false;
  const wasRaw = isTTY && typeof stdin?.isRaw === "boolean" ? stdin.isRaw : false;
  return { isTTY, wasRaw };
}

/**
 * Best-effort restore of the terminal after Claude exits.
 *
 * Restores stdin raw mode to its saved value (TTY only) and writes reset
 * escape codes to stdout. All errors are swallowed — this is cleanup, not a
 * critical path.
 */
export function restoreTerminalAfterClaude(state: TerminalState): void {
  const stdin = process.stdin as unknown as {
    setRawMode?: (mode: boolean) => void;
  };
  if (state.isTTY && typeof stdin?.setRawMode === "function") {
    try {
      stdin.setRawMode(state.wasRaw);
    } catch {
      // best-effort
    }
  }
  try {
    process.stdout.write(TERM_RESET);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// stopClaudeDaemon
// ---------------------------------------------------------------------------

/** Options schema for `stopClaudeDaemon`. */
export const StopDaemonOptsSchema = z.object({
  claudePath: z.string().min(1).nullable().optional(),
  env: z.record(z.string(), z.string()).default(() => ({})),
  timeoutMs: z.number().int().positive().default(5000),
  spawn: z.custom<SpawnFn>().optional(),
});

/** Inferred options type — single source of truth. */
export type StopDaemonOpts = z.infer<typeof StopDaemonOptsSchema>;

/** Race a promise against a timeout; resolves to `undefined` on timeout. */
async function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    let done = false;
    const settle = (v: T | undefined) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    p.then((v) => settle(v)).catch(() => settle(undefined));
    setTimeout(() => settle(undefined), timeoutMs);
  });
}

/** Default spawn implementation wrapping Bun.spawn. */
function defaultSpawn(opts: {
  cmd: string[];
  env: Record<string, string>;
  stdin?: "inherit" | "ignore";
  stdout?: "inherit" | "ignore";
  stderr?: "inherit" | "ignore";
}): SpawnResult {
  const proc = Bun.spawn({
    cmd: opts.cmd,
    env: opts.env,
    stdin: opts.stdin ?? "ignore",
    stdout: opts.stdout ?? "ignore",
    stderr: opts.stderr ?? "ignore",
  });
  const exited = (async () => {
    const code = await proc.exited;
    return code;
  })();
  return { exitCode: proc.exitCode ?? null, exited };
}

/**
 * Best-effort `claude daemon stop --any`.
 *
 * Spawns `<claudePath> daemon stop --any` with the given env, discarded IO, and
 * a bounded timeout (default 5s). Never throws — daemon cleanup must not
 * surface errors to the launcher's exit path. No-op when `claudePath` is null.
 */
export async function stopClaudeDaemon(rawOpts: unknown = {}): Promise<void> {
  const parsed = StopDaemonOptsSchema.safeParse(rawOpts);
  if (!parsed.success) return;
  const opts = parsed.data;

  const exe = opts.claudePath;
  if (!exe) return;

  const spawnFn = opts.spawn ?? defaultSpawn;
  try {
    const proc = spawnFn({
      cmd: [exe, "daemon", "stop", "--any"],
      env: opts.env,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    await withTimeout(proc.exited, opts.timeoutMs);
  } catch {
    // best-effort — swallow
  }
}

// ---------------------------------------------------------------------------
// launchClaude
// ---------------------------------------------------------------------------

/** Options schema for `launchClaude`. All defaults live here. */
export const LaunchClaudeOptsSchema = z.object({
  args: z.array(z.string()).default([]),
  models: z.array(z.string()).default([]),
  selectedModel: z.string().min(1),
  launchModel: z.string().min(1),
  baseUrl: z.string().min(1),
  authToken: z.string().min(1),
  profileDir: z.string().min(1),
  baseEnv: z.record(z.string(), z.string().optional()).default(() => ({ ...Bun.env })),
  contextWindow: z.number().int().positive().optional(),
  hasEfforts: z.boolean().default(false),
  /** Resolved claude exe path. If omitted, `which` is consulted. */
  claudePath: z.string().min(1).nullable().optional(),
  /** Injection seam for `Bun.which`. Defaults to `() => Bun.which("claude")`. */
  which: z.custom<() => string | null>().optional(),
  /** Injection seam for the main spawn. Defaults to a Bun.spawn wrapper. */
  spawn: z.custom<SpawnFn>().optional(),
  /** Injection seam for the daemon-stop spawn. */
  daemonSpawn: z.custom<SpawnFn>().optional(),
  /** Daemon stop timeout in ms. */
  daemonTimeoutMs: z.number().int().positive().default(5000),
  /** Whether to run the deferred daemon stop + terminal restore. */
  cleanup: z.boolean().default(true),
});

/** Inferred options type — single source of truth. */
export type LaunchClaudeOpts = z.infer<typeof LaunchClaudeOptsSchema>;

/**
 * Launch Claude Code through the loopback gateway and run it to completion.
 *
 * Flow:
 *   1. Resolve the `claude` exe (explicit `claudePath` → `which()` →
 *      `Bun.which("claude")`). Returns `127` when not found.
 *   2. Build the final argv via `gatewayArgs`.
 *   3. Build the env map via `buildClaudeEnv`.
 *   4. Save the terminal state.
 *   5. Spawn claude with inherited stdio, await its exit.
 *   6. Defer: restore the terminal and run `stopClaudeDaemon`.
 *   7. Return the mapped exit code (`mapExitCode`).
 *
 * Spawn / which / daemonSpawn are injected via optional seams so the module is
 * testable without a real `claude` binary.
 */
export async function launchClaude(rawOpts: unknown): Promise<number> {
  const parsed = LaunchClaudeOptsSchema.safeParse(rawOpts);
  if (!parsed.success) {
    throw new Error(`launchClaude: invalid options — ${parsed.error.message}`);
  }
  const opts = parsed.data;

  const which = opts.which ?? (() => (typeof Bun !== "undefined" ? Bun.which("claude") : null));
  const claudePath = opts.claudePath ?? which();
  if (!claudePath) return 127;

  const finalArgs = gatewayArgs(opts.args, opts.models, opts.selectedModel);
  const env = buildClaudeEnv({
    baseEnv: opts.baseEnv,
    baseUrl: opts.baseUrl,
    authToken: opts.authToken,
    launchModel: opts.launchModel,
    profileDir: opts.profileDir,
    contextWindow: opts.contextWindow,
    hasEfforts: opts.hasEfforts,
  });

  const spawnFn = opts.spawn ?? defaultSpawn;
  const termState = saveTerminalState();

  let code: number | null = null;
  try {
    const proc = spawnFn({
      cmd: [claudePath, ...finalArgs],
      env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    code = await proc.exited;
  } finally {
    if (opts.cleanup) {
      restoreTerminalAfterClaude(termState);
      await stopClaudeDaemon({
        claudePath,
        env,
        timeoutMs: opts.daemonTimeoutMs,
        spawn: opts.daemonSpawn,
      });
    }
  }

  return mapExitCode(code);
}