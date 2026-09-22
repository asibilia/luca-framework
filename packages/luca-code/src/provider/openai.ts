/**
 * provider/openai.ts — Step 11 OpenAI ChatGPT subscription provider.
 *
 * Ports macaz `internal/provider/openai/openai.go` Generate +
 * sendResponsesWithRetry + acquireGenerate + authorize + sanitizeSubscription.
 *
 * The provider translates an Anthropic Messages request into an OpenAI
 * Responses body (via ToResponses), forces the subscription-safe shape
 * (store:false, stream:true, parallel_tool_calls:false, no user /
 * max_output_tokens / truncation / previous_response_id), POSTs it to the
 * ChatGPT codex Responses endpoint as text/event-stream, and pipes the
 * returned SSE stream through the collector. On 401 it force-refreshes the
 * credential and retries (max 3); on 429 / 5xx it backs off using
 * `retry-after-ms` / `Retry-After` / exponential (capped 30s) and retries.
 *
 * `countTokens` estimates locally — the ChatGPT subscription has no count
 * endpoint.
 *
 * Functional style throughout (closures/factories, no classes), schema-first
 * where parsing raw input, Bun-native (no node:http / express / dotenv).
 * HTTP + forceRefresh are injectable via the optional `deps` argument so the
 * suite never touches the network.
 */

import { z } from "zod";

import type { Credential } from "../auth/credentials";
import { forceRefresh as defaultForceRefresh } from "../auth/openai-subscription";
import type { ForceRefreshOptions } from "../auth/openai-subscription";
import { appendFileSync, chmodSync, lstatSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { CLIENT_VERSION, RESPONSES_ENDPOINT } from "../constants";
import { CODEX_CLI_RS_UA, ConfigSchema, DEFAULT_UA, defaultProfileDir } from "../config";
import type { Config } from "../config";
import { EstimateInputTokens } from "../effort";
import { createCollector } from "../protocol/collector";
import { readSSE } from "../sse";
import { ToResponses } from "../protocol/to-responses";
import type { ResponsesBody } from "../protocol/to-responses";
import type { EmitFunc, Event, Request, Result } from "../protocol/types";
import type { EffortBucket } from "../protocol/to-responses";

/* -------------------------------------------------------------------------- */
/* HTTPError — functional factory (no classes)                                */
/* -------------------------------------------------------------------------- */

/**
 * A normalised HTTP error: an Error carrying the upstream status, a short
 * type slug, the response body (best-effort), and an optional `retryAfter`
 * (milliseconds) hint.
 */
export interface HTTPError extends Error {
  status: number;
  type: string;
  body?: string;
  retryAfter?: number;
}

/**
 * Build an {@link HTTPError} (an Error augmented with http fields). Functional
 * factory — no class. The returned object is a real `Error` (carries a stack)
 * but is created via `Object.assign`, not `new`.
 */
export function httpError(
  status: number,
  type: string,
  message: string,
  body?: string,
  retryAfter?: number,
): HTTPError {
  const err = Object.assign(new Error(message), {
    status,
    type,
    body,
    retryAfter,
  }) as HTTPError;
  return err;
}

/** True when `x` is an {@link HTTPError}. */
export function isHTTPError(x: unknown): x is HTTPError {
  return x instanceof Error && typeof (x as Partial<HTTPError>).status === "number";
}

/* -------------------------------------------------------------------------- */
/* LUCA_CODE_DEBUG — env-gated file dump (no-op when unset)                          */
/* -------------------------------------------------------------------------- */

/** Mode for the debug directory: owner-only traversal. */
const DEBUG_DIR_MODE = 0o700;
/** Mode for the debug log file: owner-only read/write. */
const DEBUG_FILE_MODE = 0o600;

/**
 * Debug settings, schema-first. Every default (including the 1 MiB size cap and
 * the redact-by-default posture) lives here rather than at a call site.
 */
const DebugConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** When true, message content is written verbatim (opt-in only). */
  sensitive: z.boolean().default(false),
  /** Hard cap on the log file size; the file is rotated to stay under it. */
  maxBytes: z.number().int().positive().default(1024 * 1024),
  file: z
    .string()
    .min(1)
    .default(() => join(homedir(), ".config", "luca-code", "luca-code-debug.log")),
});

type DebugConfig = z.infer<typeof DebugConfigSchema>;

/** Read the process env through Bun (which mirrors `process.env`). */
function debugEnv(): Record<string, string | undefined> {
  return (globalThis as { Bun?: { env?: Record<string, string | undefined> } }).Bun?.env ?? {};
}

