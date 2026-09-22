/**
 * test/gateway-server.test.ts — TDD suite for gateway/server.ts (step 12).
 *
 * Exercises the loopback gateway: random token auth, routing, model catalog
 * install/resolve, recursive-subagent tool stripping, client-routing cache key
 * derivation, and result/failure stats. A fake generate + getCredentials keep
 * the suite fully offline; the gateway is started on a random loopback port via
 * Bun.serve and hit with real fetch calls.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";

import { createGateway, gatewayIdleTimeoutSec, BUN_MAX_IDLE_TIMEOUT_SEC } from "../src/gateway/server";
import type { Gateway, GatewayDeps } from "../src/gateway/server";
import {
  restrictRecursiveSubagentTools,
  attachClientRouting,
} from "../src/gateway/server";
import type { Model } from "../src/provider/models";
import type { Request, Result } from "../src/protocol/types";
import type { Credential } from "../src/auth/credentials";
import { loadConfig } from "../src/config";

/* -------------------------------------------------------------------------- */
/* helpers / fixtures                                                         */
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
    inputModalities: ["text"],
    contextWindow: 200_000,
    toolCall: true,
    attachment: false,
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

function baseReq(overrides: Partial<Request> = {}): Request {
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

/** Build deps with a fake generate that records calls and returns a fixed Result. */
function makeDeps(opts: {
  result?: Result;
  models?: Model[];
  failWith?: Error;
}): {
  deps: GatewayDeps;
  calls: { generateArgs: { model: string; req: Request }[] };
} {
  const generateArgs = [] as { model: string; req: Request }[];
  const calls = { generateArgs };
  const result = opts.result ?? makeResult("gpt-5");
  const deps: GatewayDeps = {
    config: loadConfig({}),
    models: opts.models ?? sampleModels(),
    getCredentials: async () => makeCred(),
    generate: async (gopts) => {
      generateArgs.push({ model: (gopts as { model: string }).model, req: (gopts as { req: Request }).req });
      if (opts.failWith) throw opts.failWith;
      return result;
    },
    countTokens: (req: Request) => ({ count: 42, estimated: true }),
  };
  return { deps, calls };
}

let gw: Gateway;
let base: string;
let tok: string;

async function startGateway(deps: GatewayDeps): Promise<Gateway> {
  const g = createGateway(deps);
  await g.start();
  gw = g;
  base = g.url();
  tok = g.token();
  return g;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "x-api-key": tok, "content-type": "application/json", ...extra };
}

/** Read a response body as a loosely-typed object (avoids `unknown` friction). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

beforeEach(async () => {
  const { deps } = makeDeps({});
  await startGateway(deps);
});

afterEach(() => {
  gw?.close();
});

/* -------------------------------------------------------------------------- */
/* token + url                                                                */
/* -------------------------------------------------------------------------- */

describe("gateway boot", () => {
  test("token is 32-byte hex (64 chars) and stable per gateway", () => {
    expect(tok).toMatch(/^[0-9a-f]{64}$/);
    expect(gw.token()).toBe(tok);
  });

  test("url is loopback http", () => {
    expect(base.startsWith("http://127.0.0.1:")).toBe(true);
  });

  test("two gateways get distinct tokens", async () => {
    const { deps } = makeDeps({});
    const g2 = createGateway(deps);
    await g2.start();
    expect(g2.token()).not.toBe(tok);
    g2.close();
  });
});

/* -------------------------------------------------------------------------- */
/* routing                                                                    */
/* -------------------------------------------------------------------------- */

