/**
 * test/provider-openai.test.ts — TDD suite for provider/openai.ts (step 11).
 *
 * Exercises the macaz-ported Generate / sendResponsesWithRetry / acquireGenerate
 * / authorize / sanitizeSubscription. All HTTP is routed through a scriptable
 * in-memory fetch stub so the suite never touches the network; forceRefresh is
 * stubbed for the 401-retry path.
 */

import { test, expect, describe, beforeEach } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generate,
  resolveModel,
  countTokens,
  httpError,
  isHTTPError,
  providerDepsFromConfig,
  DEFAULT_MAX_QUEUED,
  _resetGates,
} from "../src/provider/openai";
import type { GenerateDeps, HTTPError } from "../src/provider/openai";
import type { Credential } from "../src/auth/credentials";
import type { ForceRefreshOptions } from "../src/auth/openai-subscription";
import type { EmitFunc, Event, Request } from "../src/protocol/types";
import { CLIENT_VERSION, RESPONSES_ENDPOINT } from "../src/constants";
import { CODEX_CLI_RS_UA, DEFAULT_UA, defaultProfileDir, loadConfig } from "../src/config";

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function makeCred(access = "access-1", account = "acct-1"): Credential {
  return {
    type: "openai_account_oauth",
    method: "chatgpt_headless",
    access,
    refresh: "refresh-1",
    expires_at: Date.now() + 3_600_000,
    account_id: account,
    id_token: "idtoken",
  };
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    model: "claude-3",
    max_tokens: 1024,
    messages: [{ role: "user", content: "hi" }],
    system: "you are helpful",
    tools: [],
    tool_choice: null,
    stop_sequences: [],
    stream: true,
    thinking: null,
    output_config: null,
    output_format: null,
    metadata: null,
    ...overrides,
  };
}

/** Build an SSE response with the given events. */
function sseResponse(
  events: Array<{ event: string; data: unknown }>,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const body = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join("");
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream", ...headers },
  });
}

/** A minimal completed stream with usage. */
function completedStream(): Response {
  return sseResponse([
    {
      event: "response.created",
      data: { response: { id: "resp_1", model: "gpt-5", status: "in_progress", usage: { input_tokens: 10, output_tokens: 0 } } },
    },
    {
      event: "response.completed",
      data: { response: { id: "resp_1", model: "gpt-5", status: "completed", usage: { input_tokens: 10, output_tokens: 5 } } },
    },
  ]);
}

function capturingEmit(): { emit: EmitFunc; events: Event[] } {
  const events: Event[] = [];
  const emit: EmitFunc = (e: Event) => {
    events.push(e);
  };
  return { emit, events };
}

/** A scripted fetch handler. */
type FetchInit = { method: string; headers: Record<string, string>; body?: string };