/** True for the common truthy env spellings. */
function envTruthy(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/**
 * Resolve the debug configuration from the environment. Read per call (rather
 * than cached at import) so the env can change between requests / tests.
 */
function debugConfig(): DebugConfig {
  const env = debugEnv();
  const maxRaw = Number(env.LUCA_CODE_DEBUG_MAX_BYTES);
  const parsed = DebugConfigSchema.safeParse({
    enabled: envTruthy(env.LUCA_CODE_DEBUG),
    sensitive: envTruthy(env.LUCA_CODE_DEBUG_SENSITIVE),
    maxBytes:
      env.LUCA_CODE_DEBUG_MAX_BYTES !== undefined && Number.isInteger(maxRaw) && maxRaw > 0
        ? maxRaw
        : undefined,
    file: env.LUCA_CODE_DEBUG_FILE !== undefined && env.LUCA_CODE_DEBUG_FILE.length > 0 ? env.LUCA_CODE_DEBUG_FILE : undefined,
  });
  return parsed.success ? parsed.data : DebugConfigSchema.parse({});
}

/** True when LUCA_CODE_DEBUG is set to a truthy value. */
function debugEnabled(): boolean {
  return debugConfig().enabled;
}

/** True when `p` exists and is a symbolic link. */
function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    // Missing path — nothing to follow.
    return false;
  }
}

/**
 * Remove credential-shaped values from anything bound for the log. Applied
 * unconditionally — even in `LUCA_CODE_DEBUG_SENSITIVE` mode a bearer token, refresh
 * token or `sk-` key must never be written to disk.
 */
function scrubSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(
      /("(?:authorization|access|refresh|access_token|refresh_token|id_token|api[_-]?key)"\s*:\s*)"[^"]*"/gi,
      '$1"[redacted]"',
    );
}

/**
 * Append a labelled block to the debug log, enforcing the security posture:
 *
 *   - the parent directory is created at (and forced to) 0o700;
 *   - the log file is created at (and forced to) 0o600, so a pre-existing
 *     loose-mode file is tightened rather than reused as-is;
 *   - a symlinked directory or log path is REFUSED — never followed, so the
 *     link target is left untouched;
 *   - the post-write size never exceeds `LUCA_CODE_DEBUG_MAX_BYTES` (the log is
 *     rotated, not grown unbounded);
 *   - credential-shaped values are scrubbed from every payload.
 *
 * Writes are FILE-ONLY: emitting to stderr/stdout would corrupt the Anthropic
 * SSE stream Claude Code is reading. Every failure is swallowed so debug
 * logging can never break a real request.
 */
function debugDump(label: string, payload: string): void {
  const cfg = debugConfig();
  if (!cfg.enabled) return;
  const bar = "=".repeat(Math.max(20, label.length));
  const block = `\n${bar}\nLUCA_CODE_DEBUG ${label}\n${bar}\n${scrubSecrets(payload)}\n${bar}\n`;
  try {
    const fp = cfg.file;
    const dir = dirname(fp);
    if (isSymlink(dir) || isSymlink(fp)) return;

    mkdirSync(dir, { recursive: true, mode: DEBUG_DIR_MODE });
    chmodSync(dir, DEBUG_DIR_MODE);

    const bytes = Buffer.from(block, "utf8");
    // A single block larger than the cap is truncated to its tail (the most
    // recent context is the useful part).
    const payloadBytes =
      bytes.byteLength > cfg.maxBytes ? bytes.subarray(bytes.byteLength - cfg.maxBytes) : bytes;

    let existing = 0;
    try {
      existing = statSync(fp).size;
    } catch {
      existing = 0;
    }

    if (existing + payloadBytes.byteLength > cfg.maxBytes) {
      // Rotate: writeFileSync truncates, so the cap holds after the write.
      writeFileSync(fp, payloadBytes, { mode: DEBUG_FILE_MODE });
    } else {
      appendFileSync(fp, payloadBytes, { mode: DEBUG_FILE_MODE });
    }
    // `mode` only applies at CREATION, so tighten explicitly every time.
    chmodSync(fp, DEBUG_FILE_MODE);
  } catch {
    // Debug must never break a real request.
  }
}

/**
 * Request-body dump. Redacted by default to metadata only (model, input item
 * shape, byte size, whether reasoning/tools are set) — enough to diagnose
 * "stream ended without events" or a hung stream without persisting the system
 * prompt and every user message to disk.
 */