describe("routing", () => {
  test("GET /health is public and returns ok", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe("ok");
  });

  test("GET / returns 404", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(404);
  });

  test("unknown path returns 404", async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/* auth                                                                       */
/* -------------------------------------------------------------------------- */

describe("auth middleware", () => {
  test("missing auth -> 401 Anthropic authentication_error", async () => {
    const res = await fetch(`${base}/v1/models`);
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("authentication_error");
  });

  test("wrong token -> 401", async () => {
    const res = await fetch(`${base}/v1/models`, { headers: { "x-api-key": "wrong" } });
    expect(res.status).toBe(401);
  });

  test("x-api-key equal to token passes", async () => {
    const res = await fetch(`${base}/v1/models`, { headers: { "x-api-key": tok } });
    expect(res.status).toBe(200);
  });

  test("Authorization Bearer equal to token passes", async () => {
    const res = await fetch(`${base}/v1/models`, { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
  });

  test("Authorization Bearer wrong -> 401", async () => {
    const res = await fetch(`${base}/v1/models`, { headers: { authorization: "Bearer wrong" } });
    expect(res.status).toBe(401);
  });

  test("/health does NOT require auth", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */
/* model catalog                                                              */
/* -------------------------------------------------------------------------- */

describe("model catalog", () => {
  test("/v1/models returns public IDs prefixed claude-luca-code-", async () => {
    const res = await fetch(`${base}/v1/models`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await json(res);
    const ids = body.data.map((m: { id: string }) => m.id);
    expect(ids).toContain("claude-luca-code-gpt-5");
    expect(ids).toContain("claude-luca-code-gpt-5-sonnet");
    expect(ids.every((id: string) => id.startsWith("claude-luca-code-"))).toBe(true);
  });

  test("every advertised /v1/models id resolves against the catalog", async () => {
    // The catalog key (installModels) and the advertised id (/v1/models) must
    // be produced by ONE public-id function. If they are computed by two
    // independent copies, changing the prefix in one place makes Claude Code
    // send an id the catalog has never heard of and every request 404s.
    const res = await fetch(`${base}/v1/models`, { headers: headers() });
    const body = await json(res);
    const ids = body.data.map((m: { id: string }) => m.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(gw.resolveModel(id)).toBeDefined();
    }
  });

  test("/v1/models/:id returns the model when known", async () => {
    const res = await fetch(`${base}/v1/models/claude-luca-code-gpt-5`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe("claude-luca-code-gpt-5");
  });

  test("/v1/models/:id is case-insensitive", async () => {
    const res = await fetch(`${base}/v1/models/CLAUDE-LUCA-CODE-GPT-5`, { headers: headers() });
    expect(res.status).toBe(200);
  });

  test("/v1/models/:id 404 for unknown", async () => {
    const res = await fetch(`${base}/v1/models/claude-luca-code-nope`, { headers: headers() });
    expect(res.status).toBe(404);
  });

  test("installModels rebuilds the catalog", () => {
    expect(gw.resolveModel("claude-luca-code-gpt-5")).toBeDefined();
    gw.installModels([makeModel("foo-bar")]);
    expect(gw.resolveModel("claude-luca-code-foo-bar")).toBeDefined();
    expect(gw.resolveModel("claude-luca-code-gpt-5")).toBeUndefined();
  });

  test("resolveModel maps public id to upstream Model", () => {
    const m = gw.resolveModel("claude-luca-code-gpt-5-sonnet");
    expect(m?.id).toBe("gpt-5-sonnet");
  });

  test("resolveModel is case-insensitive", () => {
    expect(gw.resolveModel("CLAUDE-LUCA-CODE-GPT-5")?.id).toBe("gpt-5");
  });

  test("resolveModel applies config.modelMap", async () => {
    gw.close();
    const { deps } = makeDeps({});
    deps.config = { ...deps.config, modelMap: { "claude-luca-code-alias": "claude-luca-code-gpt-5" } };
    await startGateway(deps);
    expect(gw.resolveModel("claude-luca-code-alias")?.id).toBe("gpt-5");
  });
});

/* -------------------------------------------------------------------------- */
/* /v1/status                                                                 */
/* -------------------------------------------------------------------------- */

describe("/v1/status", () => {
  test("requires auth and returns stats object", async () => {
    const res = await fetch(`${base}/v1/status`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("failures");
    expect(typeof body.results).toBe("number");
    expect(typeof body.failures).toBe("number");
  });

  test("unauthenticated -> 401", async () => {
    const res = await fetch(`${base}/v1/status`);
    expect(res.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/messages                                                          */
/* -------------------------------------------------------------------------- */

describe("POST /v1/messages", () => {
  test("auth + valid body returns Anthropic message JSON", async () => {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq()),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.type).toBe("message");
    expect(body.role).toBe("assistant");
    expect(Array.isArray(body.content)).toBe(true);
    expect(body.stop_reason).toBe("end_turn");
    expect(body.usage.input_tokens).toBe(11);
    expect(body.usage.output_tokens).toBe(3);
  });

  test("records a result in stats", async () => {
    await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq()),
    });
    const stats = gw.stats();
    expect(stats.results).toBe(1);
    expect(stats.failures).toBe(0);
    expect(stats.totalInputTokens).toBe(11);
    expect(stats.totalOutputTokens).toBe(3);
  });

  test("generate failure -> 502 and records failure in stats", async () => {
    gw.close();
    const { deps } = makeDeps({ failWith: new Error("boom") });
    await startGateway(deps);
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq()),
    });
    expect(res.status).toBe(502);
    const stats = gw.stats();
    expect(stats.failures).toBe(1);
    expect(stats.results).toBe(0);
  });

  test("passes the resolved upstream model id to generate", async () => {
    gw.close();
    const { deps, calls } = makeDeps({});
    await startGateway(deps);
    await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq({ model: "claude-luca-code-gpt-5-sonnet" })),
    });
    expect(calls.generateArgs[0]?.model).toBe("gpt-5-sonnet");
  });

  test("stream:true returns an SSE stream of forwarded events (not JSON)", async () => {
    // Regression: the gateway router MUST honour `stream: true`. The earlier
    // bug returned a JSON body for a streaming request, so the client's SSE
    // parser saw zero events ("Stream ended without receiving any events").
    gw.close();
    const result = makeResult("gpt-5");
    const deps: GatewayDeps = {
      config: loadConfig({}),
      models: sampleModels(),
      getCredentials: async () => makeCred(),
      generate: async (gopts) => {
        const emit = (gopts as { emit: (e: { type: string; [k: string]: unknown }) => void }).emit;
        emit({
          type: "message_start",
          message: {
            id: "msg_1",
            type: "message",
            role: "assistant",
            // Collector/upstream model is empty (the ChatGPT subscription
            // response.created omits model). The gateway MUST override this
            // with the requested public id (macaz server.go:286), not forward
            // the empty collector model.
            model: "",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 11, output_tokens: 0 },
          },
        });
        emit({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
        emit({ type: "text_delta", index: 0, text: "hello" });
        emit({ type: "text_delta", index: 0, text: " world" });
        emit({ type: "content_block_stop", index: 0 });
        emit({
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 3 },
        });
        emit({ type: "message_stop" });
        return result;
      },
      countTokens: () => ({ count: 42, estimated: true }),
    };
    await startGateway(deps);
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq({ stream: true })),
    });
    expect(res.status).toBe(200);
    // The response MUST be SSE, not JSON, for a streaming request.
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: message_start");
    expect(text).toContain("event: message_stop");
    // message_start.model is the requested public id (claude-luca-code-gpt-5),
    // not the empty collector model — matching macaz server.go:286.
    expect(text).toContain('"model":"claude-luca-code-gpt-5"');
    // A streaming body must not be a bare JSON object.
    expect(text.startsWith("{")).toBe(false);
    // Regression: content deltas MUST be framed as `content_block_delta` with
    // a nested `delta.type`. Emitting `event: text_delta` instead made Claude
    // Code open/close the stream with zero accumulated text ("previous
    // response didn't render").
    expect(text).toContain("event: content_block_delta");
    expect(text).toContain('"type":"content_block_delta"');
    expect(text).toContain('"delta":{"type":"text_delta","text":"hello"}');
    expect(text).not.toContain("event: text_delta");
    expect(gw.stats().results).toBe(1);
  });

  test("a streaming request whose generate throws after emitting terminals sends no message_stop", async () => {
    // End-to-end guard for todo #5: the collector emits message_delta +
    // message_stop on `response.failed` and THEN generate rejects. If those
    // terminators reach the wire the client renders a truncated response as a
    // clean completion and never surfaces the error.
    gw.close();
    const deps: GatewayDeps = {
      config: loadConfig({}),
      models: sampleModels(),
      getCredentials: async () => makeCred(),
      generate: async (gopts) => {
        const emit = (gopts as { emit: (e: { type: string; [k: string]: unknown }) => void }).emit;
        emit({
          type: "message_start",
          message: {
            id: "msg_1",
            type: "message",
            role: "assistant",
            model: "",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 11, output_tokens: 0 },
          },
        });
        emit({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
        emit({ type: "text_delta", index: 0, text: "partial" });
        emit({ type: "content_block_stop", index: 0 });
        emit({
          type: "message_delta",
          delta: { stop_reason: "StreamError", stop_sequence: null },
          usage: { output_tokens: 1 },
        });
        emit({ type: "message_stop" });
        throw Object.assign(new Error("stream failed"), {
          status: 502,
          type: "stream_error",
          body: "upstream said no",
        });
      },
      countTokens: () => ({ count: 42, estimated: true }),
    };
    await startGateway(deps);
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq({ stream: true })),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: error");
    expect(text).toContain("partial");
    expect(text).not.toContain("event: message_stop");
    expect(text).not.toContain("event: message_delta");
    expect(gw.stats().failures).toBe(1);
    expect(gw.stats().results).toBe(0);
  });

  test("missing auth -> 401", async () => {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseReq()),
    });
    expect(res.status).toBe(401);
  });

  test("oversized body -> 413", async () => {
    // Build a body larger than maxBodyBytes (default 10MiB). Send a huge string.
    const big = "x".repeat(11 * 1024 * 1024);
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...baseReq(), messages: [{ role: "user", content: big }] }),
    });
    expect(res.status).toBe(413);
  });

  test("oversized streamed upload -> 413 promptly (todo #11)", async () => {
    // A chunked upload carries no content-length, so the gateway can only stop
    // it by bounding the read itself. 2 MiB streamed against a 4 KiB cap.
    gw.close();
    const { deps } = makeDeps({});
    deps.config = { ...deps.config, maxBodyBytes: 4096 };
    await startGateway(deps);

    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent >= 32) {
          c.close();
          return;
        }
        sent++;
        c.enqueue(chunk);
      },
    });

    const started = Date.now();
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(413);
    const parsed = await json(res);
    expect(parsed.error.type).toBe("request_too_large");
    expect(Date.now() - started).toBeLessThan(5000);
    // The gateway must stop reading long before the full 2 MiB arrives.
    expect(sent).toBeLessThan(32);
  });
});

