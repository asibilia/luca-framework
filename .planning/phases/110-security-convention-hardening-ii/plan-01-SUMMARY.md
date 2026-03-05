---
id: 110-01-summary
plan: 110-01
status: completed
---

# Plan 110-01 Execution Summary: Security Hardening

**Phase:** 110 | **Wave:** 1 | **Issue:** #44

## Outcome: PASS

All 5 tasks completed. 29/29 tests pass. No new TypeScript errors introduced (pre-existing errors in UI pages are unrelated to this plan's scope).

---

## Task Results

### Task 1: Replace `===` with `crypto.timingSafeEqual()` in auth middleware

**Status:** DONE
**File:** `packages/luca-observer/lib/auth.ts`
**Commit:** `fix(110-01): #44 replace === with crypto.timingSafeEqual() in auth middleware`

- Imported `timingSafeEqual` from `"node:crypto"` (not `"crypto"`)
- Added a length check before calling `timingSafeEqual` to avoid throws on mismatched lengths
- Replaced `providedKey !== expectedKey` string equality with `!timingSafeEqual(buf1, buf2)`
- Updated JSDoc to document the timing-safe approach
- Open mode (no env var) remains unaffected

### Task 2: Extend `requireApiKey` to unauthenticated GET endpoints

**Status:** DONE
**Files changed:**

- `packages/luca-observer/app/api/stream/route.ts` — added `requireApiKey` call, updated `GET()` signature to `GET(request: Request)`
- `packages/luca-observer/lib/route-factory.ts` — added optional `requireAuth?: boolean` field to `FileReaderRouteOptions`; factory calls `requireApiKey` when enabled
- 7 factory-generated GET routes updated to pass `{ requireAuth: true }`:
  - `app/api/iterations/route.ts`
  - `app/api/planning/route.ts`
  - `app/api/tribunal/route.ts`
  - `app/api/state/route.ts`
  - `app/api/metrics/route.ts`
  - `app/api/harness/route.ts`
  - `app/api/memory/route.ts`
- 3 manually-handled GET routes also protected:
  - `app/api/events-query/route.ts`
  - `app/api/ledger/route.ts`
  - `app/api/notes/route.ts`

**Commit:** `fix(110-01): #44 add requireApiKey to all unauthenticated GET endpoints`

### Task 3: Tighten CSP — remove `unsafe-eval` and `unsafe-inline` from `script-src`

**Status:** DONE
**File:** `packages/luca-observer/next.config.ts`
**Commit:** `fix(110-01): #44 tighten CSP: remove unsafe-eval and unsafe-inline from script-src`

- Changed `"script-src 'self' 'unsafe-inline' 'unsafe-eval'"` to `"script-src 'self'"`
- Added explanatory comment documenting why both directives are intentionally absent
- `style-src 'unsafe-inline'` retained (required by Next.js CSS-in-JS)

### Task 4: Validate `event_type` query parameter against regex pattern

**Status:** DONE
**Files:** `app/api/events-query/route.ts`, `app/api/ledger/route.ts`
**Commit:** `fix(110-01): #44 validate event_type with regex pattern in query routes`

- Applied `z.string().regex(/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/).max(100).optional()` to `event_type` in both schemas
- Pattern accepts `"session.start"`, `"tool.use"`, `"commit.pre"` etc.
- Pattern rejects `"../../etc/passwd"`, `"<script>alert(1)</script>"`, etc.
- POST `/api/events` ingestion endpoint intentionally left unrestricted (store accepts arbitrary types)
- Updated JSDoc examples in both files

### Task 5: Sanitize Zod validation errors before returning to client

**Status:** DONE
**Files:**

- `packages/luca-observer/lib/sanitize-zod.ts` — new shared helper
- `app/api/events-query/route.ts`
- `app/api/ledger/route.ts`
- `app/api/notes/route.ts`
- `app/api/events/route.ts`

**Commit:** `fix(110-01): #44 sanitize Zod error details before returning to client`

- Created `sanitizeZodIssues(issues: ZodIssue[]): { field: string; message: string }[]` in `lib/sanitize-zod.ts`
- Replaced all 4 occurrences of `details: parseResult.error.issues` with `details: sanitizeZodIssues(parseResult.error.issues)`
- 400 responses now expose only `{ field, message }` — no `code`, `unionErrors`, `inclusive`, or other Zod internals

---

## Verification

| Check                                     | Result                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `bun test packages/luca-observer`         | 29 pass, 0 fail                                                             |
| `bunx --bun tsc --noEmit` (luca-observer) | Pre-existing errors only (unrelated UI page type mismatches from Phase 109) |
| `auth.ts` uses `crypto.timingSafeEqual()` | Yes                                                                         |
| All GET routes protected                  | Yes — 10 routes total (stream + 7 factory + events-query + ledger + notes)  |
| `script-src` contains only `'self'`       | Yes                                                                         |
| `event_type` regex in both query routes   | Yes                                                                         |
| Zod internals stripped from 400 responses | Yes — 4 endpoints updated                                                   |

---

## Deviations

None. All tasks executed as specified. No auto-fixes or critical gap additions were needed.