function debugRequestPayload(body: ResponsesBody): string {
  if (debugConfig().sensitive) return JSON.stringify(body, null, 2);
  const input = Array.isArray(body.input) ? body.input : [];
  return JSON.stringify(
    {
      model: body.model,
      input_items: input.length,
      input_item_types: input.map((item) => (item as { type?: string }).type ?? "unknown"),
      bytes: JSON.stringify(body).length,
      reasoning: body.reasoning !== undefined,
      // The effort actually requested, and whether the encrypted-reasoning
      // include was set — the two fields that answer "did the bridge ask for
      // reasoning, and how hard?" without logging any prompt content.
      reasoning_effort: (body.reasoning as { effort?: unknown } | undefined)?.effort,
      include: body.include,
      tools: Array.isArray(body.tools) ? body.tools.length : 0,
    },
    null,
    2,
  );
}

/** Per-emit dump. Redacted by default to the event type + delta byte length. */
function debugEmitPayload(event: Event): string {
  if (debugConfig().sensitive) return JSON.stringify(event);
  const rec = event as unknown as Record<string, unknown>;
  let deltaBytes = 0;
  for (const field of ["text", "thinking", "partial_json", "signature"]) {
    const value = rec[field];
    if (typeof value === "string") deltaBytes += Buffer.byteLength(value, "utf8");
  }
  return JSON.stringify({
    type: event.type,
    index: typeof rec["index"] === "number" ? rec["index"] : undefined,
    delta_bytes: deltaBytes,
  });
}

/** Finalize dump. Redacted by default to block types + usage. */
function debugResultPayload(result: Result): string {
  if (debugConfig().sensitive) return JSON.stringify(result, null, 2);
  return JSON.stringify(
    {
      model: result.model,
      stop_reason: result.stop_reason,
      blocks: result.blocks.map((b) => b.type),
      usage: result.usage,
    },
    null,
    2,
  );
}

/* -------------------------------------------------------------------------- */
/* resolveModel                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the OpenAI model id for a request. A non-empty request model passes
 * through unchanged; an empty/missing model falls back to `fallback`.
 *
 * (The gateway applies any `config.modelMap` mapping before calling generate;
 * generate only needs the request model + a fallback.)
 */
export function resolveModel(reqModel: string, fallback: string): string {
  return reqModel && reqModel.length > 0 ? reqModel : fallback;
}

/* -------------------------------------------------------------------------- */
/* countTokens — local estimate                                               */
/* -------------------------------------------------------------------------- */

export interface CountResult {
  count: number;
  /** Always true: the ChatGPT subscription has no count endpoint. */
  estimated: boolean;
}

/**
 * Estimate input tokens locally. The ChatGPT subscription has no dedicated
 * count endpoint, so this is always a heuristic (`estimated: true`).
 */
export function countTokens(req: Request): CountResult {
  return { count: EstimateInputTokens(req), estimated: true };
}

/* -------------------------------------------------------------------------- */
/* sanitizeSubscription + normalizeSubscriptionDocuments                       */
/* -------------------------------------------------------------------------- */

/**
 * Disallowed top-level fields on a ChatGPT subscription request. These are
 * either unsupported by the codex backend or must not be sent (storing
 * responses is off for the headless subscription).
 */
const SUBSCRIPTION_FORBIDDEN_KEYS = [
  "user",
  "max_output_tokens",
  "truncation",
  "previous_response_id",
] as const;

/**
 * Force the subscription-safe body shape: store:false, stream:true,
 * parallel_tool_calls:false, and delete the disallowed top-level fields.
 *
 * ToResponses already sets store:false / parallel_tool_calls:false /
 * stream:req.stream; this function is the enforcement layer that guarantees
 * the shape regardless of what the translator produced (defence in depth) and
 * flips stream to true (generate always streams).
 */
function sanitizeSubscription(body: ResponsesBody): ResponsesBody {
  body.store = false;
  body.stream = true;
  body.parallel_tool_calls = false;
  for (const key of SUBSCRIPTION_FORBIDDEN_KEYS) {
    delete (body as unknown as Record<string, unknown>)[key];
  }
  return body;
}

/**
 * Normalize document input items. v1 of the bridge does not support document
 * items, so they are dropped from the input array (stub — a real normalizer
 * would translate them). This keeps the request shape valid even if a caller
 * somehow includes a document item.
 */
function normalizeSubscriptionDocuments(body: ResponsesBody): ResponsesBody {
  if (!Array.isArray(body.input)) return body;
  body.input = body.input.filter((item) => {
    const t = (item as { type?: string }).type;
    return t !== "document";
  });
  return body;
}

/* -------------------------------------------------------------------------- */
/* authorize — header builder                                                 */
/* -------------------------------------------------------------------------- */

/** Headers required by the codex Responses endpoint. */
type AuthorizeHeaders = Record<string, string>;