/* -------------------------------------------------------------------------- */
/* POST /v1/messages/count_tokens                                             */
/* -------------------------------------------------------------------------- */

describe("POST /v1/messages/count_tokens", () => {
  test("returns input_tokens from countTokens", async () => {
    const res = await fetch(`${base}/v1/messages/count_tokens`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq()),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.input_tokens).toBe(42);
  });

  test("requires auth", async () => {
    const res = await fetch(`${base}/v1/messages/count_tokens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseReq()),
    });
    expect(res.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/* cancellation + request timeout (todo #4)                                   */
/* -------------------------------------------------------------------------- */

describe("cancellation", () => {
  /** Deps whose generate parks until its injected signal aborts. */
  function hangingDeps(): {
    deps: GatewayDeps;
    captured: { signal?: AbortSignal };
  } {
    const captured: { signal?: AbortSignal } = {};
    const deps: GatewayDeps = {
      config: loadConfig({}),
      models: sampleModels(),
      getCredentials: async () => makeCred(),
      generate: (_gopts, gdeps) =>
        new Promise<Result>((_res, rej) => {
          const sig = (gdeps as { signal?: AbortSignal } | undefined)?.signal;
          captured.signal = sig;
          sig?.addEventListener("abort", () => rej(sig.reason), { once: true });
        }),
      countTokens: () => ({ count: 42, estimated: true }),
    };
    return { deps, captured };
  }

  test("a client disconnect aborts the in-flight generate", async () => {
    gw.close();
    const { deps, captured } = hangingDeps();
    await startGateway(deps);

    const ac = new AbortController();
    const pending = fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq()),
      signal: ac.signal,
    }).catch(() => undefined);

    await Bun.sleep(50);
    expect(captured.signal).toBeInstanceOf(AbortSignal);
    expect(captured.signal!.aborted).toBe(false);

    ac.abort();
    await pending;
    await Bun.sleep(100);

    expect(captured.signal!.aborted).toBe(true);
    expect(gw.stats().failures).toBe(1);
    expect(gw.stats().results).toBe(0);
  });

  test("a client disconnect aborts an in-flight STREAMING generate", async () => {
    // The other arm of the composed AbortSignal.any, on the streaming path.
    // If Bun.serve stopped firing req.signal once the Response headers are
    // flushed, a user hitting ESC mid-stream would leak the upstream SSE
    // connection and its concurrency slot for the full requestTimeout — and
    // the timeout-arm test above would stay green throughout.
    gw.close();
    const { deps, captured } = hangingDeps();
    // Emit a partial block before parking so the response body is genuinely
    // flowing when the client disconnects (an SSE response that has produced
    // no bytes yet is not yet observable by the client).
    const park = deps.generate;
    deps.generate = (gopts, gdeps) => {
      const emit = (gopts as { emit: (e: { type: string; [k: string]: unknown }) => void }).emit;
      emit({
        type: "message_start",
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      });
      emit({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      emit({ type: "text_delta", index: 0, text: "partial" });
      return park(gopts, gdeps);
    };
    await startGateway(deps);

    const ac = new AbortController();
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq({ stream: true })),
      signal: ac.signal,
    });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    // Start draining so the response body is genuinely open on both ends.
    const drained = res.text().catch(() => undefined);

    await Bun.sleep(50);
    expect(captured.signal).toBeInstanceOf(AbortSignal);
    expect(captured.signal!.aborted).toBe(false);

    ac.abort();
    await drained;
    await Bun.sleep(100);

    expect(captured.signal!.aborted).toBe(true);
    expect(gw.stats().failures).toBe(1);
    expect(gw.stats().results).toBe(0);
  });

  test("a streaming request that times out ends with an error frame, not message_stop", async () => {
    gw.close();
    const { deps, captured } = hangingDeps();
    deps.config = { ...deps.config, requestTimeout: 150 };
    // Emit a partial block before parking so the client has seen real content.
    const park = deps.generate;
    deps.generate = (gopts, gdeps) => {
      const emit = (gopts as { emit: (e: { type: string; [k: string]: unknown }) => void }).emit;
      emit({
        type: "message_start",
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      });
      emit({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      emit({ type: "text_delta", index: 0, text: "partial" });
      return park(gopts, gdeps);
    };
    await startGateway(deps);

    const started = Date.now();
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq({ stream: true })),
    });
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    // The stream must terminate on its own once the request timeout fires —
    // without the composed signal reaching generate this read never completes.
    const text = await res.text();
    expect(Date.now() - started).toBeLessThan(5000);
    expect(captured.signal!.aborted).toBe(true);
    expect(text).toContain("event: message_start");
    expect(text).toContain("partial");
    expect(text).toContain("event: error");
    expect(text).not.toContain("event: message_stop");
    expect(gw.stats().failures).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* unified handlers (todo #14) — production must serve the tested handlers    */
/* -------------------------------------------------------------------------- */

describe("unified handlers", () => {
  test("upstream 429 -> HTTP 502 with rate_limit_error type", async () => {
    gw.close();
    const { deps } = makeDeps({ failWith: Object.assign(new Error("boom"), { status: 429 }) });
    await startGateway(deps);
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq()),
    });
    expect(res.status).toBe(502);
    const body = await json(res);
    expect(body.error.type).toBe("rate_limit_error");
  });

  test("upstream 401 -> HTTP 502 with authentication_error type", async () => {
    gw.close();
    const { deps } = makeDeps({ failWith: Object.assign(new Error("nope"), { status: 401 }) });
    await startGateway(deps);
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq()),
    });
    expect(res.status).toBe(502);
    const body = await json(res);
    expect(body.error.type).toBe("authentication_error");
  });

  test("count_tokens sets the x-luca-code-token-count-estimated header", async () => {
    const res = await fetch(`${base}/v1/messages/count_tokens`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq()),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-luca-code-token-count-estimated")).toBe("true");
    const body = await json(res);
    expect(body.input_tokens).toBe(42);
  });

  test("/v1/models entries carry efforts, input_modalities, description and created_at", async () => {
    const res = await fetch(`${base}/v1/models`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await json(res);
    const entry = body.data[0];
    expect(entry.efforts).toEqual(["low", "medium", "high"]);
    expect(Array.isArray(entry.input_modalities)).toBe(true);
    expect(entry.input_modalities).toEqual(["text"]);
    expect(typeof entry.description).toBe("string");
    expect(entry.description.length).toBeGreaterThan(0);
    expect(typeof entry.created_at).toBe("number");
  });

  test("GET /v1/usage returns the token totals after a successful message", async () => {
    await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq()),
    });
    const res = await fetch(`${base}/v1/usage`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total_input_tokens).toBe(11);
    expect(body.total_output_tokens).toBe(3);
  });

  test("GET /v1/usage without auth -> 401", async () => {
    const res = await fetch(`${base}/v1/usage`);
    expect(res.status).toBe(401);
  });

  test("regression guard: invalid JSON body -> 400 invalid_request_error", async () => {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: "{bad",
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error.type).toBe("invalid_request_error");
  });

  test("regression guard: unknown model -> 404 not_found_error", async () => {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq({ model: "claude-luca-code-nope" })),
    });
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error.type).toBe("not_found_error");
  });

  test("regression guard: no credentials -> 503 api_error", async () => {
    gw.close();
    const { deps } = makeDeps({});
    deps.getCredentials = async () => null;
    await startGateway(deps);
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(baseReq()),
    });
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.error.type).toBe("api_error");
  });
});

/* -------------------------------------------------------------------------- */
/* restrictRecursiveSubagentTools                                             */
/* -------------------------------------------------------------------------- */

describe("restrictRecursiveSubagentTools", () => {
  test("strips the agent tool when system contains cc_is_subagent=true", () => {
    const req = baseReq({
      system: "some preamble cc_is_subagent=true more",
      tools: [
        { type: "custom", name: "agent", description: "d", input_schema: {} },
        { type: "custom", name: "bash", description: "d", input_schema: {} },
      ],
    });
    const out = restrictRecursiveSubagentTools(req);
    expect(out.tools.map((t) => t.name)).toEqual(["bash"]);
  });

  test("leaves tools untouched when not a subagent", () => {
    const req = baseReq({
      system: "you are helpful",
      tools: [
        { type: "custom", name: "agent", description: "d", input_schema: {} },
        { type: "custom", name: "bash", description: "d", input_schema: {} },
      ],
    });
    const out = restrictRecursiveSubagentTools(req);
    expect(out.tools.map((t) => t.name)).toEqual(["agent", "bash"]);
  });

  test("handles array-form system blocks", () => {
    const req = baseReq({
      system: [{ type: "text", text: "cc_is_subagent=true" }],
      tools: [{ type: "custom", name: "agent", description: "d", input_schema: {} }],
    });
    const out = restrictRecursiveSubagentTools(req);
    expect(out.tools).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* attachClientRouting                                                        */
/* -------------------------------------------------------------------------- */

describe("attachClientRouting", () => {
  test("derives prompt_cache_key from X-Claude-Code-Session-Id", () => {
    const h = new Headers();
    h.set("X-Claude-Code-Session-Id", "sess-123");
    const out = attachClientRouting(baseReq(), h);
    expect(typeof out.prompt_cache_key).toBe("string");
    expect(out.prompt_cache_key!.length).toBeGreaterThan(0);
    // deterministic for the same session id
    const out2 = attachClientRouting(baseReq(), h);
    expect(out2.prompt_cache_key).toBe(out.prompt_cache_key);
  });

  test("different session ids -> different keys", () => {
    const h1 = new Headers();
    h1.set("X-Claude-Code-Session-Id", "sess-1");
    const h2 = new Headers();
    h2.set("X-Claude-Code-Session-Id", "sess-2");
    expect(attachClientRouting(baseReq(), h1).prompt_cache_key).not.toBe(
      attachClientRouting(baseReq(), h2).prompt_cache_key,
    );
  });

  test("no session header -> no prompt_cache_key", () => {
    const out = attachClientRouting(baseReq(), new Headers());
    expect(out.prompt_cache_key).toBeUndefined();
  });
});
/* -------------------------------------------------------------------------- */
/* Bun.serve idleTimeout — ECONNRESET regression                              */
/* -------------------------------------------------------------------------- */

describe("gateway socket idle timeout", () => {
  // REGRESSION GUARD. `Bun.serve` defaults idleTimeout to 10 SECONDS and resets
  // the connection on expiry, so the client sees a bare ECONNRESET rather than
  // an HTTP response. A reasoning model's time-to-first-token routinely exceeds
  // 10s, during which the gateway has written nothing and the socket counts as
  // idle. Empirically verified against Bun 1.3.11:
  //   Bun.serve with no idleTimeout, 13s handler
  //     -> "[Bun.serve]: request timed out after 10 seconds" + ECONNRESET
  //   same handler with idleTimeout: 60 -> 200 OK after 13010ms
  // These tests are fast because they assert the OPTION reaches Bun.serve
  // instead of sleeping past the real 10s default.

  test("createGateway passes an idleTimeout well above Bun's 10s default", async () => {
    const { deps } = makeDeps({});
    const originalServe = Bun.serve;
    let captured: { idleTimeout?: number } | null = null;
    const spy = Bun as unknown as { serve: typeof Bun.serve };
    try {
      spy.serve = ((opts: Parameters<typeof Bun.serve>[0]) => {
        captured = opts as { idleTimeout?: number };
        return originalServe(opts as Parameters<typeof originalServe>[0]);
      }) as typeof Bun.serve;
      const g = createGateway(deps);
      await g.start();
      g.close();
    } finally {
      spy.serve = originalServe;
    }
    expect(captured).not.toBeNull();
    const idle = captured!.idleTimeout;
    // The bug is `undefined` (Bun then applies its 10s default).
    expect(typeof idle).toBe("number");
    expect(idle!).toBeGreaterThan(10);
    expect(idle!).toBe(gatewayIdleTimeoutSec(loadConfig({}).requestTimeoutSec));
  });

  test("idle timeout sits above the request timeout so the app timeout fires first", () => {
    // Ordering matters: whichever fires first decides what the client sees. The
    // app timeout yields a well-formed Anthropic error; the socket timeout
    // yields ECONNRESET. The app timeout must win.
    expect(gatewayIdleTimeoutSec(120)).toBe(135);
    expect(gatewayIdleTimeoutSec(30)).toBe(45);
    expect(gatewayIdleTimeoutSec(1)).toBe(16);
    expect(gatewayIdleTimeoutSec(120)).toBeGreaterThan(120);
  });

  test("clamps to Bun's 255s ceiling rather than throwing", () => {
    // Bun rejects >255 with "Bun.serve expects idleTimeout to be 255 or less",
    // which would crash start() instead of degrading.
    expect(gatewayIdleTimeoutSec(240)).toBe(BUN_MAX_IDLE_TIMEOUT_SEC);
    expect(gatewayIdleTimeoutSec(600)).toBe(BUN_MAX_IDLE_TIMEOUT_SEC);
    expect(gatewayIdleTimeoutSec(100_000)).toBe(BUN_MAX_IDLE_TIMEOUT_SEC);
  });

  test("a clamped value is still accepted by a real Bun.serve", () => {
    const s = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      idleTimeout: gatewayIdleTimeoutSec(100_000),
      fetch: () => new Response("ok"),
    });
    expect(s.port).toBeGreaterThan(0);
    s.stop(true);
  });
});
