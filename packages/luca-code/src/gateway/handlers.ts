/**
 * gateway/handlers.ts — Step 13 Anthropic-shaped request handlers.
 *
 * Extracts the per-route handlers out of gateway/server.ts into reusable,
 * independently-testable functions. Each handler takes a fetch `Request` and an
 * injectable {@link HandlerDeps} (config + model resolver + credential +
 * generate + countTokens), and returns an Anthropic-shaped `Response`. No
 * `Bun.serve` here — the server module wires these into a router; this module
 * is pure request -> response translation.
 *
 * Surface (authoritative spec, step 13):
 *   - {@link anthropicError}        — `{type:"error",error:{type,message}}` JSON
 *   - {@link providerErrorType}     — HTTP status -> Anthropic error type slug
 *   - {@link messageResponse}       — non-streaming `{id,type:"message",...}` JSON
 *   - {@link readJsonBody}          — bounded JSON reader (maxBytesReader)
 *   - {@link handleMessages}       — translate + restrict + route + generate / stream
 *   - {@link handleCountTokens}    — local estimate + `X-luca-code-Token-Count-Estimated` header
 *   - {@link handleModels}         — Anthropic-shaped `/v1/models` catalog
 *   - {@link handleStatus}         — gateway result/failure stats
 *   - {@link handleUsage}          — gateway token-usage totals
 *
 * Schema-first (Zod owns body defaults/validators), functional (closures/factory,
 * no classes), Bun-native (no node:http / express / dotenv). `generate`,
 * `countTokens`, and `getCredentials` are injected so the suite never touches
 * the network or the disk credential store.
 */

import { createHash } from "node:crypto";

import { z } from "zod";

import type { Config } from "../config";
import type { Credential } from "../auth/credentials";
import type { Message, Request as ProtocolRequest, Result, Tool } from "../protocol/types";
import { SystemText } from "../protocol/types";
import type { Model } from "../provider/models";
import { isHTTPError, providerDepsFromConfig } from "../provider/openai";
import type { GenerateDeps, GenerateOptions } from "../provider/openai";
import { streamMessages } from "./stream";

/**
 * Local alias for the protocol {@link ProtocolRequest} — the Anthropic
 * Messages request. Used to avoid clashing with the global fetch `Request`.
 */
export type MessagesRequest = ProtocolRequest;

/** Injectable generate signature (matches provider/openai `generate`). */
export interface RequestGenerateDeps extends GenerateDeps {
  signal?: AbortSignal;
}

export type GenerateFn = (
  opts: GenerateOptions,
  deps?: RequestGenerateDeps,
) => Promise<Result>;

/** Injectable countTokens signature (matches provider/openai `countTokens`). */
export type CountTokensFn = (req: MessagesRequest) => { count: number; estimated: boolean };

/** Dependencies passed to every handler. All network/IO is injectable. */
export interface HandlerDeps {
  config: Config;
  /** The full public model catalog (used by {@link handleModels}). */
  models: Model[];
  /** Resolve a requested public model id to the upstream Model. */
  resolveModel: (requested: string) => Model | undefined;
  /** Returns the current subscription credential, or null when unauthenticated. */
  getCredentials: () => Promise<Credential | null>;
  /** Generate an Anthropic-shaped Result (provider.openai.generate). */
  generate: GenerateFn;
  /** Local token-count estimate (provider.openai.countTokens). */
  countTokens: CountTokensFn;
  /** Result/failure + token-usage tracker (see {@link createStatsTracker}). */
  tracker: StatsTracker;
}

