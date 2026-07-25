/**
 * test/gateway-handlers.test.ts — TDD suite for gateway/handlers.ts + stream.ts
 * (step 13/18).
 *
 * Exercises the extracted Anthropic-shaped request handlers and the SSE stream
 * writer without spinning up Bun.serve: each handler is invoked with a fetch
 * `Request` and an injectable `HandlerDeps` (fake generate / countTokens /
 * getCredentials / resolveModel). The stream writer is driven both end-to-end
 * (via a fake generate that emits collector-shaped events) and at the unit
 * level (each event-writer helper).
 */

import { test, expect, describe } from "bun:test";

import {
  anthropicError,
  providerErrorType,
  messageResponse,
  handleMessages,
  handleCountTokens,
  handleModels,
  handleStatus,
  handleUsage,
  readJsonBody,
  createStatsTracker,
  type HandlerDeps,
} from "../src/gateway/handlers";
import {
  startStream,
  emitContentBlockStart,
  emitDelta,
  emitContentBlockStop,
  emitMessageDelta,
  emitMessageStop,
  streamMessages,
  createSSEWriter,
  type SSEWriter,
} from "../src/gateway/stream";
import type { Model } from "../src/provider/models";
import type { Request as ProtocolRequest, Result, Usage, EmitFunc } from "../src/protocol/types";
import type { Credential } from "../src/auth/credentials";
import { loadConfig } from "../src/config";

/* -------------------------------------------------------------------------- */
/* fixtures / helpers                                                         */
/* -------------------------------------------------------------------------- */

function makeCred(): Credential {
  return {
    type: "openai_account_oauth",
    method: "chatgpt_headless",
    access: "access-1",
    refresh: "refresh-1",
    expires_at: Date.now() + 3_600_000,
    account_id: "acct-1",
    id_token: "idtoken",
  };
}

function makeModel(id: string, displayName = id): Model {
  return {
    id,
    displayName,
    description: `desc for ${id}`,
    efforts: ["low", "medium", "high"],
    inputModalities: ["text", "image"],
    contextWindow: 200_000,
    toolCall: true,
    attachment: true,
    Default: false,
  };
}

function sampleModels(): Model[] {
  const gpt = makeModel("gpt-5", "GPT-5");
  const sonnet = makeModel("gpt-5-sonnet", "GPT-5 Sonnet");
  gpt.Default = true;
  return [gpt, sonnet];
}

