/**
 * auth/jwt.ts — JWT claim extraction for the luca-code.
 *
 * OpenAI is the authority for the id_token; we only READ claims (no
 * signature verification). The id_token is a JWS whose middle segment is a
 * base64url-encoded JSON object. We split on ".", decode parts[1], and parse.
 *
 * `extractAccountID` resolves the account id across the four claim shapes
 * OpenAI has shipped, in priority order:
 *   1. top-level `chatgpt_account_id`
 *   2. top-level `account_id`
 *   3. nested `payload["https://api.openai.com/auth"].chatgpt_account_id`
 *   4. `organizations[0].id`
 * The first non-empty string wins; empty strings are skipped.
 */

import { z } from "zod";

const NESTED_AUTH_KEY = "https://api.openai.com/auth";

/** Shape of the OpenAI id_token payload we care about. Passthrough keeps
 *  unknown claims for callers that want them. */
const JwtPayloadSchema = z
  .object({
    chatgpt_account_id: z.string().optional(),
    account_id: z.string().optional(),
    email: z.string().optional(),
    chatgpt_plan_type: z.string().optional(),
    [NESTED_AUTH_KEY]: z
      .object({
        chatgpt_account_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    organizations: z
      .array(z.object({ id: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

type JwtPayload = z.infer<typeof JwtPayloadSchema>;

/** base64url → UTF-8 string (handles missing padding). */
function base64urlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const padded = pad === 0 ? base64 : base64 + "=".repeat(pad);
  return Buffer.from(padded, "base64").toString("utf-8");
}

/**
 * Decode the payload segment of a JWT WITHOUT verifying its signature.
 * Throws if the token is malformed or the payload is not valid JSON / a
 * JSON object.
 */
export function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error(`malformed JWT: expected 3 segments, got ${parts.length}`);
  }
  const payloadSegment = parts[1];
  if (payloadSegment === undefined) {
    throw new Error("malformed JWT: missing payload segment");
  }
  const json = base64urlDecode(payloadSegment);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `malformed JWT payload: JSON parse failed — ${(err as Error).message}`,
    );
  }
  const result = JwtPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `malformed JWT payload: schema validation failed — ${result.error.message}`,
    );
  }
  return result.data;
}

/** First non-empty string from a list of candidates, or "" if none qualify. */
function firstNonEmpty(values: Array<string | undefined>): string {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

/**
 * Best-effort payload decode for the `extract*` helpers.
 *
 * Returns `null` for anything {@link decodeJwtPayload} rejects — an opaque
 * (non-JWT) token, an undecodable payload segment, non-JSON, or JSON that is
 * not an object. The extractors are display/identity helpers called from
 * unguarded paths (`printAccount` in the CLI, `credentialFromTokens` in the
 * refresh flow); an unparseable id_token must degrade to "" rather than
 * rejecting out of the command. `decodeJwtPayload` itself keeps throwing — it
 * is the low-level primitive and callers that need the distinction use it.
 */
function tryDecodeJwtPayload(idToken: string): JwtPayload | null {
  try {
    return decodeJwtPayload(idToken);
  } catch {
    return null;
  }
}

/**
 * Extract the OpenAI account id from an id_token across all known claim
 * shapes, in priority order. Returns "" if no claim is present or the token
 * cannot be decoded.
 */
export function extractAccountID(idToken: string): string {
  const payload = tryDecodeJwtPayload(idToken);
  if (!payload) return "";
  return firstNonEmpty([
    payload.chatgpt_account_id,
    payload.account_id,
    payload[NESTED_AUTH_KEY]?.chatgpt_account_id,
    payload.organizations?.[0]?.id,
  ]);
}

/**
 * Extract `chatgpt_plan_type` for status display. Returns "" if absent or the
 * token cannot be decoded.
 */
export function extractPlanType(idToken: string): string {
  return firstNonEmpty([tryDecodeJwtPayload(idToken)?.chatgpt_plan_type]);
}

/**
 * Extract `email` for status display. Returns "" if absent or the token cannot
 * be decoded.
 */
export function extractEmail(idToken: string): string {
  return firstNonEmpty([tryDecodeJwtPayload(idToken)?.email]);
}