function scriptedFetch(
  responses: Array<Response | ((init: FetchInit) => Response)>,
): { fetch: typeof fetch; calls: FetchInit[] } {
  const calls: FetchInit[] = [];
  let i = 0;
  const fetchStub = ((_url: unknown, init?: any) => {
    const recorded: FetchInit = {
      method: init?.method,
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(recorded);
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    const res = typeof next === "function" ? next(recorded) : next;
    return Promise.resolve(res);
  }) as unknown as typeof fetch;
  return { fetch: fetchStub, calls };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => _resetGates());

/* -------------------------------------------------------------------------- */
/* resolveModel                                                               */
/* -------------------------------------------------------------------------- */

describe("resolveModel", () => {
  test("non-empty request model passes through", () => {
    expect(resolveModel("claude-3", "gpt-5")).toBe("claude-3");
  });
  test("empty request model falls back", () => {
    expect(resolveModel("", "gpt-5")).toBe("gpt-5");
  });
});

/* -------------------------------------------------------------------------- */
/* countTokens                                                                */
/* -------------------------------------------------------------------------- */

describe("countTokens", () => {
  test("returns a local estimate flagged estimated:true", () => {
    const req = makeReq();
    const { count, estimated } = countTokens(req);
    expect(estimated).toBe(true);
    expect(count).toBeGreaterThan(0);
    // "you are helpful" (16) + "hi" (2) = 18 chars -> floor(18/4) = 4
    expect(count).toBe(4);
  });
});

/* -------------------------------------------------------------------------- */
/* HTTPError                                                                  */
/* -------------------------------------------------------------------------- */

describe("HTTPError", () => {
  test("factory builds an Error with http fields", () => {
    const err = httpError(429, "rate_limited", "slow down", "body", 500);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(429);
    expect(err.type).toBe("rate_limited");
    expect(err.message).toBe("slow down");
    expect(err.body).toBe("body");
    expect(err.retryAfter).toBe(500);
  });
  test("isHTTPError narrows", () => {
    const err = httpError(500, "server", "x");
    expect(isHTTPError(err)).toBe(true);
    expect(isHTTPError(new Error("plain"))).toBe(false);
  });
  test("can be thrown and caught typed", () => {
    try {
      throw httpError(400, "bad_request", "nope");
      expect.unreachable();
    } catch (e) {
      const err = isHTTPError(e) ? (e as HTTPError) : null;
      expect(err).not.toBeNull();
      expect(err!.status).toBe(400);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* generate — happy path                                                      */
/* -------------------------------------------------------------------------- */

describe("generate", () => {
  test("translates, posts to responses endpoint, streams, returns Result", async () => {
    const { fetch, calls } = scriptedFetch([completedStream()]);
    const { emit, events } = capturingEmit();

    const result = await generate(
      {
        req: makeReq(),
        emit,
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 4,
      },
      { fetch, originator: "cc-openai-bridge", ua: "ua-test/1" },
    );

    expect(calls.length).toBe(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers["Authorization"]).toBe("Bearer access-1");
    expect(calls[0]!.headers["ChatGPT-Account-Id"]).toBe("acct-1");
    expect(calls[0]!.headers["User-Agent"]).toBe("ua-test/1");
    expect(calls[0]!.headers["originator"]).toBe("cc-openai-bridge");
    expect(calls[0]!.headers["Accept"]).toBe("text/event-stream");

    const body = JSON.parse(calls[0]!.body!);
    expect(body.stream).toBe(true);
    expect(body.store).toBe(false);
    expect(body.parallel_tool_calls).toBe(false);
    // generate sends the resolved upstream slug passed as `model` ("gpt-5"),
    // never the echoed request model ("claude-3"). Echoing the public id would
    // make OpenAI reject the request with 400.
    expect(body.model).toBe("gpt-5");
    expect(body.instructions).toBe("you are helpful");
    expect(body.user).toBeUndefined();
    expect(body.max_output_tokens).toBeUndefined();
    expect(body.truncation).toBeUndefined();
    expect(body.previous_response_id).toBeUndefined();

    expect(result.model).toBe("gpt-5");
    expect(result.stop_reason).toBe("end_turn");
    expect(result.usage.output_tokens).toBe(5);
    expect(events.map((e) => e.type)).toContain("message_start");
    expect(events.map((e) => e.type)).toContain("message_stop");
  });

  test("uses fallback model when request model is empty", async () => {
    const { fetch, calls } = scriptedFetch([completedStream()]);
    const { emit } = capturingEmit();
    await generate(
      { req: makeReq({ model: "" }), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch },
    );
    const body = JSON.parse(calls[0]!.body!);
    expect(body.model).toBe("gpt-5");
  });

  test("default endpoint is RESPONSES_ENDPOINT", async () => {
    let postedUrl = "";
    const fetchStub = ((url: unknown) => {
      postedUrl = String(url);
      return Promise.resolve(completedStream());
    }) as unknown as typeof fetch;
    const { emit } = capturingEmit();
    await generate(
      { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch: fetchStub },
    );
    expect(postedUrl).toBe(RESPONSES_ENDPOINT);
  });
});

/* -------------------------------------------------------------------------- */
/* generate — production dependency binding (todo #3)                          */
/* -------------------------------------------------------------------------- */

describe("generate production dependency defaults", () => {
  test("unbound deps still speak the production dialect (UA + version)", async () => {
    const { fetch, calls } = scriptedFetch([completedStream()]);
    const { emit } = capturingEmit();
    await generate(
      { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch },
    );
    // Parity with provider/models.ts, which sends DEFAULT_UA + CLIENT_VERSION to
    // the SAME codex backend. Drift here means the two provider surfaces
    // advertise different clients.
    expect(calls[0]!.headers["User-Agent"]).toBe(DEFAULT_UA);
    expect(calls[0]!.headers["version"]).toBe(CLIENT_VERSION);
    expect(calls[0]!.headers["originator"]).toBe("cc-openai-bridge");
  });

  test("401 forceRefresh receives the real profile dir when deps omit it", async () => {
    const { fetch } = scriptedFetch([
      new Response("unauth", { status: 401 }),
      completedStream(),
    ]);
    const seen: ForceRefreshOptions[] = [];
    const forceRefresh = async (opts: ForceRefreshOptions) => {
      seen.push(opts);
      return makeCred("access-2");
    };
    const { emit } = capturingEmit();
    await generate(
      { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch, forceRefresh },
    );
    expect(seen.length).toBe(1);
    expect(seen[0]!.profileDir).toBe(defaultProfileDir());
    expect(seen[0]!.profileDir.length).toBeGreaterThan(0);
  });

  test("providerDepsFromConfig binds profileDir / originator / ua / version", () => {
    const codex = providerDepsFromConfig(
      loadConfig({
        LUCA_CODE_USE_CODEX_UA: "true",
        LUCA_CODE_ORIGINATOR: "my-bridge",
        LUCA_CODE_PROFILE_DIR: "/p",
      }),
    );
    expect(codex).toEqual({
      profileDir: "/p",
      originator: "my-bridge",
      ua: CODEX_CLI_RS_UA,
      version: CLIENT_VERSION,
    });

    const plain = providerDepsFromConfig(loadConfig({}));
    expect(plain.ua).toBe(DEFAULT_UA);
    expect(plain.version).toBe(CLIENT_VERSION);
    expect(plain.profileDir).toBe(defaultProfileDir());
    expect(plain.originator).toBe("cc-openai-bridge");
    // Never bound here — callers add these.
    expect(plain.fetch).toBeUndefined();
    expect(plain.forceRefresh).toBeUndefined();
    expect(plain.responsesEndpoint).toBeUndefined();
    expect(plain.signal).toBeUndefined();
  });

  test("GenerateDeps carries a cancellation signal (type-level)", () => {
    const controller = new AbortController();
    const deps: GenerateDeps = { signal: controller.signal };
    expect(deps.signal).toBe(controller.signal);
  });

  test("DEFAULT_MAX_QUEUED is a finite positive integer", () => {
    expect(Number.isInteger(DEFAULT_MAX_QUEUED)).toBe(true);
    expect(DEFAULT_MAX_QUEUED).toBeGreaterThan(0);
    expect(Number.isFinite(DEFAULT_MAX_QUEUED)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* generate — defaultEffort applied for adaptive thinking                     */
/* -------------------------------------------------------------------------- */

describe("generate reasoning effort", () => {
  test("adaptive thinking with no budget -> defaultEffort applied", async () => {
    const { fetch, calls } = scriptedFetch([completedStream()]);
    const { emit } = capturingEmit();
    await generate(
      {
        req: makeReq({ thinking: { type: "adaptive" } }),
        emit,
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "high",
        maxConcurrent: 4,
      },
      { fetch },
    );
    const body = JSON.parse(calls[0]!.body!);
    expect(body.reasoning).toBeDefined();
    expect(body.reasoning.effort).toBe("high");
    expect(body.reasoning.summary).toBe("auto");
    expect(body.include).toContain("reasoning.encrypted_content");
  });

  test("fixed budget thinking -> effort from budget, defaultEffort ignored", async () => {
    const { fetch, calls } = scriptedFetch([completedStream()]);
    const { emit } = capturingEmit();
    await generate(
      {
        req: makeReq({ thinking: { type: "enabled", budget_tokens: 4000 } }),
        emit,
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "high",
        maxConcurrent: 4,
      },
      { fetch },
    );
    const body = JSON.parse(calls[0]!.body!);
    // 4000 < 8192 -> "low"
    expect(body.reasoning.effort).toBe("low");
  });

  test("no thinking -> no reasoning field", async () => {
    const { fetch, calls } = scriptedFetch([completedStream()]);
    const { emit } = capturingEmit();
    await generate(
      { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch },
    );
    const body = JSON.parse(calls[0]!.body!);
    expect(body.reasoning).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* generate — 401 retry with forceRefresh                                     */
/* -------------------------------------------------------------------------- */

describe("generate 401 retry", () => {
  test("401 -> forceRefresh -> retry succeeds", async () => {
    const { fetch, calls } = scriptedFetch([
      new Response("unauth", { status: 401 }),
      completedStream(),
    ]);
    let refreshCalls = 0;
    const forceRefresh = async () => {
      refreshCalls++;
      return makeCred("access-2", "acct-1");
    };
    const { emit } = capturingEmit();
    const result = await generate(
      { req: makeReq(), emit, cred: makeCred("access-1"), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch, forceRefresh, profileDir: "/tmp/profile", ua: "ua-test" },
    );
    expect(refreshCalls).toBe(1);
    expect(calls.length).toBe(2);
    expect(calls[1]!.headers["Authorization"]).toBe("Bearer access-2");
    expect(result.stop_reason).toBe("end_turn");
  });

  test("401 exhausted (max 3) -> HTTPError 401", async () => {
    const { fetch } = scriptedFetch([
      new Response("u", { status: 401 }),
      new Response("u", { status: 401 }),
      new Response("u", { status: 401 }),
      new Response("u", { status: 401 }),
    ]);
    let refreshCalls = 0;
    const forceRefresh = async () => {
      refreshCalls++;
      return makeCred(`access-${refreshCalls + 1}`);
    };
    const { emit } = capturingEmit();
    await expect(
      generate(
        { req: makeReq(), emit, cred: makeCred("access-1"), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
        { fetch, forceRefresh, profileDir: "/tmp/p", ua: "ua" },
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* generate — 429 / 5xx backoff retry                                          */
/* -------------------------------------------------------------------------- */

describe("generate 429/5xx backoff", () => {
  test("429 with retry-after-ms -> retry -> success", async () => {
    const { fetch, calls } = scriptedFetch([
      new Response("slow", { status: 429, headers: { "retry-after-ms": "1" } }),
      completedStream(),
    ]);
    const { emit } = capturingEmit();
    const result = await generate(
      { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch },
    );
    expect(calls.length).toBe(2);
    expect(result.stop_reason).toBe("end_turn");
  });

  test("500 -> retry -> success", async () => {
    const { fetch, calls } = scriptedFetch([
      new Response("err", { status: 500 }),
      completedStream(),
    ]);
    const { emit } = capturingEmit();
    const result = await generate(
      { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch },
    );
    expect(calls.length).toBe(2);
    expect(result.stop_reason).toBe("end_turn");
  });

  test("400 non-retryable -> HTTPError 400", async () => {
    const { fetch } = scriptedFetch([new Response("bad", { status: 400 })]);
    const { emit } = capturingEmit();
    await expect(
      generate(
        { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
        { fetch },
      ),
    ).rejects.toMatchObject({ status: 400, type: "http_error" });
  });
});

/* -------------------------------------------------------------------------- */
/* generate — stream error mapping                                            */
/* -------------------------------------------------------------------------- */

describe("generate stream errors", () => {
  test("response.failed terminal -> HTTPError 502 stream_error", async () => {
    const { fetch } = scriptedFetch([
      sseResponse([
        {
          event: "response.created",
          data: { response: { id: "r", model: "gpt-5", status: "in_progress", usage: { input_tokens: 1, output_tokens: 0 } } },
        },
        {
          event: "response.failed",
          data: { response: { id: "r", model: "gpt-5", status: "failed", error: { message: "boom" } } },
        },
      ]),
    ]);
    const { emit } = capturingEmit();
    await expect(
      generate(
        { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
        { fetch },
      ),
    ).rejects.toMatchObject({ status: 502, type: "stream_error" });
  });

  test("no terminal event -> HTTPError 502", async () => {
    const { fetch } = scriptedFetch([
      sseResponse([
        {
          event: "response.created",
          data: { response: { id: "r", model: "gpt-5", status: "in_progress", usage: { input_tokens: 1, output_tokens: 0 } } },
        },
      ]),
    ]);
    const { emit } = capturingEmit();
    await expect(
      generate(
        { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
        { fetch },
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
});

/* -------------------------------------------------------------------------- */
/* generate — concurrency gating (acquireGenerate)                            */
/* -------------------------------------------------------------------------- */

describe("acquireGenerate gating", () => {
  test("maxConcurrent=1 serializes unrelated keys", async () => {
    let fetchCalls = 0;
    let resolveFirst: () => void = () => {};
    const firstPending = new Promise<Response>((r) => {
      resolveFirst = () => r(completedStream());
    });
    const fetchStub = (() => {
      fetchCalls++;
      return fetchCalls === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const { emit: emitA } = capturingEmit();
    const { emit: emitB } = capturingEmit();

    const gA = generate(
      { req: makeReq(), emit: emitA, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );
    await tick();
    expect(fetchCalls).toBe(1);

    const gB = generate(
      { req: makeReq(), emit: emitB, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );
    await tick();
    await tick();
    expect(fetchCalls).toBe(1); // B waits for a slot

    resolveFirst();
    await gA;
    await gB;
    expect(fetchCalls).toBe(2);
  });

  test("same prompt_cache_key serializes even with spare slots", async () => {
    let fetchCalls = 0;
    let resolveFirst: () => void = () => {};
    const firstPending = new Promise<Response>((r) => {
      resolveFirst = () => r(completedStream());
    });
    const fetchStub = (() => {
      fetchCalls++;
      return fetchCalls === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const { emit: emitA } = capturingEmit();
    const { emit: emitB } = capturingEmit();

    const gA = generate(
      { req: makeReq({ prompt_cache_key: "k1" }), emit: emitA, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch: fetchStub },
    );
    await tick();
    expect(fetchCalls).toBe(1);

    const gB = generate(
      { req: makeReq({ prompt_cache_key: "k1" }), emit: emitB, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch: fetchStub },
    );
    await tick();
    await tick();
    expect(fetchCalls).toBe(1); // same key -> serialized

    resolveFirst();
    await gA;
    await gB;
    expect(fetchCalls).toBe(2);
  });

  test("different keys run concurrently when slots available", async () => {
    let fetchCalls = 0;
    const fetchStub = (() => {
      fetchCalls++;
      return Promise.resolve(completedStream());
    }) as unknown as typeof fetch;
    const { emit: emitA } = capturingEmit();
    const { emit: emitB } = capturingEmit();
    await Promise.all([
      generate(
        { req: makeReq({ prompt_cache_key: "k1" }), emit: emitA, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
        { fetch: fetchStub },
      ),
      generate(
        { req: makeReq({ prompt_cache_key: "k2" }), emit: emitB, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
        { fetch: fetchStub },
      ),
    ]);
    expect(fetchCalls).toBe(2);
  });

  test("same-key waiters do not consume slots needed by unrelated work", async () => {
    let resolveFirst: (response: Response) => void = () => {};
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const calledKeys: string[] = [];
    // `prompt_cache_key` gates the call but is NOT part of the Responses body,
    // so requests are identified by their system prompt (`body.instructions`).
    const fetchStub = ((_url: unknown, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as { instructions?: string };
      calledKeys.push(requestBody.instructions ?? "");
      return calledKeys.length === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const first = generate(
      { req: makeReq({ prompt_cache_key: "shared", system: "shared" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 2 },
      { fetch: fetchStub },
    );
    await tick();
    const sameKey = generate(
      { req: makeReq({ prompt_cache_key: "shared", system: "shared" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 2 },
      { fetch: fetchStub },
    );
    const unrelated = generate(
      { req: makeReq({ prompt_cache_key: "other", system: "other" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 2 },
      { fetch: fetchStub },
    );
    await tick();
    await tick();

    expect(calledKeys).toEqual(["shared", "other"]);
    resolveFirst(completedStream());
    await Promise.all([first, sameKey, unrelated]);
    expect(calledKeys).toEqual(["shared", "other", "shared"]);
  });

  test("rejects predictably when the bounded queue is full", async () => {
    let resolveFirst: (response: Response) => void = () => {};
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const fetchStub = (() => {
      calls++;
      return calls === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const active = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, maxQueued: 1 },
      { fetch: fetchStub },
    );
    await tick();
    const queued = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, maxQueued: 1 },
      { fetch: fetchStub },
    );
    await tick();

    await expect(
      generate(
        { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, maxQueued: 1 },
        { fetch: fetchStub },
      ),
    ).rejects.toMatchObject({ status: 503, type: "queue_full" });

    resolveFirst(completedStream());
    await Promise.all([active, queued]);
  });

  test("a queue_full rejection leaves the gate usable", async () => {
    let resolveFirst: (response: Response) => void = () => {};
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const fetchStub = (() => {
      calls++;
      return calls === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const active = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, maxQueued: 0 },
      { fetch: fetchStub },
    );
    await tick();

    await expect(
      generate(
        { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, maxQueued: 0 },
        { fetch: fetchStub },
      ),
    ).rejects.toMatchObject({ status: 503, type: "queue_full" });

    resolveFirst(completedStream());
    await active;

    // The rejected caller never held a slot, so activeCount must not have been
    // decremented on its behalf. Deliberately NO _resetGates() here.
    const after = await generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );
    expect(after.stop_reason).toBe("end_turn");
  });

  test("a queue_full rejection releases the prompt_cache_key it took", async () => {
    let resolveFirst: (response: Response) => void = () => {};
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const fetchStub = (() => {
      calls++;
      return calls === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    // Occupies the single slot under a DIFFERENT key, so the rejected caller
    // below fails on the queue bound rather than on the key lock.
    const active = generate(
      { req: makeReq({ prompt_cache_key: "busy" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );
    await tick();

    await expect(
      generate(
        { req: makeReq({ prompt_cache_key: "k", system: "k" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, maxQueued: 0 },
        { fetch: fetchStub },
      ),
    ).rejects.toMatchObject({ status: 503, type: "queue_full" });

    // Key "k" must be free again — with spare slots this must proceed
    // immediately rather than deadlock on a leaked key lock.
    const reused = await generate(
      { req: makeReq({ prompt_cache_key: "k", system: "k" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch: fetchStub },
    );
    expect(reused.stop_reason).toBe("end_turn");

    resolveFirst(completedStream());
    await active;
  });

  test("omitting maxQueued uses DEFAULT_MAX_QUEUED as the bound", async () => {
    let resolveFirst: (response: Response) => void = () => {};
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const fetchStub = (() => {
      calls++;
      return calls === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const run = () =>
      generate(
        { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
        { fetch: fetchStub },
      );

    const active = run();
    await tick();

    // Fill the default-sized queue exactly.
    const queued: Array<Promise<unknown>> = [];
    for (let i = 0; i < DEFAULT_MAX_QUEUED; i++) {
      const p = run();
      p.catch(() => {});
      queued.push(p);
    }
    await tick();

    // One more caller overflows the default bound.
    await expect(run()).rejects.toMatchObject({ status: 503, type: "queue_full" });

    resolveFirst(completedStream());
    await active;
    await Promise.all(queued);
  });
});

describe("generate cancellation", () => {
  test("passes AbortSignal through fetch and preserves AbortError", async () => {
    const abortController = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    const fetchStub = ((_url: unknown, init?: RequestInit) => {
      receivedSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }) as unknown as typeof fetch;
    const pending = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, signal: abortController.signal },
      { fetch: fetchStub },
    );
    await tick();

    abortController.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(receivedSignal).toBe(abortController.signal);
  });

  test("aborting a pending SSE reader cancels the upstream body", async () => {
    let cancelled = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled++;
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
    const abortController = new AbortController();
    const pending = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, signal: abortController.signal },
      { fetch: (() => Promise.resolve(response)) as unknown as typeof fetch },
    );
    await tick();

    abortController.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(1);
  });

  test("a signal supplied via deps is forwarded verbatim", async () => {
    // This is the shape handlers.ts RequestGenerateDeps / cli.ts
    // bindGenerateDependencies actually use.
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    const fetchStub = ((_url: unknown, init?: RequestInit) => {
      receivedSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }) as unknown as typeof fetch;

    const pending = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub, signal: controller.signal },
    );
    await tick();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(receivedSignal).toBe(controller.signal);
  });

  test("opts.signal wins over deps.signal", async () => {
    const optsController = new AbortController();
    const depsController = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    let settled = false;
    const fetchStub = ((_url: unknown, init?: RequestInit) => {
      receivedSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }) as unknown as typeof fetch;

    const pending = generate(
      {
        req: makeReq(),
        emit: () => {},
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 1,
        signal: optsController.signal,
      },
      { fetch: fetchStub, signal: depsController.signal },
    );
    pending.catch(() => {});
    await tick();
    expect(receivedSignal).toBe(optsController.signal);

    // Aborting the DEPS signal must not touch the request.
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    depsController.abort();
    await tick();
    await tick();
    expect(settled).toBe(false);

    optsController.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  test("a pre-aborted signal short-circuits before any fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetch, calls } = scriptedFetch([completedStream()]);

    await expect(
      generate(
        {
          req: makeReq(),
          emit: () => {},
          cred: makeCred(),
          model: "gpt-5",
          defaultEffort: "medium",
          maxConcurrent: 1,
          signal: controller.signal,
        },
        { fetch },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.length).toBe(0);
  });

  test("aborting during a 429 backoff rejects promptly without retrying", async () => {
    const { fetch, calls } = scriptedFetch([
      new Response("slow", { status: 429, headers: { "retry-after-ms": "5000" } }),
      completedStream(),
    ]);
    const controller = new AbortController();
    const started = Date.now();
    const pending = generate(
      {
        req: makeReq(),
        emit: () => {},
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 1,
        signal: controller.signal,
      },
      { fetch },
    );
    await tick();
    await tick();
    setTimeout(() => controller.abort(), 10);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - started).toBeLessThan(4000);
    expect(calls.length).toBe(1);
  });

  test("an abort releases the concurrency gate for later work", async () => {
    const controller = new AbortController();
    const fetchStub = ((_url: unknown, init?: RequestInit) => {
      if (init?.signal) {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        });
      }
      return Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const aborted = generate(
      {
        req: makeReq({ prompt_cache_key: "gate" }),
        emit: () => {},
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 1,
        signal: controller.signal,
      },
      { fetch: fetchStub },
    );
    await tick();
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });

    // Same key AND the single global slot must both be free again.
    const after = await generate(
      { req: makeReq({ prompt_cache_key: "gate" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );
    expect(after.stop_reason).toBe("end_turn");
  });

  test("an AbortError is never remapped to an HTTPError", async () => {
    const controller = new AbortController();
    const fetchStub = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      })) as typeof fetch;

    const pending = generate(
      {
        req: makeReq(),
        emit: () => {},
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 1,
        signal: controller.signal,
      },
      { fetch: fetchStub },
    );
    await tick();
    controller.abort();

    const err = await pending.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).not.toBeNull();
    expect((err as { name?: string }).name).toBe("AbortError");
    expect(isHTTPError(err)).toBe(false);
    expect((err as { status?: number }).status).toBeUndefined();
  });

  test("aborting a request parked in the global wait queue rejects before the in-flight one finishes", async () => {
    // A request queued behind `maxConcurrent` in-flight generates must observe
    // its own cancellation. Without it, a client disconnect (or the gateway's
    // requestTimeout) does not settle the queued promise at all: the HTTP
    // connection is held open past the timeout and the abandoned request still
    // spends an upstream call when its turn finally comes.
    let resolveFirst: (response: Response) => void = () => {};
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const fetchStub = (() => {
      calls++;
      return calls === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const inFlight = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );
    await tick();
    expect(calls).toBe(1);

    const controller = new AbortController();
    const queued = generate(
      {
        req: makeReq(),
        emit: () => {},
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 1,
        signal: controller.signal,
      },
      { fetch: fetchStub },
    );
    let queuedSettled = false;
    void queued.then(
      () => {
        queuedSettled = true;
      },
      () => {
        queuedSettled = true;
      },
    );
    await tick();
    await tick();
    expect(calls).toBe(1); // parked in the wait queue

    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    // It settled while the predecessor is STILL running.
    expect(queuedSettled).toBe(true);
    expect(calls).toBe(1);

    resolveFirst(completedStream());
    await inFlight;
    // The abandoned request never reached the network.
    expect(calls).toBe(1);
  });

  test("an abort while parked in the queue does not swallow a handed-off slot", async () => {
    let resolveFirst: (response: Response) => void = () => {};
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const fetchStub = (() => {
      calls++;
      return calls === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const inFlight = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );
    await tick();

    const controller = new AbortController();
    const doomed = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, signal: controller.signal },
      { fetch: fetchStub },
    );
    doomed.catch(() => {});
    await tick();
    const survivor = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );
    await tick();

    controller.abort();
    await expect(doomed).rejects.toMatchObject({ name: "AbortError" });

    resolveFirst(completedStream());
    await inFlight;
    // The slot handed over by the finished request must reach the survivor, not
    // a dead entry left behind in the queue.
    const result = await survivor;
    expect(result.stop_reason).toBe("end_turn");
  });

  test("aborting a request parked on the per-key lock rejects before the holder finishes", async () => {
    let resolveFirst: (response: Response) => void = () => {};
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const fetchStub = (() => {
      calls++;
      return calls === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const holder = generate(
      { req: makeReq({ prompt_cache_key: "k" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch: fetchStub },
    );
    await tick();
    expect(calls).toBe(1);

    const controller = new AbortController();
    const queued = generate(
      {
        req: makeReq({ prompt_cache_key: "k" }),
        emit: () => {},
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 4,
        signal: controller.signal,
      },
      { fetch: fetchStub },
    );
    await tick();
    await tick();
    expect(calls).toBe(1); // parked on the per-key lock

    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(1);

    resolveFirst(completedStream());
    await holder;

    // The key must be usable again after the aborted waiter dropped out.
    const after = await generate(
      { req: makeReq({ prompt_cache_key: "k" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch: fetchStub },
    );
    expect(after.stop_reason).toBe("end_turn");
  });
});

describe("generate queue-bound re-admission", () => {
  test("a mid-retry re-acquire is never converted into a spurious queue_full", async () => {
    // maxQueued=0: the bound is an ADMISSION control. A request that already
    // passed admission, burned a retry, and dropped its slot across a backoff
    // must not be told "the queue is full" when it comes back for its slot.
    let resolveCompetitor: (response: Response) => void = () => {};
    const competitorPending = new Promise<Response>((resolve) => {
      resolveCompetitor = resolve;
    });

    let retryerCalls = 0;
    const fetchStub = ((_url: unknown, init?: RequestInit) => {
      const parsedBody = JSON.parse(String(init?.body)) as { instructions?: string };
      if (parsedBody.instructions === "competitor") return competitorPending;
      retryerCalls++;
      return retryerCalls === 1
        ? Promise.resolve(new Response("slow", { status: 429, headers: { "retry-after-ms": "40" } }))
        : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const retryer = generate(
      {
        req: makeReq({ system: "retryer" }),
        emit: () => {},
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 1,
        maxQueued: 0,
      },
      { fetch: fetchStub },
    );
    // Let the retryer take its slot, get the 429, and release the slot.
    await tick();
    await tick();
    await tick();

    // A competitor grabs the freed slot while the retryer is sleeping.
    const competitor = generate(
      {
        req: makeReq({ system: "competitor" }),
        emit: () => {},
        cred: makeCred(),
        model: "gpt-5",
        defaultEffort: "medium",
        maxConcurrent: 1,
        maxQueued: 0,
      },
      { fetch: fetchStub },
    );
    await tick();
    await tick();

    // The retryer wakes into a full gate. It must PARK, not 503.
    await Bun.sleep(80);
    resolveCompetitor(completedStream());
    await competitor;

    const result = await retryer;
    expect(result.stop_reason).toBe("end_turn");
    expect(retryerCalls).toBe(2);
  });

  test("a NEW arrival is still rejected with queue_full while the gate is saturated", async () => {
    // The bound must still hold at arrival — the re-admission carve-out is not
    // a licence to park unboundedly.
    let resolveFirst: (response: Response) => void = () => {};
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const fetchStub = (() => {
      calls++;
      return calls === 1 ? firstPending : Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const active = generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, maxQueued: 0 },
      { fetch: fetchStub },
    );
    await tick();

    await expect(
      generate(
        { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1, maxQueued: 0 },
        { fetch: fetchStub },
      ),
    ).rejects.toMatchObject({ status: 503, type: "queue_full" });

    resolveFirst(completedStream());
    await active;
  });
});

describe("generate retry resource handling", () => {
  test("unrelated work runs while a request is sleeping for backoff", async () => {
    const callOrder: string[] = [];
    let firstA = true;
    const fetchStub = ((_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { instructions?: string };
      const key = body.instructions ?? "";
      callOrder.push(key);
      if (key === "backoff" && firstA) {
        firstA = false;
        return Promise.resolve(new Response("slow", { status: 429, headers: { "retry-after-ms": "50" } }));
      }
      return Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const backingOff = generate(
      { req: makeReq({ prompt_cache_key: "backoff", system: "backoff" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );
    await tick();
    const unrelated = generate(
      { req: makeReq({ prompt_cache_key: "unrelated", system: "unrelated" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );

    await unrelated;
    expect(callOrder).toEqual(["backoff", "unrelated"]);
    await backingOff;
    expect(callOrder).toEqual(["backoff", "unrelated", "backoff"]);
  });

  test("unrelated work runs while credentials refresh", async () => {
    const callOrder: string[] = [];
    let releaseRefresh: () => void = () => {};
    const refreshPending = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let firstA = true;
    const fetchStub = ((_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { instructions?: string };
      const key = body.instructions ?? "";
      callOrder.push(key);
      if (key === "refresh" && firstA) {
        firstA = false;
        return Promise.resolve(new Response("unauthorized", { status: 401 }));
      }
      return Promise.resolve(completedStream());
    }) as unknown as typeof fetch;
    const forceRefresh = async () => {
      await refreshPending;
      return makeCred("refreshed");
    };

    const refreshing = generate(
      { req: makeReq({ prompt_cache_key: "refresh", system: "refresh" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub, forceRefresh },
    );
    await tick();
    const unrelated = generate(
      { req: makeReq({ prompt_cache_key: "unrelated", system: "unrelated" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: fetchStub },
    );

    await unrelated;
    expect(callOrder).toEqual(["refresh", "unrelated"]);
    releaseRefresh();
    await refreshing;
    expect(callOrder).toEqual(["refresh", "unrelated", "refresh"]);
  });

  test("per-key serialization survives the slot-release fix", async () => {
    // Releasing the GLOBAL slot around the backoff sleep must not weaken
    // per-key serialization: the second "k" request may not fire until the
    // first "k" request's retry has completed.
    const order: string[] = [];
    let firstCall = true;
    const fetchStub = ((_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { instructions?: string };
      order.push(`${body.instructions ?? ""}#${order.length + 1}`);
      if (firstCall) {
        firstCall = false;
        return Promise.resolve(new Response("slow", { status: 429, headers: { "retry-after-ms": "50" } }));
      }
      return Promise.resolve(completedStream());
    }) as unknown as typeof fetch;

    const first = generate(
      { req: makeReq({ prompt_cache_key: "k", system: "k" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch: fetchStub },
    );
    await tick();
    const second = generate(
      { req: makeReq({ prompt_cache_key: "k", system: "k" }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 4 },
      { fetch: fetchStub },
    );

    // Mid-backoff: the first request holds the key lock, so the second must
    // still be parked even though a global slot is free.
    await tick();
    await tick();
    expect(order).toEqual(["k#1"]);

    await first;
    await second;
    // The retry (call 2) must precede the second request's first call (3).
    expect(order).toEqual(["k#1", "k#2", "k#3"]);
  });

  for (const status of [401, 429, 500]) {
    test(`cancels the ${status} response body before retrying`, async () => {
      let cancelled = 0;
      const retryBody = new ReadableStream<Uint8Array>({
        cancel() {
          cancelled++;
        },
      });
      const retryResponse = new Response(retryBody, {
        status,
        headers: status === 429 ? { "retry-after-ms": "0" } : undefined,
      });
      const { fetch } = scriptedFetch([retryResponse, completedStream()]);

      await generate(
        { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
        { fetch, forceRefresh: async () => makeCred("refreshed") },
      );

      expect(cancelled).toBe(1);
    });
  }
});

describe("generate stream parsing", () => {
  test("malformed JSON for a recognized event is a stream_error and is not dispatched", async () => {
    const malformed = new Response(
      "event: response.completed\ndata: {not-json}\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
    const { emit, events } = capturingEmit();

    await expect(
      generate(
        { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
        { fetch: (() => Promise.resolve(malformed)) as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ status: 502, type: "stream_error" });
    expect(events).toEqual([]);
  });

  test("malformed JSON for a recognized NON-terminal event is a stream_error", async () => {
    const malformed = new Response(
      "event: response.created\ndata: {broken\n\nevent: response.completed\ndata: {\"response\":{\"id\":\"r\"}}\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
    const { emit, events } = capturingEmit();

    await expect(
      generate(
        { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
        { fetch: (() => Promise.resolve(malformed)) as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      status: 502,
      type: "stream_error",
      // The PROVIDER must reject before dispatch — not merely inherit the
      // collector's downstream complaint about an empty envelope.
      message: "malformed SSE payload for response.created",
    });
    expect(events).toEqual([]);
  });

  test("a terminal event whose payload is not an object is a stream_error", async () => {
    const { emit, events } = capturingEmit();
    const nonObject = new Response(
      "event: response.completed\ndata: null\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );

    await expect(
      generate(
        { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
        { fetch: (() => Promise.resolve(nonObject)) as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      status: 502,
      type: "stream_error",
      message: "malformed SSE payload for response.completed",
    });
    expect(events).toEqual([]);
  });

  test("a numeric terminal payload is also a stream_error", async () => {
    const numeric = new Response(
      "event: response.completed\ndata: 42\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );

    await expect(
      generate(
        { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
        { fetch: (() => Promise.resolve(numeric)) as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      status: 502,
      type: "stream_error",
      message: "malformed SSE payload for response.completed",
    });
  });

  test("an UNRECOGNIZED event with malformed data stays tolerated", async () => {
    // Forward compatibility: the collector ignores events it has not been
    // taught about, so a garbled payload on one of them must not fail the run.
    const body =
      "event: response.some_future_thing\ndata: {broken\n\n" +
      'event: response.created\ndata: {"response":{"id":"resp_1","model":"gpt-5","status":"in_progress","usage":{"input_tokens":1,"output_tokens":0}}}\n\n' +
      'event: response.completed\ndata: {"response":{"id":"resp_1","model":"gpt-5","status":"completed","usage":{"input_tokens":1,"output_tokens":2}}}\n\n';
    const tolerated = new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });

    const result = await generate(
      { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: (() => Promise.resolve(tolerated)) as unknown as typeof fetch },
    );
    expect(result.stop_reason).toBe("end_turn");
    expect(result.usage.output_tokens).toBe(2);
  });

  test("an empty data field is dispatched, not rejected as a malformed payload", async () => {
    // `data:` with no value must keep dispatching `{}` to the collector —
    // over-rejecting at the provider would turn upstream keep-alives into hard
    // stream failures. (The collector may still reject the empty envelope; what
    // this pins is that the PROVIDER did not short-circuit before dispatch.)
    const heartbeat = new Response(
      'event: response.created\ndata: {"response":{"id":"resp_1","model":"gpt-5","status":"in_progress"}}\n\n' +
        "event: response.output_text.delta\ndata:\n\n" +
        'event: response.completed\ndata: {"response":{"id":"resp_1","model":"gpt-5","status":"completed","usage":{"input_tokens":1,"output_tokens":2}}}\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
    const { emit, events } = capturingEmit();

    const result = await generate(
      { req: makeReq(), emit, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
      { fetch: (() => Promise.resolve(heartbeat)) as unknown as typeof fetch },
    );
    expect(result.stop_reason).toBe("end_turn");
    expect(events.map((e) => e.type)).toContain("message_stop");
  });

  test("maps oversized SSE frames to stream_error", async () => {
    const oversized = new Response(
      `event: response.completed\ndata: ${"x".repeat(70_000)}\n\n`,
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );

    await expect(
      generate(
        { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
        { fetch: (() => Promise.resolve(oversized)) as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ status: 502, type: "stream_error" });
  });
});

describe("debug log hardening", () => {
  /**
   * Run `fn` with the LUCA_CODE_DEBUG_* env block set to `vars`, restoring whatever
   * was there before. Keys mapped to `undefined` are deleted for the duration.
   */
  async function withDebugEnv(
    vars: Record<string, string | undefined>,
    fn: () => Promise<void>,
  ): Promise<void> {
    const keys = ["LUCA_CODE_DEBUG", "LUCA_CODE_DEBUG_FILE", "LUCA_CODE_DEBUG_SENSITIVE", "LUCA_CODE_DEBUG_MAX_BYTES"];
    const previous: Record<string, string | undefined> = {};
    for (const k of keys) previous[k] = process.env[k];
    try {
      for (const k of keys) {
        const v = vars[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await fn();
    } finally {
      for (const k of keys) {
        const v = previous[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  test("uses private permissions, redacts content, and caps the regular file", async () => {
    const root = mkdtempSync(join(tmpdir(), "luca-code-debug-"));
    const logDir = join(root, "logs");
    const logFile = join(logDir, "debug.log");
    const previous = {
      debug: process.env.LUCA_CODE_DEBUG,
      file: process.env.LUCA_CODE_DEBUG_FILE,
      sensitive: process.env.LUCA_CODE_DEBUG_SENSITIVE,
      max: process.env.LUCA_CODE_DEBUG_MAX_BYTES,
    };
    process.env.LUCA_CODE_DEBUG = "1";
    process.env.LUCA_CODE_DEBUG_FILE = logFile;
    delete process.env.LUCA_CODE_DEBUG_SENSITIVE;
    process.env.LUCA_CODE_DEBUG_MAX_BYTES = "512";

    try {
      const secret = "never-log-this-secret";
      const response = sseResponse([
        {
          event: "response.created",
          data: { response: { id: "r", model: "gpt-5", status: "in_progress", usage: { input_tokens: 1, output_tokens: 0 } } },
        },
        { event: "response.output_text.delta", data: { delta: secret } },
        {
          event: "response.completed",
          data: { response: { id: "r", model: "gpt-5", status: "completed", usage: { input_tokens: 1, output_tokens: 1 } } },
        },
      ]);
      await generate(
        { req: makeReq({ messages: [{ role: "user", content: secret }] }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
        { fetch: (() => Promise.resolve(response)) as unknown as typeof fetch },
      );

      expect(statSync(logDir).mode & 0o777).toBe(0o700);
      expect(statSync(logFile).mode & 0o777).toBe(0o600);
      expect(statSync(logFile).size).toBeLessThanOrEqual(512);
      expect(readFileSync(logFile, "utf8")).not.toContain(secret);
    } finally {
      process.env.LUCA_CODE_DEBUG = previous.debug;
      process.env.LUCA_CODE_DEBUG_FILE = previous.file;
      process.env.LUCA_CODE_DEBUG_SENSITIVE = previous.sensitive;
      process.env.LUCA_CODE_DEBUG_MAX_BYTES = previous.max;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a symlink debug path without touching its target", async () => {
    const root = mkdtempSync(join(tmpdir(), "luca-code-debug-link-"));
    const target = join(root, "target.log");
    const link = join(root, "debug.log");
    writeFileSync(target, "unchanged", { mode: 0o600 });
    symlinkSync(target, link);
    const previousDebug = process.env.LUCA_CODE_DEBUG;
    const previousFile = process.env.LUCA_CODE_DEBUG_FILE;
    process.env.LUCA_CODE_DEBUG = "1";
    process.env.LUCA_CODE_DEBUG_FILE = link;

    try {
      await generate(
        { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
        { fetch: (() => Promise.resolve(completedStream())) as unknown as typeof fetch },
      );
      expect(readFileSync(target, "utf8")).toBe("unchanged");
    } finally {
      process.env.LUCA_CODE_DEBUG = previousDebug;
      process.env.LUCA_CODE_DEBUG_FILE = previousFile;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("tightens a pre-existing loose-mode log file", async () => {
    const root = mkdtempSync(join(tmpdir(), "luca-code-debug-mode-"));
    const logFile = join(root, "debug.log");
    writeFileSync(logFile, "stale\n", { mode: 0o644 });
    chmodSync(logFile, 0o644);
    expect(statSync(logFile).mode & 0o777).toBe(0o644);

    try {
      await withDebugEnv({ LUCA_CODE_DEBUG: "1", LUCA_CODE_DEBUG_FILE: logFile }, async () => {
        await generate(
          { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
          { fetch: (() => Promise.resolve(completedStream())) as unknown as typeof fetch },
        );
      });
      // appendFileSync's `mode` only applies at CREATION — an existing loose
      // file must be explicitly tightened.
      expect(statSync(logFile).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("LUCA_CODE_DEBUG_SENSITIVE opts back in to full content", async () => {
    const root = mkdtempSync(join(tmpdir(), "luca-code-debug-sensitive-"));
    const logFile = join(root, "logs", "debug.log");
    const secret = "never-log-this-secret";

    try {
      await withDebugEnv(
        { LUCA_CODE_DEBUG: "1", LUCA_CODE_DEBUG_FILE: logFile, LUCA_CODE_DEBUG_SENSITIVE: "1" },
        async () => {
          await generate(
            { req: makeReq({ messages: [{ role: "user", content: secret }] }), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
            { fetch: (() => Promise.resolve(completedStream())) as unknown as typeof fetch },
          );
        },
      );
      // Redaction is a deliberate DEFAULT, not a lost capability.
      expect(readFileSync(logFile, "utf8")).toContain(secret);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("scrubs credential-shaped values out of an upstream error body", async () => {
    const root = mkdtempSync(join(tmpdir(), "luca-code-debug-scrub-"));
    const logFile = join(root, "logs", "debug.log");

    try {
      await withDebugEnv({ LUCA_CODE_DEBUG: "1", LUCA_CODE_DEBUG_FILE: logFile }, async () => {
        const { fetch } = scriptedFetch([
          new Response('{"error":{"message":"invalid token sk-live-ABC123"}}', { status: 401 }),
          completedStream(),
        ]);
        await generate(
          { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
          { fetch, forceRefresh: async () => makeCred("access-2") },
        );
      });
      const log = readFileSync(logFile, "utf8");
      expect(log).toContain("invalid token");
      expect(log).not.toContain("sk-live-ABC123");
      // The bearer credential must never reach the log either.
      expect(log).not.toContain("Bearer access-1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps the log under LUCA_CODE_DEBUG_MAX_BYTES across many runs", async () => {
    const root = mkdtempSync(join(tmpdir(), "luca-code-debug-cap-"));
    const logFile = join(root, "logs", "debug.log");

    try {
      await withDebugEnv(
        { LUCA_CODE_DEBUG: "1", LUCA_CODE_DEBUG_FILE: logFile, LUCA_CODE_DEBUG_MAX_BYTES: "1024" },
        async () => {
          for (let i = 0; i < 20; i++) {
            await generate(
              { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
              { fetch: (() => Promise.resolve(completedStream())) as unknown as typeof fetch },
            );
            expect(statSync(logFile).size).toBeLessThanOrEqual(1024);
          }
        },
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an unwritable debug path never breaks the request", async () => {
    const root = mkdtempSync(join(tmpdir(), "luca-code-debug-ro-"));
    const lockedDir = join(root, "locked");
    mkdirSync(lockedDir, { mode: 0o500 });
    chmodSync(lockedDir, 0o500);
    const logFile = join(lockedDir, "nested", "debug.log");

    try {
      await withDebugEnv({ LUCA_CODE_DEBUG: "1", LUCA_CODE_DEBUG_FILE: logFile }, async () => {
        const result = await generate(
          { req: makeReq(), emit: () => {}, cred: makeCred(), model: "gpt-5", defaultEffort: "medium", maxConcurrent: 1 },
          { fetch: (() => Promise.resolve(completedStream())) as unknown as typeof fetch },
        );
        expect(result.stop_reason).toBe("end_turn");
        expect(result.usage.output_tokens).toBe(5);
      });
    } finally {
      chmodSync(lockedDir, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the redacted request dump describes the body that is actually SENT", async () => {
    const root = mkdtempSync(join(tmpdir(), "luca-code-debug-reasoning-"));
    const logFile = join(root, "logs", "debug.log");

    try {
      await withDebugEnv(
        { LUCA_CODE_DEBUG: "1", LUCA_CODE_DEBUG_FILE: logFile, LUCA_CODE_DEBUG_MAX_BYTES: "65536" },
        async () => {
          let sentBody: Record<string, unknown> = {};
          await generate(
            {
              req: makeReq({ thinking: { type: "adaptive" } }),
              emit: () => {},
              cred: makeCred(),
              model: "gpt-5",
              defaultEffort: "high",
              maxConcurrent: 1,
            },
            {
              fetch: ((_url: string, init: { body: string }) => {
                sentBody = JSON.parse(init.body) as Record<string, unknown>;
                return Promise.resolve(completedStream());
              }) as unknown as typeof fetch,
            },
          );

          // The body really did carry reasoning…
          expect(sentBody["reasoning"]).toEqual({ effort: "high", summary: "auto" });
          expect(sentBody["include"]).toEqual(["reasoning.encrypted_content"]);

          // …so the dump an operator reads must say so. Dumping before the
          // reasoning injection logged `"reasoning": false` for a request that
          // DID ask for reasoning — the exact inverse of the diagnostic.
          const log = readFileSync(logFile, "utf8");
          expect(log).toContain('"reasoning": true');
          expect(log).not.toContain('"reasoning": false');
          expect(log).toContain('"reasoning_effort": "high"');
          expect(log).toContain('"include"');
          // The reported byte count must match the body actually serialized.
          const bytes = /"bytes": (\d+)/.exec(log)?.[1];
          expect(Number(bytes)).toBe(JSON.stringify(sentBody).length);
        },
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