/**
 * Build the request headers for a subscription generate call.
 *
 *   - Authorization: Bearer <access>
 *   - ChatGPT-Account-Id: <cred.account_id>
 *   - User-Agent: <ua>
 *   - originator: <originator>
 *   - version: <version>
 *   - Accept: text/event-stream
 */
function authorize(cred: Credential, originator: string, ua: string, version: string): AuthorizeHeaders {
  return {
    Authorization: `Bearer ${cred.access}`,
    "ChatGPT-Account-Id": cred.account_id,
    "User-Agent": ua,
    originator,
    version,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
}

/* -------------------------------------------------------------------------- */
/* backoff                                                                     */
/* -------------------------------------------------------------------------- */

/** Exponential backoff base (ms). */
const BACKOFF_BASE_MS = 500;
/** Backoff cap (ms). */
const BACKOFF_CAP_MS = 30_000;

/**
 * Compute a backoff delay (ms) from a 429 / 5xx response.
 *
 * Preference: `retry-after-ms` header (ms) > `Retry-After` header (seconds) >
 * exponential `BACKOFF_BASE_MS * 2^attempt`, capped at `BACKOFF_CAP_MS`.
 */
function computeBackoff(res: Response, attempt: number): number {
  const raMs = res.headers.get("retry-after-ms");
  if (raMs !== null) {
    const n = Number(raMs);
    if (Number.isFinite(n) && n >= 0) return Math.min(n, BACKOFF_CAP_MS);
  }
  const ra = res.headers.get("Retry-After");
  if (ra !== null) {
    const n = Number(ra);
    if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, BACKOFF_CAP_MS);
  }
  const exp = BACKOFF_BASE_MS * Math.pow(2, attempt);
  return Math.min(exp, BACKOFF_CAP_MS);
}

/* -------------------------------------------------------------------------- */
/* cancellation helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The value an aborted signal should reject/throw with. `AbortController.abort()`
 * populates `signal.reason` with a DOMException named `AbortError`; the fallback
 * covers exotic signals that leave it undefined.
 */
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

/** Throw the signal's abort reason when it is already aborted; otherwise no-op. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

/**
 * True when `err` is a cancellation (abort or timeout) rather than a transport
 * failure. Cancellations must propagate UNWRAPPED — never remapped to an
 * {@link HTTPError} — so the gateway can distinguish "the client went away"
 * from "the upstream broke".
 */
function isAbortError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

/**
 * Abortable sleep. Resolves when the timer fires, or rejects with the signal's
 * abort reason — always clearing the timer and detaching the listener so an
 * aborted 30s backoff neither leaks a handle nor delays the rejection.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/* -------------------------------------------------------------------------- */
/* generate gate — global concurrency + per-key serialization                 */
/* -------------------------------------------------------------------------- */

/**
 * Default bound on the number of callers parked in the global wait queue. A
 * caller arriving when the queue is already this deep is rejected with a fast
 * 503 `queue_full` rather than being parked indefinitely.
 */
export const DEFAULT_MAX_QUEUED = 64;

const keyLock = new Map<string, Promise<void>>();
let activeCount = 0;
const waitQueue: Array<() => void> = [];

/**
 * Await `pending`, but reject as soon as `signal` aborts.
 *
 * The abort listener is always detached, and `Promise.race` subscribes to both
 * arms, so the loser can never surface as an unhandled rejection.
 */
async function raceAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([pending, cancelled]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Take the per-`prompt_cache_key` lock. Acquired BEFORE the global slot so a
 * caller waiting on a busy key never occupies one of the `maxConcurrent` slots
 * (which would let one hot key starve every unrelated request).
 *
 * CANCELLABLE. A caller parked behind a busy key observes `signal`: without
 * this a client disconnect (or the gateway request timeout) would not settle
 * the request at all until the holder finished, holding the HTTP connection
 * open past the timeout and still spending an upstream call afterwards.
 *
 * On abort our link in the chain is NOT resolved immediately — that would let
 * the next waiter run while the real holder is still in flight, breaking the
 * per-key serialization the lock exists to provide. It is resolved when the
 * predecessor finishes instead.
 *
 * Returns an idempotent release function; a caller without a key gets a no-op.
 */
async function acquireKey(key: string | undefined, signal?: AbortSignal): Promise<() => void> {
  if (key === undefined || key.length === 0) return () => {};

  const prev = keyLock.get(key);
  let signalDone: () => void = () => {};
  const ours = new Promise<void>((resolve) => {
    signalDone = resolve;
  });
  // Chain ourselves onto the key BEFORE awaiting the predecessor so callers
  // arriving behind us queue in arrival order.
  keyLock.set(key, ours);

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    signalDone();
    if (keyLock.get(key) === ours) keyLock.delete(key);
  };

  if (prev) {
    if (signal === undefined) {
      await prev;
    } else {
      throwIfAborted(signal);
      try {
        await raceAbort(prev, signal);
      } catch (err) {
        // Hand our link on only once the actual holder is done.
        void prev.then(release, release);
        throw err;
      }
    }
  }

  return release;
}

