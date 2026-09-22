/**
 * gateway/server.ts — Step 12 loopback gateway for luca-code.
 *
 * Ports macaz `internal/gateway/server.go` to a Bun-native, functional HTTP
 * gateway. The gateway listens on `127.0.0.1:0` (random port), mints a random
 * 32-byte hex auth token, and exposes the Anthropic Messages surface that
 * Claude Code expects:
 *
 *   GET  /health                       — public liveness probe
 *   POST /v1/messages                  — auth; translate + generate
 *   POST /v1/messages/count_tokens     — auth; local token estimate
 *   GET  /v1/models                     — auth; public model catalog
 *   GET  /v1/models/:id                 — auth; single model
 *   GET  /v1/status                     — auth; result/failure stats
 *   GET  /v1/usage                      — auth; token usage totals
 *   GET  /                              — 404 for anything else
 *
 * Auth middleware: `x-api-key` OR `Authorization: Bearer` must equal the token,
 * else an Anthropic-shaped `authentication_error` JSON (401).
 *
 * Model catalog: `installModels` builds a map of public IDs (prefix
 * `claude-luca-code-` + upstream slug) to the upstream {@link Model}, plus follows
 * `config.modelMap` aliases. `resolveModel` looks up by public id,
 * case-insensitively.
 *
 * `restrictRecursiveSubagentTools` strips the `agent` tool when the system
 * prompt carries the `cc_is_subagent=true` marker (prevents exponential
 * subagent fan-out). `attachClientRouting` derives a `prompt_cache_key` from
 * the `X-Claude-Code-Session-Id` header (sha256 of `luca_code_<session>`) so
 * per-session subscription gating serializes correctly upstream.
 *
 * This module owns only what is genuinely server-shaped — token minting, the
 * auth check, the model catalog, the router, and the `Bun.serve` lifecycle.
 * Every request body is handled by `gateway/handlers.ts`, which is the single
 * tested implementation; production and the suite therefore run the SAME code.
 * `restrictRecursiveSubagentTools` / `attachClientRouting` now live in
 * `handlers.ts` (breaking the former `handlers -> server` import cycle) and are
 * re-exported here.
 *
 * Schema-first (Zod owns the body defaults/validators, in handlers.ts),
 * functional style (closures/factory, no classes), Bun-native (no node:http /
 * express / dotenv). `generate`, `countTokens`, and `getCredentials` are
 * injected so the suite never touches the network or the disk credential store.
 */

import type { Config } from "../config";
import type { Credential } from "../auth/credentials";
import type { Request as ProtocolRequest } from "../protocol/types";
import type { Model } from "../provider/models";
import {
  anthropicError,
  createStatsTracker,
  handleCountTokens,
  handleMessages,
  handleModelById,
  handleModels,
  handleStatus,
  handleUsage,
  // The catalog key MUST come from the same helper `/v1/models` renders ids
  // with — two copies would let the advertised id and the lookup key drift.
  publicIdFor,
} from "./handlers";
import type { CountTokensFn, GenerateFn, HandlerDeps } from "./handlers";

/**
 * Re-exported request shaping helpers. Both now live in `./handlers` (so the
 * whole request surface sits in one module and there is no `handlers -> server`
 * import edge), but they stay importable from `./server` for callers and tests
 * that already reference them here.
 */
export { restrictRecursiveSubagentTools, attachClientRouting } from "./handlers";

/**
 * Local alias for the protocol {@link ProtocolRequest} — the Anthropic
 * Messages request. Used throughout this module to avoid clashing with the
 * global `Request` (fetch) type in the HTTP handler.
 */
export type MessagesRequest = ProtocolRequest;

/* -------------------------------------------------------------------------- */
/* public option / return types                                               */
/* -------------------------------------------------------------------------- */

export type { CountTokensFn, GenerateFn };

