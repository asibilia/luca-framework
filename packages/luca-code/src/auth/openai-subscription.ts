/**
 * auth/openai-subscription.ts — OpenAI ChatGPT subscription device flow.
 *
 * Ports macaz `internal/provider/openai/auth.go`. The flow is the OAuth 2.0
 * device authorization grant tuned for the codex backend:
 *
 *   1. start       POSTs {client_id} to the user-code endpoint, receiving the
 *                  device_auth_id, the user_code, and a polling interval.
 *   2. ready       The caller's callback is invoked with the device URL and
 *                  user code so it can print "open <deviceURL>, enter <code>".
 *   3. poll        Every interval+pollSafety the device-token endpoint is
 *                  polled with {device_auth_id, user_code}. 403/404 mean
 *                  "still pending" (keep polling); any other non-2xx is an
 *                  error; 200 yields {authorization_code, code_verifier}.
 *   4. exchange    POSTs the token endpoint with an authorization_code form
 *                  body (code, redirect_uri, client_id, code_verifier) and
 *                  builds a Credential from the returned tokens.
 *
 * The lifecycle helpers wrap persistence:
 *   - getCredentials   load -> if still valid return -> else refresh.
 *   - refreshCredential  POST a refresh_token grant and persist.
 *   - forceRefresh    single-flight refresh keyed by profile dir; if a
 *                     concurrent call already rotated the on-disk access
 *                     token (so cred.access !== rejectedAccess), reuse it.
 *
 * Every outbound request carries the caller's User-Agent — never a generic
 * fetch UA. All persistence goes through auth/credentials.ts.
 *
 * Functional style throughout (closures/factories, no classes), schema-first
 * (Zod owns the wire-shape defaults and validators), and Bun-native (no
 * node:http / express / dotenv).
 */

import { z } from "zod";

import {
  CLIENT_ID,
  DEVICE_CALLBACK_URL,
  DEVICE_TOKEN_URL,
  DEVICE_URL,
  DEVICE_USER_CODE_URL,
  POLL_SAFETY_MS,
  TOKEN_ENDPOINT,
} from "../constants";
import {
  loadCredentials,
  saveCredentials,
  needsRefresh,
} from "./credentials";
import type { Credential } from "./credentials";
import { extractAccountID } from "./jwt";

/* -------------------------------------------------------------------------- */
/* schemas — single source of truth for wire shapes and defaults             */
/* -------------------------------------------------------------------------- */

/**
 * Response of the user-code issuance endpoint. `interval` is expressed in
 * seconds (matching the Go source); the poll loop converts to ms before
 * sleeping. Defaults to 10s when the server omits it.
 */
const UserCodeResponseSchema = z
  .object({
    device_auth_id: z.string().min(1),
    user_code: z.string().min(1),
    // OpenAI returns `interval` as a JSON string (e.g. "10"); coerce to a number
    // so a string payload still validates. Defaults to 10s when omitted.
    interval: z.coerce.number().int().positive().default(10),
  })
  .passthrough();

/** Result of a successful device-token poll. */
const DeviceTokenResponseSchema = z
  .object({
    authorization_code: z.string().min(1),
    code_verifier: z.string().min(1),
  })
  .passthrough();

/**
 * Token endpoint response (used by both exchange and refresh). `expires_in` is
 * in seconds and defaults to 3600 when the server omits it; `id_token` is
 * optional because some response shapes omit it.
 */
const TokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    // `expires_in` is also returned as a JSON string; coerce to a number.
    expires_in: z.coerce.number().int().positive().default(3600),
    id_token: z.string().optional(),
  })
  .passthrough();

type UserCodeResponse = z.infer<typeof UserCodeResponseSchema>;
type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>;
type TokenResponse = z.infer<typeof TokenResponseSchema>;

/* -------------------------------------------------------------------------- */
/* public option types                                                        */
/* -------------------------------------------------------------------------- */

/** Information passed to the `ready` callback during `authorizeSubscription`. */
export interface ReadyInfo {
  /** URL the user must open in a browser to authorise the device. */
  deviceURL: string;
  /** Short code the user enters on that page. */
  userCode: string;
}

/** Callback invoked once the user code is issued, so the caller can prompt. */
export type ReadyFn = (info: ReadyInfo) => void;

/** Options for {@link authorizeSubscription}. */
export interface AuthorizeOptions {
  /** Invoked with the device URL + user code so the caller can display them. */
  ready: ReadyFn;
  /** User-Agent header sent on every request (NOT a generic fetch UA). */
  ua: string;
}

/** Options for {@link getCredentials}. */
export interface GetCredentialsOptions {
  profileDir: string;
  ua: string;
}