/**
 * Take a global concurrency slot, or reject with a fast 503 when the wait queue
 * is already `maxQueued` deep.
 *
 * A parked caller is handed a slot DIRECTLY by {@link releaseSlot} (the slot is
 * never returned to the pool and re-contested), which makes the queue strictly
 * FIFO-fair and removes the wake-up race entirely.
 *
 * CANCELLABLE. A parked caller observes `signal` — an aborted or timed-out
 * request must not stay pending until an unrelated predecessor finishes. An
 * aborted entry is spliced out of the queue BY IDENTITY, and if a slot was
 * handed to it in the same turn the slot is passed straight on rather than
 * swallowed.
 *
 * `admission` distinguishes ARRIVAL from RE-ADMISSION. The queue bound is an
 * admission control: a request that already passed it, then dropped its slot
 * across a backoff sleep or a credential refresh, must not be converted into a
 * spurious 503 when it comes back for a slot it had already been granted.
 *
 * @throws {@link HTTPError} 503 `queue_full` when the bound is reached on
 * arrival. The caller never incremented `activeCount`, so it must not decrement
 * it either.
 */
async function acquireSlot(
  maxConcurrent: number,
  maxQueued: number,
  signal?: AbortSignal,
  admission: "arrival" | "re-admission" = "arrival",
): Promise<void> {
  if (activeCount < maxConcurrent) {
    activeCount++;
    return;
  }
  if (admission === "arrival" && waitQueue.length >= maxQueued) {
    throw httpError(503, "queue_full", "generate queue is full");
  }
  if (signal !== undefined) throwIfAborted(signal);

  let handedOver = false;
  let entry: () => void = () => {};
  const parked = new Promise<void>((resolve) => {
    entry = () => {
      handedOver = true;
      resolve();
    };
    waitQueue.push(entry);
  });

  if (signal === undefined) {
    await parked;
    // The slot was handed over by releaseSlot — activeCount already accounts
    // for us, so it is deliberately NOT incremented here.
    return;
  }

  try {
    await raceAbort(parked, signal);
  } catch (err) {
    const index = waitQueue.indexOf(entry);
    if (index !== -1) waitQueue.splice(index, 1);
    // A slot may have been handed to us in the same turn the abort fired.
    // Pass it on instead of leaking it.
    if (handedOver) releaseSlot();
    throw err;
  }
}

/** Give back a global slot, handing it straight to the longest-waiting caller. */
function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next();
    return;
  }
  activeCount--;
}

/** Reset the module-level gate state. Test-only. */
export function _resetGates(): void {
  keyLock.clear();
  activeCount = 0;
  waitQueue.length = 0;
}

/**
 * Gate parameters. Zod owns the `maxQueued` default so it is never introduced
 * by a destructuring fallback.
 */
const GateOptionsSchema = z.object({
  maxConcurrent: z.number().int().positive(),
  maxQueued: z.number().int().nonnegative().default(DEFAULT_MAX_QUEUED),
});

/* -------------------------------------------------------------------------- */
/* generate                                                                    */
/* -------------------------------------------------------------------------- */

/** Inputs for {@link generate}. Matches the spec signature. */
export interface GenerateOptions {
  req: Request;
  emit: EmitFunc;
  cred: Credential;
  /** Fallback model when `req.model` is empty. */
  model: string;
  /** Effort used when the request has adaptive thinking (no fixed budget). */
  defaultEffort: EffortBucket;
  /** Global cap on concurrent generate calls. */
  maxConcurrent: number;
  /**
   * Per-call cancellation. Wins over `deps.signal` when both are present.
   *
   * The provider never creates or composes a timeout signal — it receives one
   * already-composed signal (the gateway owns `AbortSignal.timeout` +
   * `AbortSignal.any`) and forwards it verbatim to `fetch` and to `readSSE`.
   */
  signal?: AbortSignal;
  /**
   * Max callers parked in the global wait queue before a fast 503 `queue_full`.
   * Defaults to {@link DEFAULT_MAX_QUEUED} (owned by a Zod schema, never a
   * destructuring default).
   */
  maxQueued?: number;
}

/**
 * Injectable dependencies. All optional — defaults hit the real network. Tests
 * inject `fetch` and `forceRefresh` to stay offline.
 */