/** Gateway statistics tracked across handler invocations. */
export interface HandlerStats {
  results: number;
  failures: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/** Public-facing model id prefix advertised to Claude Code. */
export const PUBLIC_ID_PREFIX = "claude-luca-code-";

/** Marker phrase that flags a request as a recursive subagent call. */
const SUBAGENT_MARKER = "cc_is_subagent=true";

/** Tool name stripped from subagent requests to prevent fan-out. */
const AGENT_TOOL_NAME = "agent";

/** Seed string for the per-session prompt_cache_key hash. */
const CACHE_KEY_SEED = "luca_code_";

/* -------------------------------------------------------------------------- */
/* request shaping — subagent restriction + client routing                    */
/* -------------------------------------------------------------------------- */

/** Synchronous sha256 hex digest of a string. */
function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Strip the `agent` tool from a request when it is a recursive subagent call
 * (system prompt contains `cc_is_subagent=true`). Returns a shallow-cloned
 * request so the caller's object is never mutated.
 *
 * Lives here (not in `server.ts`) so the whole request surface sits in one
 * module and `handlers.ts` has no import edge back into the server — the
 * server re-exports this symbol for backwards compatibility.
 */
export function restrictRecursiveSubagentTools(req: MessagesRequest): MessagesRequest {
  const text = SystemText(req.system);
  if (!text.includes(SUBAGENT_MARKER)) return req;
  const tools = req.tools.filter((t) => t.name !== AGENT_TOOL_NAME);
  return { ...req, tools };
}

/**
 * Derive a `prompt_cache_key` from the `X-Claude-Code-Session-Id` request
 * header so per-session subscription gating serializes correctly upstream.
 * The key is the sha256 hex digest of `luca_code_<sessionId>`. Returns the
 * request unchanged when the header is absent.
 */
export function attachClientRouting(req: MessagesRequest, headers: Headers): MessagesRequest {
  const sessionId = headers.get("x-claude-code-session-id");
  if (!sessionId) return req;
  const key = sha256Hex(`${CACHE_KEY_SEED}${sessionId}`);
  return { ...req, prompt_cache_key: key };
}

/* -------------------------------------------------------------------------- */
/* Zod schema — single source of truth for the /v1/messages body             */
/* -------------------------------------------------------------------------- */

/**
 * Schema for an incoming Anthropic Messages request body. Owns all defaults
 * and validators; callers never destructure defaults. Passthrough keeps
 * unknown fields for round-trip fidelity. Raw fields are typed `any` / `any`
 * and parsed lazily by the protocol layer — the wire shape is fixed by the
 * Anthropic API.
 */
const MessageBodySchema = z
  .object({
    model: z.string().default(""),
    max_tokens: z.number().int().positive().default(1024),
    messages: z.array(z.any()).default([]),
    system: z.any().default(null),
    tools: z.array(z.any()).default([]),
    tool_choice: z.any().default(null),
    stop_sequences: z.array(z.string()).default([]),
    stream: z.boolean().default(false),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    thinking: z.any().optional(),
    output_config: z.any().optional(),
    output_format: z.any().optional(),
    metadata: z.any().optional(),
    service_tier: z.string().optional(),
    speed: z.string().optional(),
  })
  .passthrough();

type MessageBody = z.infer<typeof MessageBodySchema>;

/* -------------------------------------------------------------------------- */
/* error + response builders                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Build an Anthropic-shaped error `Response`.
 *
 * The envelope is `{type:"error",error:{type,message}}` with a JSON
 * content-type and the given HTTP status.
 */
export function anthropicError(status: number, type: string, message: string): Response {
  return new Response(
    JSON.stringify({
      type: "error",
      error: { type, message },
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

/**
 * Map an upstream HTTP status to an Anthropic error type slug. Used when
 * translating a provider {@link Result} failure (or an HTTPError) into an
 * Anthropic-shaped error response.
 *
 *   400 -> invalid_request_error
 *   401 -> authentication_error
 *   403 -> permission_error
 *   404 -> not_found_error
 *   413 -> request_too_large
 *   429 -> rate_limit_error
 *   5xx -> api_error
 *   *   -> api_error
 */
export function providerErrorType(status: number): string {
  switch (status) {
    case 400:
      return "invalid_request_error";
    case 401:
      return "authentication_error";
    case 403:
      return "permission_error";
    case 404:
      return "not_found_error";
    case 413:
      return "request_too_large";
    case 429:
      return "rate_limit_error";
    default:
      if (status >= 500) return "api_error";
      return "api_error";
  }
}

/**
 * Build the non-streaming Anthropic message JSON response from a finalized
 * provider {@link Result}. Mints a fresh `msg_<uuid>` id per call. The shape:
 * `{id, type:"message", role:"assistant", content, model, stop_reason,
 *   stop_sequence:null, usage}`.
 *
 * `model` is the requested public model id (echoed back to the client), not
 * the upstream id the provider actually called.
 */
export function messageResponse(result: Result, model: string): Response {
  return new Response(
    JSON.stringify({
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      role: "assistant",
      content: result.blocks,
      model,
      stop_reason: result.stop_reason,
      stop_sequence: null,
      usage: result.usage,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/* -------------------------------------------------------------------------- */
/* readJsonBody (maxBytesReader)                                              */
/* -------------------------------------------------------------------------- */

/** Result of a bounded body read: success carries the parsed JSON + byte count. */
export type ReadBodyResult =
  | { ok: true; json: unknown; bytes: number }
  | { ok: false; res: Response };

/** The 413 response shared by both byte-cap rejection paths. */
function tooLargeResponse(): Response {
  return anthropicError(413, "request_too_large", "body exceeds maxBodyBytes");
}

/**
 * Read a fetch `Request` body as JSON with a byte cap (`maxBytesReader`).
 *
 * The cap bounds what is *read*, not what has already been buffered:
 *
 * 1. **Declared-size fast path** — a `content-length` header that parses to a
 *    finite number greater than `maxBytes` yields a 413 immediately; `req.body`
 *    is never touched, so an oversized upload costs zero bytes of memory.
 * 2. **Streaming path** — the body is read chunk by chunk while summing
 *    `byteLength`. The moment the running total exceeds `maxBytes` the reader
 *    is cancelled (releasing the upstream body) and a 413 is returned. Peak
 *    memory is therefore bounded by `maxBytes` plus one chunk, rather than by
 *    whatever the client chose to send.
 *
 * A body of exactly `maxBytes` succeeds; only a strictly larger body rejects.
 * Invalid JSON yields a 400 `invalid_request_error`. A `null` body and a
 * zero-byte body both parse to `{}` (the Anthropic default-object shape).
 *
 * Returns a discriminated union so the caller can short-circuit on `{ok:false}`
 * by returning the embedded error response verbatim.
 */
export async function readJsonBody(req: Request, maxBytes: number): Promise<ReadBodyResult> {
  // 1. Reject a self-declared oversized body before reading a single byte.
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, res: tooLargeResponse() };
  }

  // 2. Read incrementally, bailing out as soon as the cap is exceeded.
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const reader = req.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, res: tooLargeResponse() };
      }
      chunks.push(value);
    }
  }

  const decoder = new TextDecoder();
  let text = "";
  for (const chunk of chunks) text += decoder.decode(chunk, { stream: true });
  text += decoder.decode();

  let json: unknown;
  try {
    json = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    return { ok: false, res: anthropicError(400, "invalid_request_error", "invalid JSON body") };
  }
  return { ok: true, json, bytes };
}

/* -------------------------------------------------------------------------- */
/* stats tracker (closure-based, no class)                                    */
/* -------------------------------------------------------------------------- */

/** A mutable stats tracker (closure-based, no class). */
export interface StatsTracker {
  stats: HandlerStats;
  recordResult: (r: Result) => void;
  recordFailure: () => void;
}

/**
 * Create a fresh, independent stats tracker. Returns the mutable stats object
 * plus `recordResult` / `recordFailure` mutators. Each call yields an
 * isolated tracker (pure factory; no shared state across handlers).
 */
export function createStatsTracker(): StatsTracker {
  const stats: HandlerStats = {
    results: 0,
    failures: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
  };
  return {
    stats,
    recordResult(r: Result): void {
      stats.results++;
      stats.totalInputTokens += r.usage.input_tokens ?? 0;
      stats.totalOutputTokens += r.usage.output_tokens ?? 0;
    },
    recordFailure(): void {
      stats.failures++;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Build the public-facing id for an upstream model slug.
 *
 * THE single source of truth. `server.ts` keys its model catalog with this same
 * function, so the id advertised by `/v1/models` and the key `resolveModel`
 * looks up can never drift apart.
 */
export function publicIdFor(model: Model): string {
  return `${PUBLIC_ID_PREFIX}${model.id}`;
}

/**
 * Build one Anthropic-shaped model catalog entry. Shared by
 * {@link handleModels} and {@link handleModelById} so the catalog view and the
 * single-model view can never drift.
 */
function modelEntry(m: Model): Record<string, unknown> {
  return {
    id: publicIdFor(m),
    type: "model",
    display_name: m.displayName,
    description: m.description,
    efforts: m.efforts,
    input_modalities: m.inputModalities,
    created_at: 0,
  };
}

/** Map a parsed body to the protocol {@link MessagesRequest} shape. */
function bodyToRequest(d: MessageBody): MessagesRequest {
  return {
    model: d.model,
    max_tokens: d.max_tokens,
    messages: d.messages as Message[],
    system: d.system,
    tools: d.tools as Tool[],
    tool_choice: d.tool_choice,
    stop_sequences: d.stop_sequences,
    stream: d.stream,
    temperature: d.temperature,
    top_p: d.top_p,
    thinking: d.thinking,
    output_config: d.output_config,
    output_format: d.output_format,
    metadata: d.metadata,
    service_tier: d.service_tier,
    speed: d.speed,
  };
}

/**
 * Is `err` the abort reason produced by `AbortSignal.timeout` (a `DOMException`
 * whose `name` is `"TimeoutError"`)? A client disconnect aborts with an
 * `AbortError` instead, which is deliberately NOT matched here — the client is
 * gone, so the status is moot, and it must not be reported as a gateway
 * timeout.
 */
function isTimeout(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "TimeoutError";
}

/* -------------------------------------------------------------------------- */
/* handleMessages                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Handle `POST /v1/messages`.
 *
 * Decodes the Anthropic Messages request via {@link readJsonBody}, validates
 * model + max_tokens via the Zod schema, resolves the requested model,
 * restricts recursive subagent tools, derives a per-session prompt cache key,
 * and either:
 *   - streams the result (stream:true) via {@link streamMessages}, or
 *   - calls `generate` and returns a {@link messageResponse} JSON.
 *
 * Provider failures are mapped to an Anthropic-shaped 502 error carrying the
 * provider-mapped error type for the upstream status.
 */
export async function handleMessages(req: Request, deps: HandlerDeps): Promise<Response> {
  const body = await readJsonBody(req, deps.config.maxBodyBytes);
  if (!body.ok) return body.res;

  const parsed = MessageBodySchema.safeParse(body.json);
  if (!parsed.success) {
    return anthropicError(400, "invalid_request_error", "invalid messages body");
  }
  const baseReq = bodyToRequest(parsed.data);

  // Subagent tool restriction + per-session cache key derivation.
  const routed = attachClientRouting(restrictRecursiveSubagentTools(baseReq), req.headers);

  // Resolve the upstream model id from the requested public id.
  const resolved = deps.resolveModel(routed.model);
  if (!resolved) {
    return anthropicError(404, "not_found_error", `unknown model: ${routed.model}`);
  }

  const cred = await deps.getCredentials();
  if (!cred) {
    return anthropicError(503, "api_error", "no credentials available");
  }

  // ONE composite cancellation signal per request: the client going away
  // (Bun.serve fires `req.signal` on disconnect) OR the request timeout
  // elapsing. The gateway owns the timer — the provider only honours the
  // signal it is handed. Without this a cancelled request keeps the upstream
  // SSE stream open and holds its `maxConcurrentSubscription` slot forever.
  const timeoutMs = deps.config.requestTimeout;
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(timeoutMs)]);
  const generateDeps: RequestGenerateDeps = {
    ...providerDepsFromConfig(deps.config),
    signal,
  };

  if (routed.stream) {
    return streamMessages(
      {
        req: routed,
        cred,
        model: resolved.id,
        defaultEffort: deps.config.defaultEffort,
        maxConcurrent: deps.config.maxConcurrentSubscription,
        signal,
        generateDeps,
      },
      deps.generate,
      deps.tracker,
    );
  }

  try {
    const result = await deps.generate(
      {
        req: routed,
        emit: () => {
          // Non-streaming: we consume the finalized Result; emit is a no-op.
        },
        cred,
        model: resolved.id,
        defaultEffort: deps.config.defaultEffort,
        maxConcurrent: deps.config.maxConcurrentSubscription,
      },
      generateDeps,
    );
    deps.tracker.recordResult(result);
    return messageResponse(result, routed.model);
  } catch (err) {
    deps.tracker.recordFailure();
    // The request timeout fired: report it as a gateway timeout rather than a
    // generic upstream failure, so the client can distinguish "we gave up" from
    // "OpenAI rejected this".
    if (isTimeout(err) || isTimeout(signal.reason)) {
      return anthropicError(
        504,
        "api_error",
        `upstream request timed out after ${timeoutMs}ms`,
      );
    }
    const status = (err as { status?: number }).status;
    const type = typeof status === "number" ? providerErrorType(status) : "api_error";
    let message = err instanceof Error ? err.message : "upstream generate failed";
    // Surface OpenAI's actual rejection body when present — without this the
    // upstream 400 reason is hidden behind "upstream 400".
    if (isHTTPError(err) && typeof err.body === "string" && err.body.length > 0) {
      message = `${message} — ${err.body.slice(0, 512)}`;
    }
    return anthropicError(502, type, message);
  }
}

/* -------------------------------------------------------------------------- */
/* handleCountTokens                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Handle `POST /v1/messages/count_tokens`.
 *
 * Estimates input tokens locally (the ChatGPT subscription has no count
 * endpoint), returns `{id:"msg_count_tokens", input_tokens}`, and sets the
 * `X-luca-code-Token-Count-Estimated: true` header so the client knows the count
 * is a heuristic, not an exact upstream value.
 */
export async function handleCountTokens(req: Request, deps: HandlerDeps): Promise<Response> {
  const body = await readJsonBody(req, deps.config.maxBodyBytes);
  if (!body.ok) return body.res;

  const parsed = MessageBodySchema.safeParse(body.json);
  if (!parsed.success) {
    return anthropicError(400, "invalid_request_error", "invalid messages body");
  }
  const reqObj = bodyToRequest(parsed.data);

  const { count } = deps.countTokens(reqObj);
  return new Response(
    JSON.stringify({
      id: "msg_count_tokens",
      input_tokens: count,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-luca-code-token-count-estimated": "true",
      },
    },
  );
}

/* -------------------------------------------------------------------------- */
/* handleModels                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Build an Anthropic-shaped `/v1/models` catalog response.
 *
 * Each entry carries: `id` (public id), `type:"model"`, `display_name`,
 * `description`, `efforts` (supported reasoning levels), `input_modalities`,
 * and `created_at` (a fixed epoch second so the field is always present and
 * numeric). The response also includes the Anthropic pagination fields
 * `has_more`, `first_id`, `last_id`.
 *
 * Note: `handleModels` needs the catalog to resolve entries. Since
 * {@link HandlerDeps} only exposes `resolveModel` (single lookup), this
 * function reads the catalog via the optional `deps.models` array when the
 * caller attaches it; otherwise it falls back to an empty list. The wired
 * gateway attaches the full catalog before calling.
 */
export function handleModels(deps: HandlerDeps): Response {
  const models = deps.models ?? [];
  const data = models.map(modelEntry);
  return new Response(
    JSON.stringify({
      data,
      has_more: false,
      first_id: data[0]?.id ?? null,
      last_id: data.length > 0 ? data[data.length - 1]?.id ?? null : null,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/**
 * Build the Anthropic-shaped `/v1/models/:id` response for a single requested
 * public model id. Unknown ids yield a 404 `not_found_error`. Uses the same
 * entry shape as {@link handleModels} so the single-model and catalog views
 * never drift.
 */
export function handleModelById(id: string, deps: HandlerDeps): Response {
  const m = deps.resolveModel(id);
  if (!m) return anthropicError(404, "not_found_error", `unknown model: ${id}`);
  return new Response(JSON.stringify(modelEntry(m)), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/* -------------------------------------------------------------------------- */
/* handleStatus + handleUsage                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build the `/v1/status` response from the handler deps' stats tracker.
 * Returns `{results, failures, totalInputTokens, totalOutputTokens}`.
 */
export function handleStatus(deps: HandlerDeps): Response {
  return new Response(JSON.stringify(deps.tracker.stats), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Build the `/v1/usage` response from the handler deps' stats tracker. Returns
 * the token-usage totals in snake_case (`total_input_tokens`,
 * `total_output_tokens`) plus the result/failure counts for context.
 */
export function handleUsage(deps: HandlerDeps): Response {
  return new Response(
    JSON.stringify({
      total_input_tokens: deps.tracker.stats.totalInputTokens,
      total_output_tokens: deps.tracker.stats.totalOutputTokens,
      results: deps.tracker.stats.results,
      failures: deps.tracker.stats.failures,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}