/** Options for {@link refreshCredential}. */
export interface RefreshOptions {
  profileDir: string;
  refreshToken: string;
  ua: string;
  /**
   * The credential being replaced. Its identity claims (`id_token`,
   * `account_id`) are carried forward when the refresh response omits
   * `id_token`. Optional — when absent, the on-disk credential is loaded as a
   * fallback so a bare `refreshCredential` call still preserves identity.
   */
  previous?: Credential;
}

/** Options for {@link forceRefresh}. */
export interface ForceRefreshOptions {
  profileDir: string;
  ua: string;
  /** The access token the caller just saw rejected; used to detect reuse. */
  rejectedAccess: string;
}

/* -------------------------------------------------------------------------- */
/* internal helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Resolve after `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** JSON header block carrying the caller's User-Agent. */
function jsonHeaders(ua: string): Record<string, string> {
  return { "Content-Type": "application/json", "User-Agent": ua };
}

/** Form-header block carrying the caller's User-Agent. */
function formHeaders(ua: string): Record<string, string> {
  return { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": ua };
}

/**
 * Build a {@link Credential} from a token-endpoint response.
 *
 * `expires_in` defaults to 3600s via the schema. A refresh_token grant
 * routinely omits `id_token` (which is why `TokenResponseSchema` marks it
 * optional), so identity resolution walks a fallback chain:
 *
 *   id_token   = response id_token || previous.id_token || ""
 *   account_id = claim from that id_token || previous.account_id
 *                || the access token (initial-login last resort)
 *
 * `previous` is the credential being replaced. Passing it means a refresh
 * rotates only the token material: without it, an id_token-less response
 * would blank `id_token` (failing `CredentialSchema` on the next read, i.e. a
 * forced logout) and set `account_id` to the raw bearer token (leaking it into
 * the `ChatGPT-Account-Id` header and permanently missing the model cache).
 *
 * The access-token fallback is retained for the INITIAL-login path, where
 * there is no previous credential and `CredentialSchema` still requires a
 * non-empty `account_id`.
 */
function credentialFromTokens(tokens: TokenResponse, previous?: Credential): Credential {
  const idToken = tokens.id_token || previous?.id_token || "";
  const accountId = idToken ? extractAccountID(idToken) : "";
  return {
    type: "openai_account_oauth",
    method: "chatgpt_headless",
    access: tokens.access_token,
    refresh: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
    account_id: accountId || previous?.account_id || tokens.access_token,
    id_token: idToken,
  };
}

/**
 * Issue a non-2xx error for a fetch response.
 *
 * The body is consumed best-effort for inclusion in the message; any read
 * failure degrades to a status-only message. Never throws from the body read.
 */
async function non2xxError(label: string, res: Response): Promise<Error> {
  let snippet = "";
  try {
    const text = await res.text();
    snippet = text ? ` — ${text.slice(0, 200)}` : "";
  } catch {
    /* ignore body read failure */
  }
  return new Error(`${label} failed: HTTP ${res.status}${snippet}`);
}

/* -------------------------------------------------------------------------- */
/* device flow                                                                */
/* -------------------------------------------------------------------------- */

/**
 * POST to the user-code endpoint to start a device flow.
 * Returns the parsed {@link UserCodeResponse}.
 */
async function startDeviceFlow(ua: string): Promise<UserCodeResponse> {
  const res = await fetch(DEVICE_USER_CODE_URL, {
    method: "POST",
    headers: jsonHeaders(ua),
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!res.ok) throw await non2xxError("device usercode", res);
  const data: unknown = await res.json();
  const parsed = UserCodeResponseSchema.safeParse(data);
  if (!parsed.success) throw new Error(`device usercode: invalid response — ${parsed.error.message}`);
  return parsed.data;
}

/**
 * Poll the device-token endpoint until the user authorises the device.
 *
 * 403/404 mean "still pending" -> keep polling. Any other non-2xx is a hard
 * error. 200 yields the parsed {@link DeviceTokenResponse}. The first poll is
 * immediate; subsequent polls wait `interval*1000 + POLL_SAFETY_MS`.
 */
async function pollForDeviceToken(
  start: UserCodeResponse,
  ua: string,
): Promise<DeviceTokenResponse> {
  const delayMs = start.interval * 1000 + POLL_SAFETY_MS;
  let first = true;
  for (;;) {
    if (!first) await sleep(delayMs);
    first = false;

    const res = await fetch(DEVICE_TOKEN_URL, {
      method: "POST",
      headers: jsonHeaders(ua),
      body: JSON.stringify({ device_auth_id: start.device_auth_id, user_code: start.user_code }),
    });
    if (res.status === 403 || res.status === 404) continue;
    if (!res.ok) throw await non2xxError("device token poll", res);

    const data: unknown = await res.json();
    const parsed = DeviceTokenResponseSchema.safeParse(data);
    if (!parsed.success) throw new Error(`device token poll: invalid response — ${parsed.error.message}`);
    return parsed.data;
  }
}

/**
 * Exchange the device-token response for OAuth tokens at the token endpoint.
 * Returns a {@link Credential} built from the response (not yet persisted —
 * `authorizeSubscription` has no profile dir).
 */
async function exchangeCode(tokens: DeviceTokenResponse, ua: string): Promise<Credential> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: tokens.authorization_code,
    redirect_uri: DEVICE_CALLBACK_URL,
    client_id: CLIENT_ID,
    code_verifier: tokens.code_verifier,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: formHeaders(ua),
    body,
  });
  if (!res.ok) throw await non2xxError("token exchange", res);
  const data: unknown = await res.json();
  const parsed = TokenResponseSchema.safeParse(data);
  if (!parsed.success) throw new Error(`token exchange: invalid response — ${parsed.error.message}`);
  return credentialFromTokens(parsed.data);
}