/** Dependencies for {@link createGateway}. All network/IO is injectable. */
export interface GatewayDeps {
  config: Config;
  models?: Model[];
  getCredentials: () => Promise<Credential | null>;
  generate: GenerateFn;
  countTokens: CountTokensFn;
}

/**
 * Bun's hard upper bound for `Bun.serve({ idleTimeout })`, in seconds. Passing
 * more throws `Bun.serve expects idleTimeout to be 255 or less`.
 */
export const BUN_MAX_IDLE_TIMEOUT_SEC = 255;

/**
 * Seconds of headroom between the app-level request timeout and the socket
 * idle timeout, so the former always fires first.
 */
export const IDLE_TIMEOUT_GRACE_SEC = 15;

/**
 * Socket idle timeout (seconds) for the gateway's `Bun.serve`.
 *
 * WHY THIS EXISTS: `Bun.serve` defaults `idleTimeout` to **10 seconds** and, on
 * expiry, resets the connection rather than returning a response — the client
 * sees a bare `ECONNRESET`. A reasoning model routinely takes longer than 10s to
 * produce its first token, and until that token arrives the gateway has written
 * nothing, so the socket is idle by Bun's definition. Leaving this unset makes
 * every slow-to-first-token request fail with
 * `API Error: Unable to connect to API (ECONNRESET)`.
 *
 * We derive it from the authoritative `requestTimeoutSec` plus
 * {@link IDLE_TIMEOUT_GRACE_SEC} so the gateway's own
 * `AbortSignal.timeout(config.requestTimeout)` always fires FIRST and the client
 * gets a well-formed Anthropic error instead of a severed socket.
 *
 * Clamped to {@link BUN_MAX_IDLE_TIMEOUT_SEC}. Note the consequence at the
 * clamp: with `requestTimeoutSec >= 240` the socket timeout can no longer sit
 * above the request timeout, so Bun wins and such requests still reset. That is
 * a Bun ceiling, not a choice — configure `LUCA_CODE_REQUEST_TIMEOUT_SEC` below 240
 * to keep clean error reporting.
 */
export function gatewayIdleTimeoutSec(requestTimeoutSec: number): number {
  return Math.min(BUN_MAX_IDLE_TIMEOUT_SEC, requestTimeoutSec + IDLE_TIMEOUT_GRACE_SEC);
}

/** Gateway statistics returned by `stats()`. */
export interface GatewayStats {
  results: number;
  failures: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/** The gateway handle returned by {@link createGateway}. */
export interface Gateway {
  start(): Promise<void>;
  url(): string;
  token(): string;
  close(): void;
  installModels(models: Model[]): void;
  resolveModel(requested: string): Model | undefined;
  stats(): GatewayStats;
}

/* -------------------------------------------------------------------------- */
/* constants + helpers                                                         */
/* -------------------------------------------------------------------------- */

/** Generate a random 32-byte hex token (64 lowercase hex chars). */
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Anthropic authentication_error response (401). */
function authErrorResponse(): Response {
  return anthropicError(401, "authentication_error", "invalid x-api-key");
}

/* -------------------------------------------------------------------------- */
/* createGateway                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Build a loopback gateway. The token is minted eagerly so `token()` is valid
 * before `start()`. `start()` spins up `Bun.serve` on `127.0.0.1:0`; `close()`
 * stops it. Functional factory — no class.
 */
export function createGateway(deps: GatewayDeps): Gateway {
  const token = randomToken();

  // Catalog state — lowercase public id -> upstream Model.
  let catalog = new Map<string, Model>();
  let defaultModel: Model | undefined;

  // Result/failure + token-usage accounting, shared with the handlers.
  const tracker = createStatsTracker();

  function installModels(models: Model[]): void {
    const next = new Map<string, Model>();
    let def: Model | undefined;
    for (const m of models) {
      const pub = publicIdFor(m).toLowerCase();
      next.set(pub, m);
      if (m.Default) def = m;
    }
    if (!def && models.length > 0) def = models[0];
    catalog = next;
    defaultModel = def;
  }

  function resolveModel(requested: string): Model | undefined {
    if (!requested) return defaultModel;
    let key = requested.toLowerCase();
    // Follow config.modelMap alias chain (bounded to avoid cycles).
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      if (seen.has(key)) break;
      seen.add(key);
      const mapped = deps.config.modelMap[key];
      if (typeof mapped === "string" && mapped.toLowerCase() !== key) {
        key = mapped.toLowerCase();
      } else {
        break;
      }
    }
    return catalog.get(key);
  }

