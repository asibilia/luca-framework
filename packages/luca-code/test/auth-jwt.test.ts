import { test, expect } from "bun:test";
import {
  decodeJwtPayload,
  extractAccountID,
  extractPlanType,
  extractEmail,
} from "../src/auth/jwt";

/** Build a synthetic JWT (header.payload.signature) by base64url-encoding JSON. */
function b64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeJwt(payload: unknown): string {
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url(payload)}.sig`;
}

test("decodeJwtPayload decodes the middle segment as JSON", () => {
  const token = makeJwt({ sub: "user-123", chatgpt_account_id: "acct_1" });
  const payload = decodeJwtPayload(token);
  expect(payload).toEqual(
    expect.objectContaining({ sub: "user-123", chatgpt_account_id: "acct_1" }),
  );
});

test("decodeJwtPayload throws on a token with too few segments", () => {
  expect(() => decodeJwtPayload("not-a-jwt")).toThrow();
});

test("extractAccountID prefers top-level chatgpt_account_id", () => {
  const token = makeJwt({
    chatgpt_account_id: "acct-chatgpt",
    account_id: "acct-plain",
  });
  expect(extractAccountID(token)).toBe("acct-chatgpt");
});

test("extractAccountID falls back to top-level account_id", () => {
  const token = makeJwt({ account_id: "acct-plain" });
  expect(extractAccountID(token)).toBe("acct-plain");
});

test("extractAccountID falls back to nested https://api.openai.com/auth.chatgpt_account_id", () => {
  const token = makeJwt({
    "https://api.openai.com/auth": { chatgpt_account_id: "acct-nested" },
  });
  expect(extractAccountID(token)).toBe("acct-nested");
});

test("extractAccountID falls back to organizations[0].id", () => {
  const token = makeJwt({
    organizations: [{ id: "org_1", name: "Personal" }, { id: "org_2" }],
  });
  expect(extractAccountID(token)).toBe("org_1");
});

test("extractAccountID respects priority order across all four shapes", () => {
  // All present → chatgpt_account_id wins.
  expect(
    extractAccountID(
      makeJwt({
        chatgpt_account_id: "a",
        account_id: "b",
        "https://api.openai.com/auth": { chatgpt_account_id: "c" },
        organizations: [{ id: "d" }],
      }),
    ),
  ).toBe("a");

  // Drop chatgpt_account_id → account_id wins.
  expect(
    extractAccountID(
      makeJwt({
        account_id: "b",
        "https://api.openai.com/auth": { chatgpt_account_id: "c" },
        organizations: [{ id: "d" }],
      }),
    ),
  ).toBe("b");

  // Drop account_id → nested wins.
  expect(
    extractAccountID(
      makeJwt({
        "https://api.openai.com/auth": { chatgpt_account_id: "c" },
        organizations: [{ id: "d" }],
      }),
    ),
  ).toBe("c");

  // Drop nested → organizations[0].id wins.
  expect(extractAccountID(makeJwt({ organizations: [{ id: "d" }] }))).toBe("d");
});

test("extractAccountID skips empty strings and continues down the priority chain", () => {
  const token = makeJwt({
    chatgpt_account_id: "",
    account_id: "",
    "https://api.openai.com/auth": { chatgpt_account_id: "acct-nested" },
  });
  expect(extractAccountID(token)).toBe("acct-nested");
});

test("extractAccountID returns empty string when no claim is present", () => {
  expect(extractAccountID(makeJwt({ sub: "u" }))).toBe("");
});

test("extractAccountID returns empty string when organizations array is empty", () => {
  expect(extractAccountID(makeJwt({ organizations: [] }))).toBe("");
});

test("extractAccountID on a real-shaped id_token with mixed claims", () => {
  const token = makeJwt({
    iss: "https://auth.openai.com/",
    sub: "auth0|abc",
    aud: ["https://api.openai.com/v1"],
    email: "dev@example.com",
    chatgpt_plan_type: "plus",
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_real_123",
      organization_id: "org_real",
    },
    organizations: [{ id: "org_real", name: "Personal", plan_type: "plus" }],
  });
  expect(extractAccountID(token)).toBe("acct_real_123");
});

test("extractPlanType reads chatgpt_plan_type", () => {
  const token = makeJwt({ chatgpt_plan_type: "team" });
  expect(extractPlanType(token)).toBe("team");
});

test("extractPlanType returns empty string when absent", () => {
  expect(extractPlanType(makeJwt({ sub: "u" }))).toBe("");
});

test("extractEmail reads email claim", () => {
  const token = makeJwt({ email: "user@example.com" });
  expect(extractEmail(token)).toBe("user@example.com");
});

test("extractEmail returns empty string when absent", () => {
  expect(extractEmail(makeJwt({ sub: "u" }))).toBe("");
});

/* -------------------------------------------------------------------------- */
/* #7 — display helpers must never throw on an undecodable id_token           */
/* -------------------------------------------------------------------------- */

test("extract* return empty string for an opaque (non-JWT) token", () => {
  // `luca-code status` calls printAccount outside any try; an opaque
  // id_token must degrade to "<unknown>", never reject out of main().
  expect(extractAccountID("opaque-not-a-jwt")).toBe("");
  expect(extractPlanType("opaque-not-a-jwt")).toBe("");
  expect(extractEmail("opaque-not-a-jwt")).toBe("");
});

test("extract* return empty string when the payload segment is not JSON", () => {
  const token = "a.!!!not-base64-json!!!.c";
  expect(extractAccountID(token)).toBe("");
  expect(extractPlanType(token)).toBe("");
  expect(extractEmail(token)).toBe("");
});

test("extract* return empty string when the payload is JSON but not an object", () => {
  const token = `header.${Buffer.from("42", "utf-8").toString("base64url")}.sig`;
  expect(extractAccountID(token)).toBe("");
  expect(extractPlanType(token)).toBe("");
  expect(extractEmail(token)).toBe("");
});

test("decodeJwtPayload handles base64url padding-less payloads", () => {
  // Payload whose base64url encoding has no padding — ensure no trailing '='.
  const token = makeJwt({ chatgpt_account_id: "acct_nopad" });
  // Confirm the payload segment really is padding-less (ends without '=').
  const parts = token.split(".");
  expect(parts[1]).not.toMatch(/=+$/);
  const payload = decodeJwtPayload(token);
  expect((payload as { chatgpt_account_id: string }).chatgpt_account_id).toBe(
    "acct_nopad",
  );
});