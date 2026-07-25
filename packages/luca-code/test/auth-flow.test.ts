/**
 * auth-flow.test.ts — TDD suite for auth/openai-subscription.ts (step 9).
 *
 * Exercises the macaz-ported device-flow: usercode issuance -> device-token
 * polling -> authorization-code exchange -> credential build, plus the
 * load/refresh/force-refresh credential lifecycle. All HTTP is routed through
 * a scriptable in-memory fetch stub so the suite never touches the network.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  authorizeSubscription,
  getCredentials,
  refreshCredential,
  forceRefresh,
} from "../src/auth/openai-subscription";
import type { Credential } from "../src/auth/credentials";
import { loadCredentials, saveCredentials } from "../src/auth/credentials";
import {
  CLIENT_ID,
  DEVICE_URL,
  DEVICE_USER_CODE_URL,
  DEVICE_TOKEN_URL,
  TOKEN_ENDPOINT,
  DEVICE_CALLBACK_URL,
  POLL_SAFETY_MS,
} from "../src/constants";

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Build a JWT-shaped id_token whose payload decodes to the given claims. */
function makeIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

/** A scripted fetch handler. */
type FetchInit = {
  method: string;
  headers: Record<string, string>;
  body?: string | URLSearchParams;
};

interface RoutedResponse {
  status: number;
  body: unknown;
}

/**
 * Install a fetch stub that routes by URL. Each route maps to a queue of
 * responses (consumed in order); when a queue empties, the last response is
 * repeated. Captures every call for header/body assertions.
 */