export interface GenerateDeps {
  fetch?: typeof fetch;
  forceRefresh?: (opts: ForceRefreshOptions) => Promise<Credential>;
  responsesEndpoint?: string;
  originator?: string;
  ua?: string;
  /** Profile dir passed to forceRefresh on 401. */
  profileDir?: string;
  /** Client version header (defaults to {@link CLIENT_VERSION}). */
  version?: string;
  /**
   * Cancellation carrier used by the gateway and the CLI wiring. `opts.signal`
   * wins when both are supplied.
   */
  signal?: AbortSignal;
}

/**
 * Build the production {@link GenerateDeps} from a loaded {@link Config}.
 *
 * This is the single binding point between config and the provider: the
 * gateway spreads a per-request `signal` onto it, and the CLI's
 * `bindGenerateDependencies` adds `forceRefresh`. It deliberately never sets
 * `fetch`, `forceRefresh`, `responsesEndpoint` or `signal` — those are the
 * caller's concern.
 */
export function providerDepsFromConfig(config: Config): GenerateDeps {
  return {
    profileDir: config.profileDir,
    originator: config.originator,
    ua: config.useCodexCliRsUa ? CODEX_CLI_RS_UA : DEFAULT_UA,
    version: CLIENT_VERSION,
  };
}

/** Max retries on 401 (forceRefresh + retry). */
const MAX_AUTH_RETRIES = 3;
/** Max retries on 429 / 5xx (backoff + retry). */
const MAX_SERVER_RETRIES = 5;

/**
 * Generate an Anthropic-shaped Result from a ChatGPT subscription.
 *
 * Translates the request, sanitizes the body for the subscription, acquires a
 * concurrency / per-key slot, POSTs to the Responses endpoint, streams the SSE
 * response through the collector, and returns the finalized Result. Retries on
 * 401 (forceRefresh) and 429 / 5xx (backoff). Errors are mapped to
 * {@link HTTPError}.
 */
