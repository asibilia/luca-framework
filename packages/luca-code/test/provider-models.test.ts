/**
 * provider-models.test.ts — TDD suite for provider/models.ts (step 10).
 *
 * Exercises the macaz-ported subscriptionModels flow: fetch the codex models
 * listing with subscription auth headers, retry once on 401 via forceRefresh,
 * parse / filter / sort / map to Model[], mark the first as default, and cache
 * the result in-memory for 5 minutes. All HTTP is routed through a scriptable
 * in-memory fetch stub so the suite never touches the network.
 */
import { test, expect, describe, beforeEach, afterEach } from "bun:test";

import {
  fetchSubscriptionModels,
  clearModelsCache,
  MODELS_CACHE_TTL_MS,
  type Model,
} from "../src/provider/models";
import type { Credential } from "../src/auth/credentials";
import { MODELS_ENDPOINT, CLIENT_VERSION } from "../src/constants";

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

const UA = "cc-openai-bridge/0.144.5";
const ACCOUNT_ID = "acct_42";

/** Build a minimal valid Credential. */
function makeCred(over: Partial<Credential> = {}): Credential {
  return {
    type: "openai_account_oauth",
    method: "chatgpt_headless",
    access: "access-AAA",
    refresh: "refresh-RRR",
    expires_at: Date.now() + 3_600_000,
    account_id: ACCOUNT_ID,
    id_token: "idtoken",
    ...over,
  };
}

/** One raw model entry as it appears on the wire. */
interface RawModel {
  slug: string;
  display_name: string;
  description?: string;
  default_reasoning_level?: string;
  supported_reasoning_levels?: Array<{ effort: string }>;
  visibility?: string;
  priority?: number;
  input_modalities?: string[];
  context_window?: number;
}

/** Build a raw models response body. */
function modelsBody(models: RawModel[]): Record<string, unknown> {
  return { models };
}

/** A scripted fetch handler capturing calls. */
type CapturedCall = { url: string; method: string; headers: Record<string, string> };