function installFetch(routes: Record<string, RoutedResponse[]>, opts: { repeatLast?: boolean } = {}) {
  const calls: Array<{ url: string; init: FetchInit }> = [];
  const queues: Record<string, RoutedResponse[]> = JSON.parse(JSON.stringify(routes));
  const cursors: Record<string, number> = {};

  const handler = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const inputStr = typeof input === "string"
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
    const body = init?.body as string | URLSearchParams | undefined;
    calls.push({ url: inputStr, init: { method, headers, body } });

    const queue = queues[inputStr];
    if (!queue) throw new Error(`unexpected fetch to ${inputStr}`);
    const idx = cursors[inputStr] ?? 0;
    let resp = queue[idx];
    if (resp === undefined) {
      if (opts.repeatLast === false) throw new Error(`queue empty for ${inputStr}`);
      resp = queue[queue.length - 1]!;
    } else {
      cursors[inputStr] = idx + 1;
    }
    return new Response(JSON.stringify(resp.body), {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  };

  globalThis.fetch = handler as unknown as typeof globalThis.fetch;
  return calls;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

const originalFetch = globalThis.fetch;

/** Build a token response body. */
function tokenBody(overrides: Partial<{
  access_token: string;
  refresh_token: string;
  expires_in: number | string;
  id_token: string;
}> = {}): Record<string, unknown> {
  return {
    access_token: "access-NEW",
    refresh_token: "refresh-NEW",
    expires_in: 3600,
    id_token: makeIdToken({ chatgpt_account_id: "acct_99" }),
    ...overrides,
  };
}

const UA = "cc-openai-bridge/0.144.5";

/* -------------------------------------------------------------------------- */
/* authorizeSubscription                                                      */
/* -------------------------------------------------------------------------- */

describe("authorizeSubscription", () => {
  afterEach(restoreFetch);

  test("full device flow returns a credential with account_id from id_token", async () => {
    const calls = installFetch({
      [DEVICE_USER_CODE_URL]: [{ status: 200, body: { device_auth_id: "daid", user_code: "ABC1234", interval: 1 } }],
      [DEVICE_TOKEN_URL]: [{ status: 200, body: { authorization_code: "authcode", code_verifier: "verifier" } }],
      [TOKEN_ENDPOINT]: [{ status: 200, body: tokenBody() }],
    });

    let readyInfo: { deviceURL: string; userCode: string } | null = null;
    const cred = await authorizeSubscription({
      ready: (info) => { readyInfo = info; },
      ua: UA,
    });

    // ready callback received the device URL and the user code.
    expect(readyInfo).not.toBeNull();
    expect(readyInfo!.deviceURL).toBe(DEVICE_URL);
    expect(readyInfo!.userCode).toBe("ABC1234");

    // credential built from the exchanged tokens.
    expect(cred.type).toBe("openai_account_oauth");
    expect(cred.method).toBe("chatgpt_headless");
    expect(cred.access).toBe("access-NEW");
    expect(cred.refresh).toBe("refresh-NEW");
    expect(cred.account_id).toBe("acct_99");
    expect(cred.id_token).toContain(".");

    // start POST sent client_id with the User-Agent header.
    const start = calls.find((c) => c.url === DEVICE_USER_CODE_URL)!;
    expect(start.init.method).toBe("POST");
    expect(start.init.headers["User-Agent"]).toBe(UA);
    expect(JSON.parse(start.init.body as string)).toEqual({ client_id: CLIENT_ID });

    // exchange POST used the authorization_code form body.
    const ex = calls.find((c) => c.url === TOKEN_ENDPOINT)!;
    expect(ex.init.headers["User-Agent"]).toBe(UA);
    const exBody = new URLSearchParams(ex.init.body as URLSearchParams);
    expect(exBody.get("grant_type")).toBe("authorization_code");
    expect(exBody.get("code")).toBe("authcode");
    expect(exBody.get("redirect_uri")).toBe(DEVICE_CALLBACK_URL);
    expect(exBody.get("client_id")).toBe(CLIENT_ID);
    expect(exBody.get("code_verifier")).toBe("verifier");
  });

  test("polls through 403/404 then succeeds on 200", async () => {
    installFetch({
      [DEVICE_USER_CODE_URL]: [{ status: 200, body: { device_auth_id: "daid", user_code: "CODE", interval: 1 } }],
      [DEVICE_TOKEN_URL]: [
        { status: 403, body: { error: "authorization_pending" } },
        { status: 404, body: { error: "authorization_pending" } },
        { status: 200, body: { authorization_code: "late-code", code_verifier: "late-v" } },
      ],
      [TOKEN_ENDPOINT]: [{ status: 200, body: tokenBody({ id_token: makeIdToken({ account_id: "acct_late" }) }) }],
    });

    const cred = await authorizeSubscription({ ready: () => {}, ua: UA });
    expect(cred.account_id).toBe("acct_late");
  }, 30000);

  test("non-2xx (other than 403/404) polling response throws", async () => {
    installFetch({
      [DEVICE_USER_CODE_URL]: [{ status: 200, body: { device_auth_id: "daid", user_code: "CODE", interval: 1 } }],
      [DEVICE_TOKEN_URL]: [{ status: 400, body: { error: "bad_request" } }],
      [TOKEN_ENDPOINT]: [{ status: 200, body: tokenBody() }],
    });
    await expect(authorizeSubscription({ ready: () => {}, ua: UA })).rejects.toThrow();
  });

  test("usercode start non-2xx throws", async () => {
    installFetch({
      [DEVICE_USER_CODE_URL]: [{ status: 500, body: { error: "oops" } }],
    });
    await expect(authorizeSubscription({ ready: () => {}, ua: UA })).rejects.toThrow();
  });

  test("defaults expires_in to 3600 when omitted", async () => {
    installFetch({
      [DEVICE_USER_CODE_URL]: [{ status: 200, body: { device_auth_id: "daid", user_code: "CODE", interval: 1 } }],
      [DEVICE_TOKEN_URL]: [{ status: 200, body: { authorization_code: "c", code_verifier: "v" } }],
      [TOKEN_ENDPOINT]: [{ status: 200, body: { access_token: "a", refresh_token: "r", id_token: makeIdToken({ chatgpt_account_id: "acct_x" }) } }],
    });
    const before = Date.now();
    const cred = await authorizeSubscription({ ready: () => {}, ua: UA });
    // ~3600s expiry from now.
    expect(cred.expires_at).toBeGreaterThan(before + 3500 * 1000);
    expect(cred.expires_at).toBeLessThan(before + 3700 * 1000);
  });

  test("falls back account_id to access_token when id_token has no claim", async () => {
    installFetch({
      [DEVICE_USER_CODE_URL]: [{ status: 200, body: { device_auth_id: "daid", user_code: "CODE", interval: 1 } }],
      [DEVICE_TOKEN_URL]: [{ status: 200, body: { authorization_code: "c", code_verifier: "v" } }],
      [TOKEN_ENDPOINT]: [{ status: 200, body: { access_token: "ACCESS-TOK", refresh_token: "r", id_token: makeIdToken({ email: "u@x" }) } }],
    });
    const cred = await authorizeSubscription({ ready: () => {}, ua: UA });
    expect(cred.account_id).toBe("ACCESS-TOK");
  });

  test("accepts interval and expires_in as JSON strings (OpenAI returns strings)", async () => {
    // Reproduces the real-world login failure: auth.openai.com returns
    // `interval` and `expires_in` as JSON strings, not numbers. The schemas
    // must coerce them so the device flow and token exchange both validate.
    const calls = installFetch({
      [DEVICE_USER_CODE_URL]: [{ status: 200, body: { device_auth_id: "daid", user_code: "ABC1234", interval: "1" } }],
      [DEVICE_TOKEN_URL]: [{ status: 200, body: { authorization_code: "authcode", code_verifier: "verifier" } }],
      [TOKEN_ENDPOINT]: [{ status: 200, body: tokenBody({ expires_in: "3600" }) }],
    });

    const before = Date.now();
    const cred = await authorizeSubscription({ ready: () => {}, ua: UA });

    expect(cred.access).toBe("access-NEW");
    expect(cred.account_id).toBe("acct_99");
    // string "3600" coerced to 3600s expiry.
    expect(cred.expires_at).toBeGreaterThan(before + 3500 * 1000);
    expect(cred.expires_at).toBeLessThan(before + 3700 * 1000);

    // the usercode start still validated with a string interval.
    const start = calls.find((c) => c.url === DEVICE_USER_CODE_URL)!;
    expect(start.init.method).toBe("POST");
  });
});

/* -------------------------------------------------------------------------- */
/* refreshCredential                                                          */
/* -------------------------------------------------------------------------- */

describe("refreshCredential", () => {
  let profileDir: string;

  beforeEach(async () => { profileDir = await mkdtemp(join(tmpdir(), "luca-code-refresh-")); });
  afterEach(async () => { restoreFetch(); await rm(profileDir, { recursive: true, force: true }); });

  test("POSTs refresh_token grant and persists the new credential", async () => {
    const calls = installFetch({
      [TOKEN_ENDPOINT]: [{ status: 200, body: tokenBody({ access_token: "rotated", id_token: makeIdToken({ chatgpt_account_id: "acct_rot" }) }) }],
    });

    const cred = await refreshCredential({ profileDir, refreshToken: "old-refresh", ua: UA });
    expect(cred.access).toBe("rotated");
    expect(cred.account_id).toBe("acct_rot");

    // persisted to disk.
    const loaded = await loadCredentials(profileDir);
    expect(loaded?.access).toBe("rotated");
    expect(loaded?.refresh).toBe("refresh-NEW");

    // request shape.
    const ex = calls.find((c) => c.url === TOKEN_ENDPOINT)!;
    expect(ex.init.headers["User-Agent"]).toBe(UA);
    const body = new URLSearchParams(ex.init.body as URLSearchParams);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-refresh");
    expect(body.get("client_id")).toBe(CLIENT_ID);
  });

  test("non-2xx response throws", async () => {
    installFetch({
      [TOKEN_ENDPOINT]: [{ status: 401, body: { error: "invalid_grant" } }],
    });
    await expect(refreshCredential({ profileDir, refreshToken: "bad", ua: UA })).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* getCredentials                                                             */
/* -------------------------------------------------------------------------- */

describe("getCredentials", () => {
  let profileDir: string;

  beforeEach(async () => { profileDir = await mkdtemp(join(tmpdir(), "luca-code-getc-")); });
  afterEach(async () => { restoreFetch(); await rm(profileDir, { recursive: true, force: true }); });

  test("returns the persisted credential when still valid (no refresh)", async () => {
    const valid: Credential = {
      type: "openai_account_oauth",
      method: "chatgpt_headless",
      access: "valid-access",
      refresh: "valid-refresh",
      expires_at: Date.now() + 60 * 60 * 1000,
      account_id: "acct_keep",
      id_token: makeIdToken({ chatgpt_account_id: "acct_keep" }),
    };
    await saveCredentials(profileDir, valid);

    let fetched = false;
    globalThis.fetch = (async () => { fetched = true; return new Response("{}", { status: 500 }); }) as unknown as typeof globalThis.fetch;

    const cred = await getCredentials({ profileDir, ua: UA });
    expect(cred.access).toBe("valid-access");
    expect(fetched).toBe(false);
  });

  test("refreshes when the credential is expired", async () => {
    const expired: Credential = {
      type: "openai_account_oauth",
      method: "chatgpt_headless",
      access: "stale-access",
      refresh: "stale-refresh",
      expires_at: Date.now() - 60 * 1000,
      account_id: "acct_old",
      id_token: makeIdToken({ chatgpt_account_id: "acct_old" }),
    };
    await saveCredentials(profileDir, expired);

    installFetch({
      [TOKEN_ENDPOINT]: [{ status: 200, body: tokenBody({ access_token: "fresh-access" }) }],
    });

    const cred = await getCredentials({ profileDir, ua: UA });
    expect(cred.access).toBe("fresh-access");
  });

  test("throws when no credential is present", async () => {
    installFetch({ [TOKEN_ENDPOINT]: [{ status: 200, body: tokenBody() }] });
    await expect(getCredentials({ profileDir, ua: UA })).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* forceRefresh                                                               */
/* -------------------------------------------------------------------------- */

describe("forceRefresh", () => {
  let profileDir: string;

  beforeEach(async () => { profileDir = await mkdtemp(join(tmpdir(), "luca-code-force-")); });
  afterEach(async () => { restoreFetch(); await rm(profileDir, { recursive: true, force: true }); });

  test("refreshes when rejectedAccess matches the on-disk access token", async () => {
    const cred: Credential = {
      type: "openai_account_oauth",
      method: "chatgpt_headless",
      access: "rejected-access",
      refresh: "rejected-refresh",
      expires_at: Date.now() + 60 * 60 * 1000,
      account_id: "acct_r",
      id_token: makeIdToken({ chatgpt_account_id: "acct_r" }),
    };
    await saveCredentials(profileDir, cred);

    const calls = installFetch({
      [TOKEN_ENDPOINT]: [{ status: 200, body: tokenBody({ access_token: "new-access", id_token: makeIdToken({ chatgpt_account_id: "acct_r" }) }) }],
    });

    const out = await forceRefresh({ profileDir, ua: UA, rejectedAccess: "rejected-access" });
    expect(out.access).toBe("new-access");
    // a token request was actually made.
    expect(calls.some((c) => c.url === TOKEN_ENDPOINT)).toBe(true);
  });

  test("reuses the on-disk credential when already refreshed (access differs)", async () => {
    const cred: Credential = {
      type: "openai_account_oauth",
      method: "chatgpt_headless",
      access: "already-rotated",
      refresh: "already-refresh",
      expires_at: Date.now() + 60 * 60 * 1000,
      account_id: "acct_ar",
      id_token: makeIdToken({ chatgpt_account_id: "acct_ar" }),
    };
    await saveCredentials(profileDir, cred);

    let fetched = false;
    globalThis.fetch = (async () => { fetched = true; return new Response("{}", { status: 500 }); }) as unknown as typeof globalThis.fetch;

    // rejectedAccess is the OLD token, on-disk is already the rotated one.
    const out = await forceRefresh({ profileDir, ua: UA, rejectedAccess: "rejected-old" });
    expect(out.access).toBe("already-rotated");
    expect(fetched).toBe(false);
  });

  test("concurrent calls share a single in-flight refresh (single-flight)", async () => {
    const cred: Credential = {
      type: "openai_account_oauth",
      method: "chatgpt_headless",
      access: "rejected-access",
      refresh: "rejected-refresh",
      expires_at: Date.now() + 60 * 60 * 1000,
      account_id: "acct_sf",
      id_token: makeIdToken({ chatgpt_account_id: "acct_sf" }),
    };
    await saveCredentials(profileDir, cred);

    let released = false;
    let refreshCount = 0;
    globalThis.fetch = (async () => {
      refreshCount++;
      // Block until the test flips `released`.
      while (!released) await new Promise((r) => setTimeout(r, 10));
      return new Response(JSON.stringify(tokenBody({ access_token: "sf-access" })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;

    const p1 = forceRefresh({ profileDir, ua: UA, rejectedAccess: "rejected-access" });
    const p2 = forceRefresh({ profileDir, ua: UA, rejectedAccess: "rejected-access" });
    released = true;
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.access).toBe("sf-access");
    expect(b.access).toBe("sf-access");
    expect(refreshCount).toBe(1);
  });

  test("throws when no credential is present", async () => {
    installFetch({ [TOKEN_ENDPOINT]: [{ status: 200, body: tokenBody() }] });
    await expect(forceRefresh({ profileDir, ua: UA, rejectedAccess: "any" })).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* #8 — identity fields survive a refresh                                     */
/* -------------------------------------------------------------------------- */

describe("refresh preserves credential identity", () => {
  let profileDir: string;

  beforeEach(async () => { profileDir = await mkdtemp(join(tmpdir(), "luca-code-identity-")); });
  afterEach(async () => { restoreFetch(); await rm(profileDir, { recursive: true, force: true }); });

  /** A stored credential with a real account claim in its id_token. */
  function storedCred(over: Partial<Credential> = {}): Credential {
    return {
      type: "openai_account_oauth",
      method: "chatgpt_headless",
      access: "old-access",
      refresh: "old-refresh",
      expires_at: Date.now() + 60 * 60 * 1000,
      account_id: "acct_REAL",
      id_token: makeIdToken({ chatgpt_account_id: "acct_REAL", email: "u@x.com" }),
      ...over,
    };
  }

  /** A 200 refresh response that omits id_token (the common OAuth shape). */
  function idTokenLessBody(over: Record<string, unknown> = {}): Record<string, unknown> {
    return { access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, ...over };
  }

  test("carries id_token and account_id forward when the response omits id_token", async () => {
    const prior = storedCred();
    await saveCredentials(profileDir, prior);
    installFetch({ [TOKEN_ENDPOINT]: [{ status: 200, body: idTokenLessBody() }] });

    const cred = await refreshCredential({ profileDir, refreshToken: "old-refresh", ua: UA });

    // Token material rotates…
    expect(cred.access).toBe("new-access");
    expect(cred.refresh).toBe("new-refresh");
    // …identity does not.
    expect(cred.account_id).toBe("acct_REAL");
    expect(cred.id_token).toBe(prior.id_token);
  });

  test("the persisted credential is still readable after an id_token-less refresh", async () => {
    await saveCredentials(profileDir, storedCred());
    installFetch({ [TOKEN_ENDPOINT]: [{ status: 200, body: idTokenLessBody() }] });

    await refreshCredential({ profileDir, refreshToken: "old-refresh", ua: UA });

    // A routine refresh must not log the user out by writing an unloadable
    // credential over the good one (id_token "" fails CredentialSchema).
    const loaded = await loadCredentials(profileDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.account_id).toBe("acct_REAL");
    expect(loaded?.access).toBe("new-access");
  });

  test("never sets account_id to a bearer token — current OR previous — after a refresh", async () => {
    const prior = storedCred();
    await saveCredentials(profileDir, prior);
    installFetch({ [TOKEN_ENDPOINT]: [{ status: 200, body: idTokenLessBody() }] });

    const cred = await refreshCredential({ profileDir, refreshToken: "old-refresh", ua: UA });

    // Guards the ChatGPT-Account-Id header regression directly.
    expect(cred.account_id).not.toBe(cred.access);
    // …and the STICKY variant: carrying `previous.account_id` forward must not
    // keep re-persisting a bearer token that was seeded into account_id by the
    // initial-login `|| tokens.access_token` fallback. Comparing only against
    // the rotated `cred.access` is structurally blind to that class, because
    // the access token has already changed by then.
    expect(cred.account_id).not.toBe(prior.access);
  });

  test("a new id_token in the response wins over the carried-forward one", async () => {
    await saveCredentials(profileDir, storedCred({ account_id: "acct_OLD" }));
    const fresh = makeIdToken({ chatgpt_account_id: "acct_NEW" });
    installFetch({ [TOKEN_ENDPOINT]: [{ status: 200, body: idTokenLessBody({ id_token: fresh }) }] });

    const cred = await refreshCredential({ profileDir, refreshToken: "old-refresh", ua: UA });
    expect(cred.account_id).toBe("acct_NEW");
    expect(cred.id_token).toBe(fresh);
  });

  test("getCredentials auto-refresh keeps the account id", async () => {
    await saveCredentials(profileDir, storedCred({
      access: "stale-access",
      expires_at: Date.now() - 60_000,
      account_id: "acct_keep",
      id_token: makeIdToken({ chatgpt_account_id: "acct_keep" }),
    }));
    installFetch({ [TOKEN_ENDPOINT]: [{ status: 200, body: idTokenLessBody({ access_token: "fresh-access" }) }] });

    const cred = await getCredentials({ profileDir, ua: UA });
    expect(cred.access).toBe("fresh-access");
    expect(cred.account_id).toBe("acct_keep");
  });

  test("forceRefresh keeps the account id and id_token", async () => {
    const prior = storedCred({ access: "rejected-access", account_id: "acct_sf", id_token: makeIdToken({ chatgpt_account_id: "acct_sf" }) });
    await saveCredentials(profileDir, prior);
    installFetch({ [TOKEN_ENDPOINT]: [{ status: 200, body: idTokenLessBody({ access_token: "sf-new", refresh_token: "r3" }) }] });

    const cred = await forceRefresh({ profileDir, ua: UA, rejectedAccess: "rejected-access" });
    expect(cred.access).toBe("sf-new");
    expect(cred.account_id).toBe("acct_sf");
    expect(cred.id_token).toBe(prior.id_token);
  });

  test("rejects rather than persisting an unloadable credential when no identity is recoverable", async () => {
    // No credential on disk AND no id_token in the response — there is nothing
    // to carry forward, so the refresh must fail loudly instead of writing a
    // credential that can never be read back.
    installFetch({ [TOKEN_ENDPOINT]: [{ status: 200, body: idTokenLessBody({ access_token: "orphan-access" }) }] });

    await expect(
      refreshCredential({ profileDir, refreshToken: "orphan", ua: UA }),
    ).rejects.toThrow(/id_token/i);
    expect(await loadCredentials(profileDir)).toBeNull();
  });
});

/* sanity: constants referenced are the ones the module should use */
describe("constants wiring", () => {
  test("poll safety is the documented 3s", () => {
    expect(POLL_SAFETY_MS).toBe(3_000);
  });
  test("device callback URL is the issuer callback", () => {
    expect(DEVICE_CALLBACK_URL).toBe("https://auth.openai.com/deviceauth/callback");
  });
  test("token endpoint is the oauth token endpoint", () => {
    expect(TOKEN_ENDPOINT).toBe("https://auth.openai.com/oauth/token");
  });
  test("device user code url and device token url are distinct", () => {
    expect(DEVICE_USER_CODE_URL).not.toBe(DEVICE_TOKEN_URL);
  });
});