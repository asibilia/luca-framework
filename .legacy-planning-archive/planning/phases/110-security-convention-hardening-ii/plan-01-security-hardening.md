---
id: 110-01
title: "Security Hardening: Auth, Timing-Safe Compare, CSP, Event Validation, Error Sanitization"
phase: 110
wave: 1
depends_on: []
complexity: MODERATE
---

# Plan 110-01: Security Hardening

## Objective

Close five HIGH-severity security gaps identified in the Phase 109 re-audit. The unauthenticated GET
endpoints expose read data without key-check, string equality on API keys is vulnerable to timing
attacks, the CSP allows `unsafe-eval` and `unsafe-inline` in `script-src`, `event_type` query
parameters are accepted without an allowlist, and raw Zod validation error details leak internal
schema paths to clients.

## Context

- @packages/luca-observer/lib/auth.ts — current `requireApiKey` with `===` comparison
- @packages/luca-observer/lib/route-factory.ts — `createFileReaderRoute` generates GET handlers without auth
- @packages/luca-observer/app/api/stream/route.ts — unauthenticated GET
- @packages/luca-observer/app/api/events-query/route.ts — unauthenticated GET; exposes `error.issues`
- @packages/luca-observer/app/api/ledger/route.ts — unauthenticated GET; exposes `error.issues`
- @packages/luca-observer/app/api/notes/route.ts — GET unauthenticated; POST exposes `error.issues`
- @packages/luca-observer/app/api/events/route.ts — POST exposes `error.issues`
- @packages/luca-observer/next.config.ts — CSP with `unsafe-eval` and `unsafe-inline` in `script-src`

## Tasks

### Task 1: Replace `===` with `crypto.timingSafeEqual()` in auth middleware

**Goal:** Prevent timing-based side-channel attacks when comparing API keys.

**Files:**

- `packages/luca-observer/lib/auth.ts` — replace string equality with constant-time comparison

**Steps:**

1. Import `timingSafeEqual` from `"node:crypto"`.
2. In `requireApiKey`, after confirming both `providedKey` and `expectedKey` are non-empty, encode
   both as `Buffer.from(..., "utf8")` (or `Uint8Array`).
3. Guard with a length check first (`providedKey.length !== expectedKey.length`) that returns 401
   before calling `timingSafeEqual`; `timingSafeEqual` throws if lengths differ.
4. Replace `providedKey !== expectedKey` with `!timingSafeEqual(buf1, buf2)`.
5. Update the JSDoc `@example` to reflect the implementation note.

**Verification:**

- [ ] `auth.ts` imports `timingSafeEqual` from `"node:crypto"` (not `"crypto"`)
- [ ] `===` comparison on key strings is gone
- [ ] Length check precedes `timingSafeEqual` call to avoid throws
- [ ] `bunx --bun tsc --noEmit` passes in `packages/luca-observer`

### Task 2: Extend `requireApiKey` to unauthenticated GET endpoints

**Goal:** All observer API routes that read potentially sensitive data require the API key when
`LUCA_OBSERVER_API_KEY` is set.

**Files:**

- `packages/luca-observer/app/api/stream/route.ts` — add `requireApiKey` call
- `packages/luca-observer/lib/route-factory.ts` — add optional `requireAuth` flag so all factory-generated GET routes can enforce auth

**Steps:**

_stream/route.ts:_

1. Import `requireApiKey` from `"~/lib/auth"`.
2. At the top of `GET()`, call `requireApiKey(request)` and return the error response early if non-null.
3. Update the function signature from `GET()` to `GET(request: Request)`.

_route-factory.ts:_

1. Add an optional `requireAuth?: boolean` field to the factory's options or as a fourth parameter.
2. When `requireAuth` is `true`, the generated handler calls `requireApiKey(request)` and returns
   the auth error early.
3. Identify all call sites that create GET routes for data-reading endpoints and enable `requireAuth`:
   check which routes in `app/api/` use `createFileReaderRoute` (search `grep -r createFileReaderRoute`).
4. Update those call sites to pass `requireAuth: true` (or refactor the factory signature to make
   auth opt-out rather than opt-in if most routes should be protected).

**Verification:**

- [ ] `GET /api/stream` returns 401 when API key is set and request omits `X-API-Key`
- [ ] Factory-generated GET routes return 401 when API key is set and header is absent
- [ ] Routes still return data when no `LUCA_OBSERVER_API_KEY` is configured (open mode unchanged)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Tighten CSP — remove `unsafe-eval` and `unsafe-inline` from `script-src`

**Goal:** Prevent execution of injected inline scripts and eval-based code within the observer UI.

**Files:**

- `packages/luca-observer/next.config.ts` — update `script-src` directive

**Steps:**