function makeResult(model: string): Result {
  return {
    model,
    blocks: [{ type: "text", text: "hello there" }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 11,
      output_tokens: 3,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

function baseReq(overrides: Partial<ProtocolRequest> = {}): ProtocolRequest {
  return {
    model: "claude-luca-code-gpt-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: "hi" }],
    system: "you are helpful",
    tools: [],
    tool_choice: null,
    stop_sequences: [],
    stream: false,
    thinking: null,
    output_config: null,
    output_format: null,
    metadata: null,
    ...overrides,
  };
}

/** Build a fetch-style Request pointing at the given path with a JSON body. */
function buildRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  method = "POST",
): Request {
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}

/** Build deps with a fake generate that records calls and returns a Result. */
function makeDeps(opts: {
  result?: Result;
  models?: Model[];
  failWith?: Error;
  emitSequence?: EmitFunc;
}): { deps: HandlerDeps; calls: { model: string; req: ProtocolRequest }[] } {
  const calls = [] as { model: string; req: ProtocolRequest }[];
  const result = opts.result ?? makeResult("gpt-5");
  const models = opts.models ?? sampleModels();
  const catalog = new Map<string, Model>();
  let def: Model | undefined;
  for (const m of models) {
    catalog.set(`claude-luca-code-${m.id}`.toLowerCase(), m);
    if (m.Default) def = m;
  }
  if (!def && models.length > 0) def = models[0];
  const deps: HandlerDeps = {
    config: loadConfig({}),
    models,
    tracker: createStatsTracker(),
    resolveModel: (requested: string) => {
      if (!requested) return def;
      return catalog.get(requested.toLowerCase());
    },
    getCredentials: async () => makeCred(),
    generate: async (gopts) => {
      calls.push({ model: gopts.model, req: gopts.req });
      if (opts.failWith) throw opts.failWith;
      // Drive the emit callback with the provided sequence (for stream tests).
      if (opts.emitSequence && typeof gopts.emit === "function") {
        // Emit a minimal collector-shaped event sequence.
        const emit = gopts.emit;
        await emit({
          type: "message_start",
          message: {
            id: "resp_123",
            type: "message",
            role: "assistant",
            model: gopts.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 5, output_tokens: 0 },
          },
        });
        await emit({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
        await emit({ type: "text_delta", index: 0, text: "hello " });
        await emit({ type: "text_delta", index: 0, text: "there" });
        await emit({ type: "content_block_stop", index: 0 });
        await emit({
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 2 },
        });
        await emit({ type: "message_stop" });
      }
      return result;
    },
    countTokens: (req: ProtocolRequest) => ({ count: 42, estimated: true }),
  };
  return { deps, calls };
}

async function json(res: Response): Promise<any> {
  return res.json();
}

/** Collect every SSE frame out of a streaming Response body. */
async function collectSSE(res: Response): Promise<string> {
  const buf = await res.text();
  return buf;
}

/* -------------------------------------------------------------------------- */
/* anthropicError + providerErrorType                                         */
/* -------------------------------------------------------------------------- */

describe("anthropicError", () => {
  test("returns the Anthropic error envelope with the given status", async () => {
    const res = anthropicError(400, "invalid_request_error", "bad body");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await json(res);
    expect(body).toEqual({
      type: "error",
      error: { type: "invalid_request_error", message: "bad body" },
    });
  });
});

describe("providerErrorType", () => {
  test.each([
    [400, "invalid_request_error"],
    [401, "authentication_error"],
    [403, "permission_error"],
    [404, "not_found_error"],
    [413, "request_too_large"],
    [429, "rate_limit_error"],
    [500, "api_error"],
    [502, "api_error"],
    [503, "api_error"],
    [504, "api_error"],
    [418, "api_error"],
  ])("maps HTTP %i -> %s", (status, expected) => {
    expect(providerErrorType(status)).toBe(expected);
  });
});

/* -------------------------------------------------------------------------- */
/* messageResponse                                                            */
/* -------------------------------------------------------------------------- */

describe("messageResponse", () => {
  test("builds the Anthropic message JSON response from a Result", async () => {
    const result = makeResult("gpt-5");
    const res = messageResponse(result, "claude-luca-code-gpt-5");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await json(res);
    expect(body.type).toBe("message");
    expect(body.role).toBe("assistant");
    expect(body.model).toBe("claude-luca-code-gpt-5");
    expect(Array.isArray(body.content)).toBe(true);
    expect(body.content[0].type).toBe("text");
    expect(body.content[0].text).toBe("hello there");
    expect(body.stop_reason).toBe("end_turn");
    expect(body.usage.input_tokens).toBe(11);
    expect(body.usage.output_tokens).toBe(3);
    expect(typeof body.id).toBe("string");
    expect(body.id.startsWith("msg_")).toBe(true);
  });

  test("mints a fresh message id per call", async () => {
    const result = makeResult("gpt-5");
    const a = await json(messageResponse(result, "m"));
    const b = await json(messageResponse(result, "m"));
    expect(a.id).not.toBe(b.id);
  });
});

/* -------------------------------------------------------------------------- */
/* readJsonBody (maxBytesReader)                                              */
/* -------------------------------------------------------------------------- */

describe("readJsonBody", () => {
  test("parses a valid JSON body", async () => {
    const req = buildRequest("/v1/messages", { model: "x", max_tokens: 1, messages: [] });
    const out = await readJsonBody(req, 10 * 1024 * 1024);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.json).toEqual({ model: "x", max_tokens: 1, messages: [] });
      expect(out.bytes).toBeGreaterThan(0);
    }
  });

  test("rejects an oversized body with 413", async () => {
    const big = "x".repeat(1024);
    const req = buildRequest("/v1/messages", { big });
    const out = await readJsonBody(req, 512);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.res.status).toBe(413);
      const body = await json(out.res);
      expect(body.error.type).toBe("request_too_large");
    }
  });

  test("rejects invalid JSON with 400", async () => {
    const req = new Request("http://127.0.0.1/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const out = await readJsonBody(req, 10 * 1024 * 1024);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.res.status).toBe(400);
      const body = await json(out.res);
      expect(body.error.type).toBe("invalid_request_error");
    }
  });

  test("empty body parses to {}", async () => {
    const req = new Request("http://127.0.0.1/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
    });
    const out = await readJsonBody(req, 10 * 1024 * 1024);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.json).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */
/* readJsonBody — streaming byte cap (todo #11)                               */
/* -------------------------------------------------------------------------- */

