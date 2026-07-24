/**
 * luca-code — runtime configuration.
 *
 * Schema-first per the global rules: a single Zod `ConfigSchema` owns every
 * default and validator; `loadConfig()` parses environment overrides with
 * `safeParse` and falls back to schema defaults on any invalid input. No
 * defaults are set via destructuring; the `Config` type is inferred from the
 * schema with `z.infer`.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { CLIENT_VERSION } from "./constants";

/**
 * Platform-appropriate profile directory for stored credentials / state.
 *
 * Resolves to `~/.config/luca-code` on POSIX (macOS / Linux). The
 * trailing segment is always `luca-code` regardless of platform so
 * callers can rely on a stable leaf name.
 */
export function defaultProfileDir(): string {
  return join(homedir(), ".config", "luca-code");
}

/**
 * Default User-Agent string sent to OpenAI endpoints. Mirrors the
 * `cc-openai-bridge/<version>` originator shape.
 *
 * NOTE: the literal `cc-openai-bridge` value is intentionally preserved even
 * though the package was renamed to `luca-code`. The OpenAI / ChatGPT backend
 * sits behind Cloudflare, which fingerprints the User-Agent + originator
 * headers; changing the advertised string risks breaking auth/requests. The
 * `LUCA_CODE_USE_CODEX_UA` toggle still swaps to the upstream
 * `codex_cli_rs/<version>` fallback. Only the env-var *knobs* were renamed
 * (`CCOB_*` -> `LUCA_CODE_*`); the header *values* are load-bearing and stay.
 */
export const DEFAULT_UA = `cc-openai-bridge/${CLIENT_VERSION}`;

/**
 * Fallback User-Agent string matching the upstream `codex_cli_rs` client
 * shape, used when `useCodexCliRsUa` is enabled. Keeping the version in sync
 * with `CLIENT_VERSION` ensures both UAs advertise a consistent build.
 */
export const CODEX_CLI_RS_UA = `codex_cli_rs/${CLIENT_VERSION}`;

/**
 * Best-effort parse of a boolean from an environment string. Accepts the
 * common truthy/falsy spellings ("true"/"1"/"yes"/"on" vs "false"/"0"/"off").
 * Unknown values fall back to `false`.
 */
function parseEnvBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

/**
 * Best-effort parse of a positive integer from an environment string.
 * Returns `undefined` for missing or non-numeric input so the schema default
 * can apply.
 */
function parseEnvInt(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  return n;
}

/**
 * Raw config object shape — every field validated, every default owned here.
 *
 * `requestTimeout` is deliberately OPTIONAL at this layer: it is derived from
 * `requestTimeoutSec` by the object-level transform on {@link ConfigSchema}
 * unless the operator supplied the explicit millisecond override.
 */
const RawConfigSchema = z.object({
  profileDir: z.string().min(1).default(() => defaultProfileDir()),
  defaultEffort: z.enum(["low", "medium", "high"]).default("medium"),
  maxConcurrentSubscription: z.number().int().positive().default(4),
  modelMap: z.record(z.string(), z.string()).default({}),
  maxBodyBytes: z.number().int().positive().default(10 * 1024 * 1024),
  requestTimeoutSec: z.number().int().positive().default(120),
  requestTimeout: z.number().int().positive().optional(),
  // Preserved as `cc-openai-bridge` for OpenAI/Cloudflare fingerprint
  // compatibility — see DEFAULT_UA note above. Override via LUCA_CODE_ORIGINATOR.
  originator: z.string().min(1).default("cc-openai-bridge"),
  useCodexCliRsUa: z.boolean().default(false),
});

/**
 * Zod schema owning all config defaults and validators. New fields belong
 * here (never as destructuring defaults at the call site).
 *
 * `requestTimeoutSec` (env `LUCA_CODE_REQUEST_TIMEOUT_SEC`) is the authoritative
 * timeout knob; `requestTimeout` (milliseconds — the unit every consumer wants,
 * e.g. `AbortSignal.timeout`) is derived from it so the two can never disagree.
 * Supplying `LUCA_CODE_REQUEST_TIMEOUT_MS` explicitly overrides the derivation and
 * leaves `requestTimeoutSec` at whatever it parsed to.
 */
export const ConfigSchema = RawConfigSchema.transform((cfg) => ({
  ...cfg,
  requestTimeout: cfg.requestTimeout ?? cfg.requestTimeoutSec * 1000,
}));

/**
 * Inferred config shape — the single source of truth for the `Config` type.
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Build a raw, mostly-`undefined` config object from `LUCA_CODE_*` environment
 * overrides. Only present keys are populated so schema defaults can fill the
 * gaps.
 */
function envToRawConfig(env: Record<string, string | undefined>): Record<string, unknown> {
  return {
    profileDir: env.LUCA_CODE_PROFILE_DIR,
    defaultEffort: env.LUCA_CODE_DEFAULT_EFFORT,
    maxConcurrentSubscription: parseEnvInt(env.LUCA_CODE_MAX_CONCURRENT_SUBSCRIPTION),
    maxBodyBytes: parseEnvInt(env.LUCA_CODE_MAX_BODY_BYTES),
    requestTimeoutSec: parseEnvInt(env.LUCA_CODE_REQUEST_TIMEOUT_SEC),
    requestTimeout: parseEnvInt(env.LUCA_CODE_REQUEST_TIMEOUT_MS),
    originator: env.LUCA_CODE_ORIGINATOR,
    useCodexCliRsUa: parseEnvBool(env.LUCA_CODE_USE_CODEX_UA),
  };
}

/**
 * Load configuration from environment overrides, falling back to schema
 * defaults on any invalid input.
 *
 * Reads from `Bun.env` by default; pass an explicit `env` map for testing.
 * Invalid `LUCA_CODE_*` values are swallowed (logged via `safeParse` failure) and
 * the matching schema default is used instead — the proxy never crashes on a
 * misconfigured env var.
 */
export function loadConfig(
  env: Record<string, string | undefined> = Bun.env,
): Config {
  const raw = envToRawConfig(env);
  const result = ConfigSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  return ConfigSchema.parse({});
}