export async function generate(opts: GenerateOptions, deps: GenerateDeps = {}): Promise<Result> {
  const fetchImpl = deps.fetch ?? fetch;
  const doForceRefresh = deps.forceRefresh ?? defaultForceRefresh;
  const endpoint = deps.responsesEndpoint ?? RESPONSES_ENDPOINT;
  // Production-correct fallbacks: a caller that passes `{}` must still speak
  // the same dialect as provider/models.ts, and — critically — must resolve a
  // real profileDir, or the 401 force-refresh path looks for the credential at
  // a cwd-relative path that never exists and an expired token surfaces as a
  // hard error instead of silently refreshing.
  const originator = deps.originator ?? ConfigSchema.parse({}).originator;
  const ua = deps.ua ?? DEFAULT_UA;
  const version = deps.version ?? CLIENT_VERSION;
  const profileDir = deps.profileDir ?? defaultProfileDir();

  const { req, emit, cred, model, defaultEffort } = opts;
  // Per-call cancellation wins over the bound production carrier.
  const signal = opts.signal ?? deps.signal;
  // Schema owns the maxQueued default (never a destructuring fallback).
  const gate = GateOptionsSchema.parse({
    maxConcurrent: opts.maxConcurrent,
    maxQueued: opts.maxQueued,
  });

  // Translate and resolve model.
  const translated = ToResponses(req);
  const body = sanitizeSubscription(normalizeSubscriptionDocuments(translated.body));
  // The gateway already resolved the requested public id (e.g.
  // `claude-luca-code-gpt-5`) to its upstream slug and passed it as `model`. Send
  // that slug upstream — never echo `req.model`, which still carries the
  // public id Claude Code sent (OpenAI rejects unknown model ids with 400).
  body.model = model;

  // Apply defaultEffort only when the request carries a thinking config but
  // ToResponses produced no reasoning (adaptive / missing budget). A fixed
  // budget keeps the effort derived from the budget; no thinking -> no effort.
  if (body.reasoning === undefined && req.thinking != null) {
    body.reasoning = { effort: defaultEffort, summary: "auto" };
    body.include = ["reasoning.encrypted_content"];
  }

  // LUCA_CODE_DEBUG=1 dumps request/response metadata to a file (see debugDump) so a
  // failure like "stream ended without events" or a hung stream can be
  // diagnosed without guessing — and without corrupting the Claude Code TUI.
  // Redacted by default; LUCA_CODE_DEBUG_SENSITIVE=1 opts back in to full content.
  // No-op when the env flag is unset.
  //
  // DUMPED AFTER the reasoning injection above, deliberately: dumping first
  // recorded `"reasoning": false` and a `bytes` count for a body that is NOT
  // what gets POSTed, so an operator debugging "reasoning isn't working" would
  // read the log and conclude the bridge never asked for it.
  if (debugEnabled()) {
    debugDump("request body", debugRequestPayload(body));
  }

  let currentCred = cred;
  let authRetries = 0;
  let serverRetries = 0;

  throwIfAborted(signal);

  // The per-key lock is taken FIRST and held across the WHOLE retry sequence
  // (so per-key serialization survives the slot juggling below); the global
  // slot is taken second and dropped around every await that is not the fetch.
  //
  // BOTH parks observe `signal`: a request queued behind a busy key or behind
  // `maxConcurrent` in-flight generates must settle on abort/timeout instead of
  // waiting for an unrelated predecessor (which would hold the HTTP connection
  // open past the gateway timeout and still spend an upstream call afterwards).
  const releaseKey = await acquireKey(req.prompt_cache_key, signal);
  let holdsSlot = false;
  try {
    await acquireSlot(gate.maxConcurrent, gate.maxQueued, signal);
    holdsSlot = true;

    for (;;) {
      // Fail fast on entry and after every slot (re)acquisition: an already
      // cancelled request must never reach the network.
      throwIfAborted(signal);
      const headers = authorize(currentCred, originator, ua, version);
      if (debugEnabled()) debugDump("fetch sent", `${endpoint} (attempt authRetries=${authRetries} serverRetries=${serverRetries})`);
      let res: Response;
      try {
        res = await fetchImpl(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          // Forwarded VERBATIM (object identity preserved) so callers can
          // assert the exact signal reached the transport. `undefined` is a
          // no-op for fetch, so uncancellable calls behave exactly as before.
          signal,
        });
      } catch (err) {
        if (debugEnabled()) debugDump("fetch threw", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
        throw err;
      }

      // Debug: dump the upstream status + content-type. We only read the body
      // on the ERROR path (via res.clone().text()) — buffering the full body on
      // the success path would hang generate if the upstream stream itself
      // hangs, masking the very hang we are diagnosing. Success-path content is
      // captured by the emit trace + finalize dump below.
      if (debugEnabled()) {
        const ct = res.headers.get("content-type") ?? "";
        if (!res.ok) {
          let raw: string;
          try {
            raw = await res.clone().text();
          } catch {
            raw = "<unreadable body>";
          }
          debugDump("upstream response", `status: ${res.status}\ncontent-type: ${ct}\n---\n${raw}`);
        } else {
          debugDump("upstream response", `status: ${res.status}\ncontent-type: ${ct}\n(success path — content captured via emit trace)`);
        }
      }

      if (res.status === 401) {
        if (authRetries >= MAX_AUTH_RETRIES) {
          throw httpError(401, "unauthorized", "unauthorized after retries", await readBody(res));
        }
        authRetries++;
        // Drain the unread error body before retrying — an abandoned
        // ReadableStream holds its socket open until GC.
        await discardBody(res);
        // Drop the global slot: a slow token refresh must not block unrelated
        // sessions. The per-key lock stays held.
        releaseSlot();
        holdsSlot = false;
        currentCred = await doForceRefresh({
          profileDir,
          ua,
          rejectedAccess: currentCred.access,
        });
        // RE-ADMISSION: this request already passed the queue bound on arrival
        // and has just burned an auth retry. Re-checking the bound here would
        // 503 it with "queue is full" after it had already been admitted and
        // obtained a fresh credential.
        await acquireSlot(gate.maxConcurrent, gate.maxQueued, signal, "re-admission");
        holdsSlot = true;
        continue;
      }

      if (res.status === 429 || res.status >= 500) {
        if (serverRetries >= MAX_SERVER_RETRIES) {
          const retryAfter = computeBackoff(res, serverRetries);
          throw httpError(
            res.status,
            res.status === 429 ? "rate_limited" : "server_error",
            `upstream ${res.status}`,
            await readBody(res),
            retryAfter,
          );
        }
        const delay = computeBackoff(res, serverRetries);
        await discardBody(res);
        // Drop the global slot across the backoff (up to BACKOFF_CAP_MS = 30s)
        // so one rate-limited caller cannot stall every other session.
        releaseSlot();
        holdsSlot = false;
        await sleep(delay, signal);
        // RE-ADMISSION (see the 401 path above): the bound is enforced at
        // arrival only, so a competitor taking the freed slot during the
        // backoff cannot turn this already-admitted request into a 503.
        await acquireSlot(gate.maxConcurrent, gate.maxQueued, signal, "re-admission");
        holdsSlot = true;
        serverRetries++;
        continue;
      }

      if (!res.ok) {
        throw httpError(res.status, "http_error", `upstream ${res.status}`, await readBody(res));
      }

      // Success: stream SSE -> collector. When debugging, wrap emit so each
      // forwarded event is logged, and dump the finalized result.
      const traceEmit: EmitFunc = debugEnabled()
        ? (e) => {
            debugDump("emit", debugEmitPayload(e));
            return emit(e);
          }
        : emit;
      const result = await consumeStream(res, traceEmit, signal);
      if (debugEnabled()) debugDump("finalize result", debugResultPayload(result));
      return result;
    }
  } finally {
    // Both holds are released on EVERY exit path — success, HTTPError, abort,
    // and the queue_full rejection (which never took a slot at all).
    if (holdsSlot) releaseSlot();
    releaseKey();
  }
}