describe("readJsonBody (streaming byte cap)", () => {
  /**
   * Build a Request whose body is a ReadableStream of `chunks` x `size`-byte
   * chunks, tracking how many pulls happened and whether the stream was
   * cancelled. `extraHeaders` lets a test declare a content-length.
   */
  function streamedRequest(
    chunks: number,
    size: number,
    extraHeaders: Record<string, string> = {},
  ): { req: Request; counters: { pulled: number; cancelled: boolean } } {
    const counters = { pulled: 0, cancelled: false };
    const payload = new TextEncoder().encode("x".repeat(size));
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        counters.pulled++;
        if (counters.pulled > chunks) {
          c.close();
          return;
        }
        c.enqueue(payload);
      },
      cancel() {
        counters.cancelled = true;
      },
    });
    const req = new Request("http://127.0.0.1/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body,
      duplex: "half",
    } as RequestInit);
    return { req, counters };
  }

  test("stops reading and cancels the body once maxBytes is exceeded", async () => {
    const { req, counters } = streamedRequest(500, 1024);
    const out = await readJsonBody(req, 4096);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.res.status).toBe(413);
      const body = await json(out.res);
      expect(body.error.type).toBe("request_too_large");
    }
    // 4096 / 1024 = 4 chunks to reach the cap, +1 to exceed it, +1 slack for
    // the reader's internal queueing. Anything near 500 means the whole body
    // was buffered before the check.
    expect(counters.pulled).toBeLessThanOrEqual(6);
    expect(counters.cancelled).toBe(true);
  });

  test("rejects on content-length without reading the body at all", async () => {
    const { req, counters } = streamedRequest(500, 1024, {
      "content-length": String(20 * 1024 * 1024),
    });
    // Bun's ReadableStream primes itself with one eager pull as soon as the
    // microtask queue drains, independently of any reader. Snapshot that
    // baseline so the assertion measures only the pulls readJsonBody causes.
    await Promise.resolve();
    const baseline = counters.pulled;
    const out = await readJsonBody(req, 10 * 1024 * 1024);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.res.status).toBe(413);
      const body = await json(out.res);
      expect(body.error.type).toBe("request_too_large");
    }
    expect(counters.pulled - baseline).toBe(0);
  });

  test("a body of exactly maxBytes is accepted", async () => {
    const text = JSON.stringify({ model: "x", pad: "y".repeat(64) });
    const n = new TextEncoder().encode(text).byteLength;
    const req = new Request("http://127.0.0.1/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
    });
    const out = await readJsonBody(req, n);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.bytes).toBe(n);
      expect(out.json).toEqual({ model: "x", pad: "y".repeat(64) });
    }
  });

  test("a body one byte over maxBytes is rejected", async () => {
    const text = JSON.stringify({ model: "x", pad: "y".repeat(64) });
    const n = new TextEncoder().encode(text).byteLength;
    const req = new Request("http://127.0.0.1/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
    });
    const out = await readJsonBody(req, n - 1);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.res.status).toBe(413);
  });

  test("a null body still parses to {}", async () => {
    const req = new Request("http://127.0.0.1/v1/messages", { method: "POST" });
    const out = await readJsonBody(req, 1024);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.json).toEqual({});
      expect(out.bytes).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* handleMessages — non-streaming                                             */
/* -------------------------------------------------------------------------- */

describe("handleMessages (non-stream)", () => {
  test("returns Anthropic message JSON for a valid request", async () => {
    const { deps, calls } = makeDeps({});
    const req = buildRequest("/v1/messages", baseReq());
    const res = await handleMessages(req, deps);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.type).toBe("message");
    expect(body.role).toBe("assistant");
    expect(body.stop_reason).toBe("end_turn");
    expect(body.usage.input_tokens).toBe(11);
    // generate received the resolved upstream model id
    expect(calls[0]?.model).toBe("gpt-5");
  });

  test("rejects when no credentials available (503 api_error)", async () => {
    const { deps } = makeDeps({});
    deps.getCredentials = async () => null;
    const req = buildRequest("/v1/messages", baseReq());
    const res = await handleMessages(req, deps);
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.error.type).toBe("api_error");
  });

  test("unknown model -> 404 not_found_error", async () => {
    const { deps } = makeDeps({});
    const req = buildRequest("/v1/messages", baseReq({ model: "claude-luca-code-nope" }));
    const res = await handleMessages(req, deps);
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error.type).toBe("not_found_error");
  });

  test("oversized body -> 413", async () => {
    const { deps } = makeDeps({});
    const big = "x".repeat(11 * 1024 * 1024);
    const req = buildRequest("/v1/messages", { ...baseReq(), messages: [{ role: "user", content: big }] });
    const res = await handleMessages(req, deps);
    expect(res.status).toBe(413);
  });

  test("invalid JSON -> 400 invalid_request_error", async () => {
    const { deps } = makeDeps({});
    const req = new Request("http://127.0.0.1/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad",
    });
    const res = await handleMessages(req, deps);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error.type).toBe("invalid_request_error");
  });

  test("generate failure -> 502 with provider-mapped error type for upstream status", async () => {
    const { deps } = makeDeps({ failWith: Object.assign(new Error("boom"), { status: 429 }) });
    const req = buildRequest("/v1/messages", baseReq());
    const res = await handleMessages(req, deps);
    expect(res.status).toBe(502);
    const body = await json(res);
    expect(body.error.type).toBe("rate_limit_error");
    expect(body.error.message).toContain("boom");
  });

  test("generate failure with no status -> 502 api_error", async () => {
    const { deps } = makeDeps({ failWith: new Error("boom") });
    const req = buildRequest("/v1/messages", baseReq());
    const res = await handleMessages(req, deps);
    expect(res.status).toBe(502);
    const body = await json(res);
    expect(body.error.type).toBe("api_error");
  });

  test("strips the agent tool for recursive subagent calls", async () => {
    const { deps, calls } = makeDeps({});
    const req = buildRequest("/v1/messages", {
      ...baseReq(),
      system: "preamble cc_is_subagent=true more",
      tools: [
        { type: "custom", name: "agent", description: "d", input_schema: {} },
        { type: "custom", name: "bash", description: "d", input_schema: {} },
      ],
    });
    await handleMessages(req, deps);
    expect(calls[0]?.req.tools.map((t) => t.name)).toEqual(["bash"]);
  });

  test("derives prompt_cache_key from X-Claude-Code-Session-Id", async () => {
    const { deps, calls } = makeDeps({});
    const req = buildRequest("/v1/messages", baseReq(), { "x-claude-code-session-id": "sess-1" });
    await handleMessages(req, deps);
    expect(typeof calls[0]?.req.prompt_cache_key).toBe("string");
    expect(calls[0]?.req.prompt_cache_key!.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* handleMessages — cancellation + request timeout (todo #4)                  */
/* -------------------------------------------------------------------------- */

describe("handleMessages (cancellation + timeout)", () => {
  test("forwards a signal derived from the incoming Request.signal", async () => {
    const { deps } = makeDeps({});
    let seen: AbortSignal | undefined;
    deps.generate = async (_opts, gdeps) => {
      seen = gdeps?.signal;
      return makeResult("gpt-5");
    };
    const ac = new AbortController();
    const req = new Request("http://127.0.0.1/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseReq()),
      signal: ac.signal,
    });
    const res = await handleMessages(req, deps);
    expect(res.status).toBe(200);
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen!.aborted).toBe(false);
    // Aborting the client request must abort the forwarded signal — proving it
    // is COMPOSED from req.signal, not a fresh unrelated signal.
    ac.abort();
    expect(seen!.aborted).toBe(true);
  });

  test("forwards the production provider binding alongside the signal", async () => {
    const { deps } = makeDeps({});
    let seen: Record<string, unknown> | undefined;
    deps.generate = async (_opts, gdeps) => {
      seen = gdeps as unknown as Record<string, unknown>;
      return makeResult("gpt-5");
    };
    const req = buildRequest("/v1/messages", baseReq());
    await handleMessages(req, deps);
    expect(seen).toBeDefined();
    expect(seen!["profileDir"]).toBe(deps.config.profileDir);
    expect(seen!["originator"]).toBe(deps.config.originator);
    expect(typeof seen!["ua"]).toBe("string");
    expect(typeof seen!["version"]).toBe("string");
  });

  test("a generate that never settles is aborted after config.requestTimeout and returns 504", async () => {
    const { deps } = makeDeps({});
    deps.config = { ...deps.config, requestTimeout: 50 };
    deps.generate = (_opts, gdeps) =>
      new Promise<Result>((_res, rej) => {
        gdeps?.signal?.addEventListener(
          "abort",
          () => rej((gdeps.signal as AbortSignal).reason),
          { once: true },
        );
      });
    const started = Date.now();
    const res = await handleMessages(buildRequest("/v1/messages", baseReq()), deps);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(res.status).toBe(504);
    const body = await json(res);
    expect(body.error.type).toBe("api_error");
    expect(body.error.message).toContain("timed out");
    expect(deps.tracker.stats.failures).toBe(1);
    expect(deps.tracker.stats.results).toBe(0);
  });

  test("a client abort records a failure and does not resolve as a success", async () => {
    const { deps } = makeDeps({});
    deps.generate = (_opts, gdeps) =>
      new Promise<Result>((_res, rej) => {
        gdeps?.signal?.addEventListener(
          "abort",
          () => rej((gdeps.signal as AbortSignal).reason),
          { once: true },
        );
      });
    const ac = new AbortController();
    const req = new Request("http://127.0.0.1/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseReq()),
      signal: ac.signal,
    });
    const pending = handleMessages(req, deps);
    await Bun.sleep(10);
    ac.abort();
    const res = await pending;
    expect(res.status).not.toBe(200);
    expect(deps.tracker.stats.failures).toBe(1);
    expect(deps.tracker.stats.results).toBe(0);
  });

  test("streamMessages forwards the signal into the generate deps", async () => {
    const ac = new AbortController();
    let seen: AbortSignal | undefined;
    const res = await streamMessages(
      {
        req: baseReq({ stream: true }),
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 4,
        signal: ac.signal,
      },
      async (_opts, gdeps) => {
        seen = gdeps?.signal;
        return makeResult("gpt-5");
      },
    );
    await res.text();
    expect(seen).toBe(ac.signal);
  });

  test("streamMessages forwards generateDeps alongside the signal", async () => {
    const ac = new AbortController();
    let seen: Record<string, unknown> | undefined;
    const res = await streamMessages(
      {
        req: baseReq({ stream: true }),
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 4,
        signal: ac.signal,
        generateDeps: { profileDir: "/p", originator: "orig" },
      },
      async (_opts, gdeps) => {
        seen = gdeps as unknown as Record<string, unknown>;
        return makeResult("gpt-5");
      },
    );
    await res.text();
    expect(seen!["profileDir"]).toBe("/p");
    expect(seen!["originator"]).toBe("orig");
    expect(seen!["signal"]).toBe(ac.signal);
  });

  test("the streaming branch of handleMessages forwards the composed signal too", async () => {
    const { deps } = makeDeps({});
    let seen: AbortSignal | undefined;
    deps.generate = async (_opts, gdeps) => {
      seen = gdeps?.signal;
      return makeResult("gpt-5");
    };
    const ac = new AbortController();
    const req = new Request("http://127.0.0.1/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseReq({ stream: true })),
      signal: ac.signal,
    });
    const res = await handleMessages(req, deps);
    await res.text();
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen!.aborted).toBe(false);
    ac.abort();
    expect(seen!.aborted).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* handleMessages — streaming                                                 */
/* -------------------------------------------------------------------------- */

describe("handleMessages (stream)", () => {
  test("returns text/event-stream with SSE frames", async () => {
    const { deps } = makeDeps({ emitSequence: (() => {}) as unknown as EmitFunc });
    const req = buildRequest("/v1/messages", { ...baseReq(), stream: true });
    const res = await handleMessages(req, deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await collectSSE(res);
    expect(text).toContain("event: message_start");
    expect(text).toContain("event: content_block_start");
    expect(text).toContain("event: content_block_delta");
    expect(text).toContain("event: content_block_stop");
    expect(text).toContain("event: message_delta");
    expect(text).toContain("event: message_stop");
  });
});

/* -------------------------------------------------------------------------- */
/* handleCountTokens                                                          */
/* -------------------------------------------------------------------------- */

describe("handleCountTokens", () => {
  test("returns input_tokens from countTokens", async () => {
    const { deps } = makeDeps({});
    const req = buildRequest("/v1/messages/count_tokens", baseReq());
    const res = await handleCountTokens(req, deps);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe("msg_count_tokens");
    expect(body.input_tokens).toBe(42);
  });

  test("sets X-luca-code-Token-Count-Estimated header", async () => {
    const { deps } = makeDeps({});
    const req = buildRequest("/v1/messages/count_tokens", baseReq());
    const res = await handleCountTokens(req, deps);
    expect(res.headers.get("x-luca-code-token-count-estimated")).toBe("true");
  });

  test("invalid JSON -> 400", async () => {
    const { deps } = makeDeps({});
    const req = new Request("http://127.0.0.1/v1/messages/count_tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad",
    });
    const res = await handleCountTokens(req, deps);
    expect(res.status).toBe(400);
  });
});

/* -------------------------------------------------------------------------- */
/* handleModels                                                               */
/* -------------------------------------------------------------------------- */

describe("handleModels", () => {
  test("returns Anthropic-shaped /v1/models with display_name, efforts, input_modalities, created_at", async () => {
    const { deps } = makeDeps({});
    const res = handleModels(deps);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.has_more).toBe(false);
    const entry = body.data[0];
    expect(entry.id).toBe("claude-luca-code-gpt-5");
    expect(entry.type).toBe("model");
    expect(entry.display_name).toBe("GPT-5");
    expect(Array.isArray(entry.efforts)).toBe(true);
    expect(entry.efforts).toEqual(["low", "medium", "high"]);
    expect(Array.isArray(entry.input_modalities)).toBe(true);
    expect(entry.input_modalities).toEqual(["text", "image"]);
    expect(typeof entry.created_at).toBe("number");
  });

  test("every entry carries the canonical fields", async () => {
    const { deps } = makeDeps({});
    const body = await json(handleModels(deps));
    for (const m of body.data) {
      expect(typeof m.id).toBe("string");
      expect(typeof m.display_name).toBe("string");
      expect(Array.isArray(m.efforts)).toBe(true);
      expect(Array.isArray(m.input_modalities)).toBe(true);
      expect(typeof m.created_at).toBe("number");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* handleStatus + handleUsage                                                 */
/* -------------------------------------------------------------------------- */

describe("handleStatus + handleUsage", () => {
  test("handleStatus returns the stats counters", async () => {
    const { deps } = makeDeps({});
    const req = buildRequest("/v1/messages", baseReq());
    await handleMessages(req, deps); // records a result
    const res = handleStatus(deps);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.results).toBe(1);
    expect(body.failures).toBe(0);
    expect(body.totalInputTokens).toBe(11);
    expect(body.totalOutputTokens).toBe(3);
  });

  test("handleUsage returns the usage totals", async () => {
    const { deps } = makeDeps({});
    const req = buildRequest("/v1/messages", baseReq());
    await handleMessages(req, deps);
    const res = handleUsage(deps);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total_input_tokens).toBe(11);
    expect(body.total_output_tokens).toBe(3);
  });

  test("handleUsage reflects failures too (no usage added)", async () => {
    const { deps } = makeDeps({ failWith: new Error("boom") });
    const req = buildRequest("/v1/messages", baseReq());
    await handleMessages(req, deps);
    const res = handleUsage(deps);
    const body = await json(res);
    expect(body.total_input_tokens).toBe(0);
    expect(body.total_output_tokens).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* stream event-writer helpers (unit level)                                  */
/* -------------------------------------------------------------------------- */

describe("stream event-writer helpers", () => {
  // A capturing writer stands in for the ReadableStream controller.
  function captureWriter(): { w: SSEWriter; frames: string[] } {
    const frames: string[] = [];
    const w: SSEWriter = {
      write(event, value) {
        frames.push(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
      },
    };
    return { w, frames };
  }

  /** Parse the `data:` JSON payload out of a captured SSE frame. */
  function parseFrame(frame: string): any {
    const dataIdx = frame.indexOf("data: ");
    return JSON.parse(frame.slice(dataIdx + 6).trim());
  }

  test("startStream emits message_start with msg_id + zero usage", () => {
    const { w, frames } = captureWriter();
    const usage: Usage = { input_tokens: 0, output_tokens: 0 };
    startStream(w, "msg_abc", "claude-luca-code-gpt-5", usage);
    expect(frames.length).toBe(1);
    expect(frames[0]).toContain("event: message_start");
    const parsed = parseFrame(frames[0] ?? "");
    expect(parsed.type).toBe("message_start");
    expect(parsed.message.id).toBe("msg_abc");
    expect(parsed.message.type).toBe("message");
    expect(parsed.message.role).toBe("assistant");
    expect(parsed.message.model).toBe("claude-luca-code-gpt-5");
    expect(parsed.message.usage.input_tokens).toBe(0);
    expect(parsed.message.usage.output_tokens).toBe(0);
    expect(parsed.message.stop_reason).toBeNull();
  });

  test("emitContentBlockStart emits content_block_start with index + block", () => {
    const { w, frames } = captureWriter();
    emitContentBlockStart(w, 1, { type: "text", text: "" });
    expect(frames[0]).toContain("event: content_block_start");
    const parsed = parseFrame(frames[0] ?? "");
    expect(parsed.index).toBe(1);
    expect(parsed.content_block.type).toBe("text");
  });

  test("emitDelta emits text_delta", () => {
    const { w, frames } = captureWriter();
    emitDelta(w, "text_delta", 0, { text: "hi" });
    expect(frames[0]).toContain("event: content_block_delta");
    const parsed = parseFrame(frames[0] ?? "");
    expect(parsed.type).toBe("content_block_delta");
    expect(parsed.index).toBe(0);
    expect(parsed.delta.type).toBe("text_delta");
    expect(parsed.delta.text).toBe("hi");
  });

  test("emitDelta emits thinking_delta", () => {
    const { w, frames } = captureWriter();
    emitDelta(w, "thinking_delta", 0, { thinking: "hmm" });
    const parsed = parseFrame(frames[0] ?? "");
    expect(parsed.type).toBe("content_block_delta");
    expect(parsed.delta.type).toBe("thinking_delta");
    expect(parsed.delta.thinking).toBe("hmm");
  });

  test("emitDelta emits signature_delta", () => {
    const { w, frames } = captureWriter();
    emitDelta(w, "signature_delta", 0, { signature: "sig" });
    const parsed = parseFrame(frames[0] ?? "");
    expect(parsed.type).toBe("content_block_delta");
    expect(parsed.delta.type).toBe("signature_delta");
    expect(parsed.delta.signature).toBe("sig");
  });

  test("emitDelta emits input_json_delta", () => {
    const { w, frames } = captureWriter();
    emitDelta(w, "input_json_delta", 0, { partial_json: '{"a":' });
    const parsed = parseFrame(frames[0] ?? "");
    expect(parsed.type).toBe("content_block_delta");
    expect(parsed.delta.type).toBe("input_json_delta");
    expect(parsed.delta.partial_json).toBe('{"a":');
  });

  test("emitContentBlockStop emits content_block_stop with index", () => {
    const { w, frames } = captureWriter();
    emitContentBlockStop(w, 2);
    const parsed = parseFrame(frames[0] ?? "");
    expect(parsed.type).toBe("content_block_stop");
    expect(parsed.index).toBe(2);
  });

  test("emitMessageDelta emits stop_reason + usage", () => {
    const { w, frames } = captureWriter();
    emitMessageDelta(w, "end_turn", { output_tokens: 5 });
    const parsed = parseFrame(frames[0] ?? "");
    expect(parsed.type).toBe("message_delta");
    expect(parsed.delta.stop_reason).toBe("end_turn");
    expect(parsed.usage.output_tokens).toBe(5);
  });

  test("emitMessageStop emits message_stop", () => {
    const { w, frames } = captureWriter();
    emitMessageStop(w);
    const parsed = parseFrame(frames[0] ?? "");
    expect(parsed.type).toBe("message_stop");
  });
});

/* -------------------------------------------------------------------------- */
/* streamMessages (end-to-end)                                               */
/* -------------------------------------------------------------------------- */

describe("streamMessages", () => {
  test("returns a text/event-stream Response whose body carries the full event sequence", async () => {
    const { deps } = makeDeps({ emitSequence: (() => {}) as unknown as EmitFunc });
    // Resolve the upstream model first (matches how handleMessages calls it).
    const model = deps.resolveModel("claude-luca-code-gpt-5")!;
    const res = await streamMessages(
      {
        req: baseReq({ stream: true }),
        cred: makeCred(),
        model: model.id,
        defaultEffort: "medium",
        maxConcurrent: 4,
      },
      deps.generate,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    // The fake generate emits a full collector sequence; streamMessages must
    // forward each event as an SSE frame.
    expect(text).toMatch(/event: message_start/);
    expect(text).toMatch(/event: content_block_start/);
    expect(text).toMatch(/event: content_block_delta/);
    expect(text).toMatch(/event: content_block_stop/);
    expect(text).toMatch(/event: message_delta/);
    expect(text).toMatch(/event: message_stop/);
  });

  /* ------------------------------------------------------------------ */
  /* failed streams must never carry a success terminator (todo #5)      */
  /* ------------------------------------------------------------------ */

  /** Extract the ordered `event:` names out of a raw SSE body. */
  function eventNames(text: string): string[] {
    return text
      .split("\n")
      .filter((l) => l.startsWith("event: "))
      .map((l) => l.slice("event: ".length));
  }

  /** Parse the `data:` payload of the first frame with the given event name. */
  function frameData(text: string, event: string): any {
    for (const block of text.split("\n\n")) {
      const lines = block.split("\n");
      if (lines[0] === `event: ${event}`) {
        return JSON.parse((lines[1] ?? "").slice("data: ".length));
      }
    }
    return undefined;
  }

  /** Drive streamMessages with an explicit emit script + optional throw. */
  async function runStream(
    script: (emit: EmitFunc) => Promise<void>,
    throwAfter?: unknown,
  ): Promise<{ text: string; tracker: ReturnType<typeof createStatsTracker> }> {
    const tracker = createStatsTracker();
    const res = await streamMessages(
      {
        req: baseReq({ stream: true }),
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 4,
      },
      async (gopts) => {
        await script(gopts.emit);
        if (throwAfter !== undefined) throw throwAfter;
        return makeResult("gpt-5");
      },
      tracker,
    );
    return { text: await res.text(), tracker };
  }

  /** The exact emit ordering the collector produces on `response.failed`. */
  const failedCollectorScript = async (emit: EmitFunc): Promise<void> => {
    await emit({
      type: "message_start",
      message: {
        id: "resp_1",
        type: "message",
        role: "assistant",
        model: "gpt-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 4, output_tokens: 0 },
      },
    });
    await emit({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    await emit({ type: "text_delta", index: 0, text: "partial" });
    await emit({ type: "content_block_stop", index: 0 });
    await emit({
      type: "message_delta",
      delta: { stop_reason: "StreamError", stop_sequence: null },
      usage: { output_tokens: 1 },
    });
    await emit({ type: "message_stop" });
  };

  test("a failed stream emits an error frame and never message_stop/message_delta", async () => {
    const { text, tracker } = await runStream(
      failedCollectorScript,
      Object.assign(new Error("stream failed"), {
        status: 502,
        type: "stream_error",
        body: "upstream said no",
      }),
    );
    expect(text).toContain("event: error");
    expect(text).toContain("partial");
    expect(text).not.toContain("event: message_stop");
    expect(text).not.toContain("event: message_delta");
    expect(tracker.stats.failures).toBe(1);
    expect(tracker.stats.results).toBe(0);
  });

  test("the error frame carries the upstream rejection body", async () => {
    const { text } = await runStream(
      failedCollectorScript,
      Object.assign(new Error("stream failed"), {
        status: 502,
        type: "stream_error",
        body: "upstream said no",
      }),
    );
    const data = frameData(text, "error");
    expect(data.type).toBe("error");
    expect(data.error.type).toBe("api_error");
    expect(data.error.message).toContain("stream failed");
    expect(data.error.message).toContain("upstream said no");
  });

  test("a successful stream still emits the terminators last, in order", async () => {
    const { text, tracker } = await runStream(async (emit) => {
      await emit({
        type: "message_start",
        message: {
          id: "resp_1",
          type: "message",
          role: "assistant",
          model: "gpt-5",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 4, output_tokens: 0 },
        },
      });
      await emit({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      await emit({ type: "text_delta", index: 0, text: "hello " });
      await emit({ type: "text_delta", index: 0, text: "there" });
      await emit({ type: "content_block_stop", index: 0 });
      await emit({
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 2 },
      });
      await emit({ type: "message_stop" });
    });
    expect(eventNames(text)).toEqual([
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
    expect(tracker.stats.results).toBe(1);
    expect(tracker.stats.failures).toBe(0);
  });

  test("a client that disconnects before the flush still books the successful result", async () => {
    // The upstream call SUCCEEDED and its tokens were really spent. Whether the
    // client is still listening must not turn that into a recorded failure with
    // zero usage — /v1/usage and /v1/status would under-report consumed tokens
    // and over-report failures.
    const tracker = createStatsTracker();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const res = await streamMessages(
      {
        req: baseReq({ stream: true }),
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 4,
      },
      async (gopts) => {
        // Emitted SYNCHRONOUSLY, exactly as the collector drives emit, so the
        // whole sequence is buffered/forwarded before the client can go away.
        const emit = gopts.emit;
        emit({
          type: "message_start",
          message: {
            id: "resp_1",
            type: "message",
            role: "assistant",
            model: "gpt-5",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 11, output_tokens: 0 },
          },
        });
        emit({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
        emit({ type: "text_delta", index: 0, text: "hello there" });
        emit({ type: "content_block_stop", index: 0 });
        // Buffered terminators — these are the writes that hit a dead controller.
        emit({
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { input_tokens: 11, output_tokens: 3 },
        });
        emit({ type: "message_stop" });
        await gate;
        return makeResult("gpt-5");
      },
      tracker,
    );

    const reader = res.body!.getReader();
    await reader.read();
    // The client goes away BEFORE generate resolves.
    await reader.cancel();
    release();
    await Bun.sleep(20);

    expect(tracker.stats.results).toBe(1);
    expect(tracker.stats.failures).toBe(0);
    expect(tracker.stats.totalInputTokens).toBe(11);
    expect(tracker.stats.totalOutputTokens).toBe(3);
  });

  test("message_delta with a null stop_reason forwards null, not end_turn", async () => {
    const { text } = await runStream(async (emit) => {
      await emit({
        type: "message_delta",
        delta: { stop_reason: null, stop_sequence: null },
        usage: { output_tokens: 0 },
      });
    });
    expect(frameData(text, "message_delta").delta.stop_reason).toBeNull();
  });

  test("message_delta drops the internal StreamError marker rather than forwarding it", async () => {
    const { text } = await runStream(async (emit) => {
      await emit({
        type: "message_delta",
        delta: { stop_reason: "StreamError", stop_sequence: null },
        usage: { output_tokens: 0 },
      });
    });
    expect(frameData(text, "message_delta").delta.stop_reason).toBeNull();
  });

  test("message_delta forwards every legal Anthropic stop_reason verbatim", async () => {
    for (const reason of [
      "end_turn",
      "max_tokens",
      "stop_sequence",
      "tool_use",
      "refusal",
      "pause_turn",
    ]) {
      const { text } = await runStream(async (emit) => {
        await emit({
          type: "message_delta",
          delta: { stop_reason: reason, stop_sequence: null },
          usage: { output_tokens: 0 },
        });
      });
      expect(frameData(text, "message_delta").delta.stop_reason).toBe(reason);
    }
  });

  test("message_delta forwards the FULL usage object, not just output_tokens", async () => {
    const { text } = await runStream(async (emit) => {
      await emit({
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: {
          input_tokens: 11,
          output_tokens: 3,
          cache_read_input_tokens: 7,
          cache_creation_input_tokens: 2,
        },
      });
    });
    expect(frameData(text, "message_delta").usage).toEqual({
      input_tokens: 11,
      output_tokens: 3,
      cache_read_input_tokens: 7,
      cache_creation_input_tokens: 2,
    });
  });

  test("createSSEWriter writes canonical event/data/blank framing", () => {
    let captured = "";
    const w = createSSEWriter({
      enqueue: (chunk: Uint8Array) => {
        captured += new TextDecoder().decode(chunk);
      },
    } as unknown as ReadableStreamDefaultController<Uint8Array>);
    w.write("ping", { hello: "world" });
    expect(captured).toBe('event: ping\ndata: {"hello":"world"}\n\n');
  });
});