  /* ---------------------------------------------------------------------- */
  /* auth + body helpers                                                     */
  /* ---------------------------------------------------------------------- */

  function checkAuth(req: Request): boolean {
    const xKey = req.headers.get("x-api-key");
    if (xKey !== null && xKey === token) return true;
    const auth = req.headers.get("authorization");
    if (auth !== null && auth.startsWith("Bearer ")) {
      const bearer = auth.slice("Bearer ".length);
      if (bearer === token) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------------- */
  /* handler deps — the live view handed to gateway/handlers.ts               */
  /* ---------------------------------------------------------------------- */

  /**
   * Build the {@link HandlerDeps} for one request. Rebuilt per call so the
   * model catalog reflects the latest {@link installModels}, and so the
   * handlers always see the current injected `generate` / `countTokens`.
   */
  function handlerDeps(): HandlerDeps {
    return {
      config: deps.config,
      models: Array.from(catalog.values()),
      resolveModel,
      getCredentials: deps.getCredentials,
      generate: deps.generate,
      countTokens: deps.countTokens,
      tracker,
    };
  }

  function handleHealth(): Response {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  /* ---------------------------------------------------------------------- */
  /* router                                                                  */
  /* ---------------------------------------------------------------------- */

  async function route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (method === "GET" && path === "/health") return handleHealth();
    if (method === "POST" && path === "/v1/messages") {
      if (!checkAuth(req)) return authErrorResponse();
      return handleMessages(req, handlerDeps());
    }
    if (method === "POST" && path === "/v1/messages/count_tokens") {
      if (!checkAuth(req)) return authErrorResponse();
      return handleCountTokens(req, handlerDeps());
    }
    if (method === "GET" && path === "/v1/models") {
      if (!checkAuth(req)) return authErrorResponse();
      return handleModels(handlerDeps());
    }
    if (method === "GET" && path.startsWith("/v1/models/")) {
      if (!checkAuth(req)) return authErrorResponse();
      const id = decodeURIComponent(path.slice("/v1/models/".length));
      return handleModelById(id, handlerDeps());
    }
    if (method === "GET" && path === "/v1/status") {
      if (!checkAuth(req)) return authErrorResponse();
      return handleStatus(handlerDeps());
    }
    if (method === "GET" && path === "/v1/usage") {
      if (!checkAuth(req)) return authErrorResponse();
      return handleUsage(handlerDeps());
    }
    return anthropicError(404, "not_found_error", "not found");
  }

  /* ---------------------------------------------------------------------- */
  /* server lifecycle                                                        */
  /* ---------------------------------------------------------------------- */

  let server: ReturnType<typeof Bun.serve> | null = null;

  async function start(): Promise<void> {
    if (server) return;
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      // MUST be set explicitly. Bun defaults to 10s and resets the socket on
      // expiry — see gatewayIdleTimeoutSec.
      idleTimeout: gatewayIdleTimeoutSec(deps.config.requestTimeoutSec),
      fetch: (req: Request) => route(req),
    });
  }

  function close(): void {
    if (server) {
      server.stop();
      server = null;
    }
  }

  function url(): string {
    if (!server) return "";
    return `http://${server.hostname}:${server.port}`;
  }

  // Install the initial catalog if provided.
  if (deps.models && deps.models.length > 0) {
    installModels(deps.models);
  }

  return {
    start,
    url,
    token: () => token,
    close,
    installModels,
    resolveModel,
    stats: () => ({ ...tracker.stats }),
  };
}