1. Remove `'unsafe-inline'` from the `script-src` value.
2. Remove `'unsafe-eval'` from the `script-src` value.
3. Next.js 13+ App Router does not require either for basic server components. If client components
   use `dangerouslySetInnerHTML` or dynamic `eval`, those must be refactored instead.
4. Verify the observer UI still renders correctly with the tightened policy (check browser console
   for CSP violations after running `bun run dev` in `packages/luca-observer`).
5. Add a comment explaining why both directives are intentionally absent.

**Verification:**

- [ ] `script-src` in `next.config.ts` contains only `'self'`
- [ ] No `unsafe-eval` or `unsafe-inline` anywhere in the CSP `script-src` value
- [ ] `style-src 'unsafe-inline'` may remain (needed by Next.js CSS-in-JS at build time)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 4: Validate `event_type` query parameter against an allowlist

**Goal:** Prevent unbounded string injection into in-memory store filter functions by validating
`event_type` against a set of known values in query routes.

**Files:**

- `packages/luca-observer/app/api/events-query/route.ts` — refine `EventQueryParamsSchema`
- `packages/luca-observer/app/api/ledger/route.ts` — refine `LedgerQueryParamsSchema`

**Context on event types:** The observer is intentionally open to arbitrary event types from hook
scripts (hook scripts define their own types like `session.start`, `tool.use`, `commit.pre`, etc.).
A strict enum would break extensibility. Instead, apply a permissive but bounded allowlist via a
regex pattern that enforces `<namespace>.<action>` format (dot-separated lowercase alphanumeric
words) with a max length. This prevents SQL/NoSQL injection and path traversal while allowing
arbitrary user-defined event types.

**Steps:**

1. In `events-query/route.ts`, change `event_type: z.string().optional()` to
   `event_type: z.string().regex(/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/).max(100).optional()`.
2. Apply the same pattern in `ledger/route.ts`.
3. Update the JSDoc `@example` in both files to show a valid `event_type` value.
4. Do NOT apply an allowlist to the POST `/api/events` ingestion endpoint — the store accepts
   arbitrary event types; validation applies only to the query/filter parameters.

**Verification:**

- [ ] `event_type: "session.start"` is accepted (regex matches)
- [ ] `event_type: "../../etc/passwd"` is rejected (400)
- [ ] `event_type: "<script>alert(1)</script>"` is rejected (400)
- [ ] `event_type` missing is still accepted (`.optional()`)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 5: Sanitize Zod validation errors before returning to client

**Goal:** Strip internal Zod metadata (`path`, `code`, `unionErrors`, etc.) from 400 responses.
Clients only need a human-readable message and field path, not full schema internals.

**Files:**

- `packages/luca-observer/app/api/events-query/route.ts` — sanitize 400 error details
- `packages/luca-observer/app/api/ledger/route.ts` — sanitize 400 error details
- `packages/luca-observer/app/api/notes/route.ts` — sanitize 400 error details
- `packages/luca-observer/app/api/events/route.ts` — sanitize 400 error details

**Steps:**

1. Create a helper function `sanitizeZodIssues` at the top of one of the files (or in a shared
   location if desired) that maps `ZodIssue[]` → `{ field: string; message: string }[]`:
   ```typescript
   function sanitizeZodIssues(issues: z.ZodIssue[]) {
     return issues.map((issue) => ({
       field: issue.path.join(".") || "root",
       message: issue.message,
     }));
   }
   ```
2. Replace all four occurrences of `details: parseResult.error.issues` with
   `details: sanitizeZodIssues(parseResult.error.issues)`.
3. Import `type { ZodIssue }` from `"zod"` if needed for type annotation, or rely on inference.
4. Keep the `details` key in the response (clients use it to display field-level errors); only
   strip internal Zod properties (`code`, `unionErrors`, `validation`, `inclusive`, etc.).

**Verification:**

- [ ] 400 responses no longer include `code`, `unionErrors`, or `inclusive` Zod internals
- [ ] 400 responses still include `field` and `message` for each validation failure
- [ ] `bunx --bun tsc --noEmit` passes in `packages/luca-observer`

## Success Criteria

- [ ] `auth.ts` uses `crypto.timingSafeEqual()` — no `===` comparison on key strings
- [ ] All GET routes return 401 when `LUCA_OBSERVER_API_KEY` is set and key header is absent
- [ ] `next.config.ts` `script-src` contains neither `unsafe-eval` nor `unsafe-inline`
- [ ] `event_type` query param validated via regex pattern in both query routes
- [ ] All four 400 error responses expose only `{ field, message }` — no raw Zod internals
- [ ] `bun test` passes in `packages/luca-observer`
- [ ] `bunx --bun tsc --noEmit` passes in `packages/luca-observer`