/* -------------------------------------------------------------------------- */
/* public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Run the full device-authorization flow and return the resulting credential.
 *
 * The caller supplies a `ready` callback that receives the device URL and user
 * code so it can print the "open <deviceURL>, enter <user_code>" prompt. The
 * returned credential is NOT persisted here — the caller saves it via
 * `saveCredentials` once it has a profile dir.
 */
export async function authorizeSubscription(opts: AuthorizeOptions): Promise<Credential> {
  const start = await startDeviceFlow(opts.ua);
  opts.ready({ deviceURL: DEVICE_URL, userCode: start.user_code });
  const deviceTokens = await pollForDeviceToken(start, opts.ua);
  return exchangeCode(deviceTokens, opts.ua);
}

/**
 * Load the persisted credential. If it is still valid, return it; otherwise
 * rotate via a refresh_token grant and persist the new credential.
 *
 * Throws when no credential is on disk — the caller must run
 * `authorizeSubscription` first to establish one.
 */
export async function getCredentials(opts: GetCredentialsOptions): Promise<Credential> {
  const cred = await loadCredentials(opts.profileDir);
  if (!cred) throw new Error("not authorized: no credential on disk — run authorize first");
  if (!needsRefresh(cred)) return cred;
  return refreshCredential({
    profileDir: opts.profileDir,
    refreshToken: cred.refresh,
    ua: opts.ua,
    previous: cred,
  });
}

/**
 * Refresh via a refresh_token grant and persist the resulting credential.
 *
 * Identity (`id_token` / `account_id`) is carried forward from
 * `opts.previous`, falling back to the on-disk credential when the caller did
 * not supply one. If neither the response nor any fallback yields an
 * `id_token` the refresh throws instead of persisting a credential that
 * `loadCredentials` could never read back (which would log the user out AND
 * destroy the refresh token needed to recover).
 */
export async function refreshCredential(opts: RefreshOptions): Promise<Credential> {
  const previous = opts.previous ?? (await loadCredentials(opts.profileDir)) ?? undefined;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: CLIENT_ID,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: formHeaders(opts.ua),
    body,
  });
  if (!res.ok) throw await non2xxError("token refresh", res);
  const data: unknown = await res.json();
  const parsed = TokenResponseSchema.safeParse(data);
  if (!parsed.success) throw new Error(`token refresh: invalid response — ${parsed.error.message}`);
  const cred = credentialFromTokens(parsed.data, previous);
  if (!cred.id_token) {
    throw new Error(
      "token refresh: response omitted id_token and no previous credential is available — re-run login",
    );
  }
  await saveCredentials(opts.profileDir, cred);
  return cred;
}

/**
 * In-flight refresh promises keyed by profile dir, implementing single-flight
 * for {@link forceRefresh}. A Map (not a single promise) so concurrent
 * refreshes against different profile dirs do not block each other.
 */
const inflightRefresh = new Map<string, Promise<Credential>>();

/**
 * Refresh the on-disk credential, but never more than once concurrently per
 * profile dir.
 *
 * If the on-disk access token already differs from `rejectedAccess`, a
 * concurrent call already rotated it — return that credential without making
 * another token request. Otherwise POST a refresh_token grant and persist.
 *
 * Throws when no credential is on disk.
 */
export async function forceRefresh(opts: ForceRefreshOptions): Promise<Credential> {
  const existing = inflightRefresh.get(opts.profileDir);
  if (existing) return existing;

  const promise = (async (): Promise<Credential> => {
    const current = await loadCredentials(opts.profileDir);
    if (!current) throw new Error("force refresh: no credential on disk — run authorize first");
    // A concurrent call already rotated and persisted a new access token.
    if (current.access !== opts.rejectedAccess) return current;
    return refreshCredential({
      profileDir: opts.profileDir,
      refreshToken: current.refresh,
      ua: opts.ua,
      previous: current,
    });
  })();

  inflightRefresh.set(opts.profileDir, promise);
  try {
    return await promise;
  } finally {
    inflightRefresh.delete(opts.profileDir);
  }
}