function installFetch(
  responses: Array<{ status: number; body: unknown }>,
): { calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  let i = 0;
  const handler = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as { url?: string }).url ?? "";
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const k of Object.keys(h)) headers[k] = h[k] ?? "";
    }
    calls.push({ url, method, headers });
    const resp = responses[i] ?? responses[responses.length - 1]!;
    i++;
    return new Response(JSON.stringify(resp!.body), {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  globalThis.fetch = handler as unknown as typeof globalThis.fetch;
  return { calls };
}

const originalFetch = globalThis.fetch;
function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

/** Build options for fetchSubscriptionModels with injectable creds + refresh. */
function makeOpts(
  over: Partial<{
    getCredentials: () => Promise<Credential>;
    forceRefresh: (rejectedAccess: string) => Promise<Credential>;
    ua: string;
    accountId: string;
  }> = {},
): {
  getCredentials: () => Promise<Credential>;
  forceRefresh: (rejectedAccess: string) => Promise<Credential>;
  ua: string;
  accountId: string;
} {
  return {
    getCredentials: over.getCredentials ?? (async () => makeCred()),
    forceRefresh: over.forceRefresh ?? (async () => makeCred({ access: "access-BBB" })),
    ua: over.ua ?? UA,
    accountId: over.accountId ?? ACCOUNT_ID,
  };
}

/** Index access that satisfies `noUncheckedIndexedAccess` (asserts non-undefined). */
function nth<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of bounds (len ${arr.length})`);
  return v;
}

beforeEach(clearModelsCache);
afterEach(restoreFetch);

/* -------------------------------------------------------------------------- */
/* GOLDEN — full mapping                                                      */
/* -------------------------------------------------------------------------- */

test("GOLDEN: valid response maps, filters, sorts, marks first as default", async () => {
  const { calls } = installFetch([
    {
      status: 200,
      body: modelsBody([
        {
          slug: "gpt-5",
          display_name: "GPT-5",
          description: "frontier",
          default_reasoning_level: "high",
          supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }, { effort: "high" }],
          visibility: "list",
          priority: 2,
          input_modalities: ["text", "image", "file"],
          context_window: 200_000,
        },
        {
          slug: "gpt-5-mini",
          display_name: "GPT-5 Mini",
          description: "fast",
          supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }],
          visibility: "list",
          priority: 1,
          input_modalities: ["text"],
          context_window: 128_000,
        },
        {
          slug: "hidden-internal",
          display_name: "Hidden",
          visibility: "internal",
          priority: 0,
          input_modalities: ["text"],
          context_window: 64_000,
        },
      ]),
    },
  ]);

  const models = await fetchSubscriptionModels(makeOpts());

  // hidden-internal filtered out (visibility !== "list").
  expect(models).toHaveLength(2);
  // Sorted by priority asc: mini (1) before gpt-5 (2).
  expect(nth(models, 0).id).toBe("gpt-5-mini");
  expect(nth(models, 1).id).toBe("gpt-5");
  // First model marked default.
  expect(nth(models, 0).Default).toBe(true);
  expect(nth(models, 1).Default).toBe(false);

  // Field-by-field mapping for gpt-5.
  const gpt5 = nth(models, 1);
  expect(gpt5.displayName).toBe("GPT-5");
  expect(gpt5.description).toBe("frontier");
  expect(gpt5.efforts).toEqual(["low", "medium", "high"]);
  expect(gpt5.inputModalities).toEqual(["text", "image", "file"]);
  expect(gpt5.contextWindow).toBe(200_000);
  expect(gpt5.toolCall).toBe(true);
  expect(gpt5.attachment).toBe(true); // image | file present

  // mini has only text -> attachment false.
  const mini = nth(models, 0);
  expect(mini.attachment).toBe(false);
  expect(mini.efforts).toEqual(["low", "medium"]);

  // URL + GET.
  expect(nth(calls, 0).method).toBe("GET");
  expect(nth(calls, 0).url).toBe(`${MODELS_ENDPOINT}?client_version=${CLIENT_VERSION}`);
});

/* -------------------------------------------------------------------------- */
/* headers                                                                    */
/* -------------------------------------------------------------------------- */

test("sends subscription auth headers", async () => {
  const { calls } = installFetch([
    { status: 200, body: modelsBody([{ slug: "m", display_name: "M", visibility: "list", priority: 1, input_modalities: ["text"], context_window: 1000 }]) },
  ]);

  await fetchSubscriptionModels(makeOpts({
    getCredentials: async () => makeCred({ access: "tok-123" }),
  }));

  const h = nth(calls, 0).headers;
  expect(h["Authorization"]!).toBe("Bearer tok-123");
  expect(h["originator"]!).toBe("cc-openai-bridge");
  expect(h["version"]!).toBe(CLIENT_VERSION);
  expect(h["User-Agent"]!).toBe(UA);
  expect(h["ChatGPT-Account-Id"]!).toBe(ACCOUNT_ID);
});

/* -------------------------------------------------------------------------- */
/* filter + sort                                                              */
/* -------------------------------------------------------------------------- */

test("drops entries whose visibility is not 'list'", async () => {
  installFetch([
    {
      status: 200,
      body: modelsBody([
        { slug: "a", display_name: "A", visibility: "unlisted", priority: 1, input_modalities: ["text"], context_window: 1 },
        { slug: "b", display_name: "B", visibility: "list", priority: 2, input_modalities: ["text"], context_window: 1 },
        { slug: "c", display_name: "C", visibility: "hidden", priority: 3, input_modalities: ["text"], context_window: 1 },
      ]),
    },
  ]);
  const models = await fetchSubscriptionModels(makeOpts());
  expect(models.map((m) => m.id)).toEqual(["b"]);
});

test("sorts by priority ascending and marks the lowest-priority model default", async () => {
  installFetch([
    {
      status: 200,
      body: modelsBody([
        { slug: "z", display_name: "Z", visibility: "list", priority: 99, input_modalities: ["text"], context_window: 1 },
        { slug: "m", display_name: "M", visibility: "list", priority: 50, input_modalities: ["text"], context_window: 1 },
        { slug: "a", display_name: "A", visibility: "list", priority: 1, input_modalities: ["text"], context_window: 1 },
      ]),
    },
  ]);
  const models = await fetchSubscriptionModels(makeOpts());
  expect(models.map((m) => m.id)).toEqual(["a", "m", "z"]);
  expect(nth(models, 0).Default).toBe(true);
  expect(nth(models, 1).Default).toBe(false);
  expect(nth(models, 2).Default).toBe(false);
});

/* -------------------------------------------------------------------------- */
/* attachment flag                                                            */
/* -------------------------------------------------------------------------- */

test("attachment is true when input_modalities include image or file", async () => {
  installFetch([
    {
      status: 200,
      body: modelsBody([
        { slug: "img", display_name: "Img", visibility: "list", priority: 1, input_modalities: ["text", "image"], context_window: 1 },
        { slug: "file", display_name: "File", visibility: "list", priority: 2, input_modalities: ["text", "file"], context_window: 1 },
        { slug: "txt", display_name: "Txt", visibility: "list", priority: 3, input_modalities: ["text"], context_window: 1 },
      ]),
    },
  ]);
  const models = await fetchSubscriptionModels(makeOpts());
  expect(models.find((m) => m.id === "img")?.attachment).toBe(true);
  expect(models.find((m) => m.id === "file")?.attachment).toBe(true);
  expect(models.find((m) => m.id === "txt")?.attachment).toBe(false);
});

/* -------------------------------------------------------------------------- */
/* empty models -> []                                                         */
/* -------------------------------------------------------------------------- */

test("returns [] when models array is empty", async () => {
  installFetch([{ status: 200, body: modelsBody([]) }]);
  const models = await fetchSubscriptionModels(makeOpts());
  expect(models).toEqual([]);
});

test("returns [] when all models are filtered out", async () => {
  installFetch([
    {
      status: 200,
      body: modelsBody([
        { slug: "x", display_name: "X", visibility: "internal", priority: 1, input_modalities: ["text"], context_window: 1 },
      ]),
    },
  ]);
  const models = await fetchSubscriptionModels(makeOpts());
  expect(models).toEqual([]);
});

/* -------------------------------------------------------------------------- */
/* 401 retry                                                                  */
/* -------------------------------------------------------------------------- */

test("retries once on 401 via forceRefresh, then succeeds", async () => {
  const { calls } = installFetch([
    { status: 401, body: { error: "unauthorized" } },
    {
      status: 200,
      body: modelsBody([
        { slug: "m", display_name: "M", visibility: "list", priority: 1, input_modalities: ["text"], context_window: 1 },
      ]),
    },
  ]);

  let refreshCalls = 0;
  const refreshed = makeCred({ access: "access-REFRESHED" });
  const opts = makeOpts({
    getCredentials: async () => makeCred({ access: "access-OLD" }),
    forceRefresh: async (rejectedAccess: string) => {
      refreshCalls++;
      expect(rejectedAccess).toBe("access-OLD");
      return refreshed;
    },
  });

  const models = await fetchSubscriptionModels(opts);
  expect(models.map((m) => m.id)).toEqual(["m"]);
  expect(refreshCalls).toBe(1);
  // Two fetch calls: first 401, second 200 with refreshed token.
  expect(calls).toHaveLength(2);
  expect(nth(calls, 0).headers["Authorization"]!).toBe("Bearer access-OLD");
  expect(nth(calls, 1).headers["Authorization"]!).toBe("Bearer access-REFRESHED");
});

test("throws when retry also returns 401", async () => {
  installFetch([
    { status: 401, body: { error: "unauthorized" } },
    { status: 401, body: { error: "still unauthorized" } },
  ]);

  let refreshCalls = 0;
  const opts = makeOpts({
    getCredentials: async () => makeCred({ access: "access-OLD" }),
    forceRefresh: async () => {
      refreshCalls++;
      return makeCred({ access: "access-REFRESHED" });
    },
  });

  await expect(fetchSubscriptionModels(opts)).rejects.toThrow();
  expect(refreshCalls).toBe(1);
});

test("does not retry on non-401 errors", async () => {
  installFetch([{ status: 500, body: { error: "server" } }]);
  let refreshCalls = 0;
  const opts = makeOpts({
    forceRefresh: async () => {
      refreshCalls++;
      return makeCred();
    },
  });
  await expect(fetchSubscriptionModels(opts)).rejects.toThrow();
  expect(refreshCalls).toBe(0);
});

/* -------------------------------------------------------------------------- */
/* cache                                                                      */
/* -------------------------------------------------------------------------- */

test("caches result in-memory for 5 minutes", async () => {
  let fetchCalls = 0;
  const handler = async (): Promise<Response> => {
    fetchCalls++;
    return new Response(
      JSON.stringify(modelsBody([
        { slug: "m", display_name: "M", visibility: "list", priority: 1, input_modalities: ["text"], context_window: 1 },
      ])),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  globalThis.fetch = handler as unknown as typeof globalThis.fetch;

  const opts = makeOpts();
  const first = await fetchSubscriptionModels(opts);
  const second = await fetchSubscriptionModels(opts);
  expect(first).toBe(second); // same cached reference
  expect(fetchCalls).toBe(1);
});

test("re-fetches after cache expires", async () => {
  let fetchCalls = 0;
  const handler = async (): Promise<Response> => {
    fetchCalls++;
    return new Response(
      JSON.stringify(modelsBody([
        { slug: `m${fetchCalls}`, display_name: "M", visibility: "list", priority: 1, input_modalities: ["text"], context_window: 1 },
      ])),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  globalThis.fetch = handler as unknown as typeof globalThis.fetch;

  const opts = makeOpts();
  await fetchSubscriptionModels(opts);
  expect(fetchCalls).toBe(1);

  // Advance the clock past the TTL.
  const realNow = Date.now;
  const base = Date.now();
  Date.now = () => base + MODELS_CACHE_TTL_MS + 1;
  try {
    await fetchSubscriptionModels(opts);
    expect(fetchCalls).toBe(2);
  } finally {
    Date.now = realNow;
  }
});

test("clearModelsCache forces a re-fetch", async () => {
  let fetchCalls = 0;
  const handler = async (): Promise<Response> => {
    fetchCalls++;
    return new Response(
      JSON.stringify(modelsBody([
        { slug: "m", display_name: "M", visibility: "list", priority: 1, input_modalities: ["text"], context_window: 1 },
      ])),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  globalThis.fetch = handler as unknown as typeof globalThis.fetch;

  const opts = makeOpts();
  await fetchSubscriptionModels(opts);
  expect(fetchCalls).toBe(1);
  clearModelsCache();
  await fetchSubscriptionModels(opts);
  expect(fetchCalls).toBe(2);
});