/**
 * Cancel an unread response body, swallowing any failure. Called before every
 * retry `continue` so the abandoned stream releases its socket immediately
 * instead of at GC time.
 */
async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // A body that is already consumed / cancelled is fine.
  }
}

/** Read the response body as text, best-effort (never throws). */
async function readBody(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}

/**
 * Responses SSE events the collector understands. A malformed payload on one of
 * these is a hard stream failure — silently downgrading it to `{}` would let a
 * garbled `response.completed` become a clean, empty, "successful" turn.
 *
 * Events NOT in this set stay tolerated (forward compatibility with new
 * Responses event types the collector has not been taught about).
 */
const RECOGNIZED_SSE_EVENTS: ReadonlySet<string> = new Set([
  "response.created",
  "response.output_item.added",
  "response.output_text.delta",
  "response.reasoning_summary_text.delta",
  "response.function_call_arguments.delta",
  "response.output_item.done",
  "response.completed",
  "response.incomplete",
  "response.failed",
  "response.cancelled",
]);

/** The subset of {@link RECOGNIZED_SSE_EVENTS} that terminates a stream. */
const TERMINAL_SSE_EVENTS: ReadonlySet<string> = new Set([
  "response.completed",
  "response.incomplete",
  "response.failed",
  "response.cancelled",
]);

/** Maximum bytes in one physical SSE line — the provider's choice, not a default. */
const MAX_SSE_LINE_BYTES = 64 * 1024;
/** Maximum aggregate bytes in one SSE event. */
const MAX_SSE_EVENT_BYTES = 1024 * 1024;

/** True for a plain JSON object (the only legal lifecycle payload shape). */
function isJsonObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Pipe the SSE response through a fresh collector and finalize the Result.
 *
 * Failure handling:
 *   - a malformed JSON payload on a RECOGNIZED event is a 502 `stream_error`
 *     and is NOT dispatched (nothing reaches the client);
 *   - a terminal event whose payload parses to a non-object is likewise a 502;
 *   - RangeError / TypeError escaping readSSE (line / event byte caps, bad
 *     options) becomes a 502 `stream_error` so the gateway can classify it;
 *   - an abort / timeout propagates UNWRAPPED, per the cancellation contract.
 */
async function consumeStream(
  res: Response,
  emit: EmitFunc,
  signal?: AbortSignal,
): Promise<Result> {
  const collector = createCollector();
  try {
    await readSSE(
      res.body as ReadableStream<Uint8Array>,
      (event, data) => {
        if (event === "") return; // no event name -> ignore (heartbeat etc.)
        let parsed: unknown = {};
        if (data.length > 0) {
          try {
            parsed = JSON.parse(data);
          } catch {
            if (RECOGNIZED_SSE_EVENTS.has(event)) {
              throw httpError(502, "stream_error", `malformed SSE payload for ${event}`);
            }
            parsed = {};
          }
        }
        if (TERMINAL_SSE_EVENTS.has(event) && !isJsonObject(parsed)) {
          throw httpError(502, "stream_error", `malformed SSE payload for ${event}`);
        }
        collector.handle({ event, data: parsed }, emit);
      },
      { signal, maxLineBytes: MAX_SSE_LINE_BYTES, maxEventBytes: MAX_SSE_EVENT_BYTES },
    );
  } catch (err) {
    // Cancellation is not a stream failure — never remap it.
    if (signal?.aborted || isAbortError(err)) throw err;
    if (isHTTPError(err)) throw err;
    if (err instanceof RangeError || err instanceof TypeError) {
      throw httpError(502, "stream_error", err.message);
    }
    throw err;
  }
  const { result, ok, error } = collector.finalize();
  if (!ok) {
    throw httpError(502, "stream_error", error ?? "stream failed", undefined, undefined);
  }
  return result;
}