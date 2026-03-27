---
phase: 212
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 212 Plan 1: Integration & Security Hardening

## Objective

Close the DiffPreview integration gap and harden API routes against security findings from the v8.3.0 audit. Five targeted fixes to existing files -- no new infrastructure or architectural changes.

> Appetite: Medium (100K tokens remaining of 100K ceiling)

## Context

@packages/luca-studio/hooks/use-entity-save.ts
@packages/luca-studio/lib/entity-route-helpers.ts
@packages/luca-studio/lib/ts-round-trip.ts (EntityMetadata interface)
@packages/luca-studio/app/api/events/route.ts
@packages/luca-studio/app/api/git/publish/route.ts
@packages/luca-studio/app/api/compile/route.ts
@packages/luca-studio/stores/config-atoms.ts
@packages/luca-studio/components/shared/diff-preview.tsx
@packages/luca-studio/app/agents/page.tsx (representative entity page)

## Tasks

### 1. Wire DiffPreview into Entity Save Flow

**Type:** auto
**TDD:** false
**Depends on:** none

Parse the 409 response body in `use-entity-save.ts` to extract `current_content` and surface the DiffPreview dialog via a conflict state atom instead of throwing a plain error string.

**Implementation details:**

1. Create a `conflictAtom` in `stores/config-atoms.ts`:
   - Type: `{ entityKey: string; localContent: string; serverContent: string; serverEtag: string } | null`
   - Default: `null`
   - Include a `clearConflictAtom` write-only atom for convenience

2. Modify `use-entity-save.ts` save callback:
   - On 409, parse the response JSON to extract `current_content` and `current_etag`
   - Instead of `throw new Error(...)`, call `setConflict({ entityKey, localContent: rawConfigText, serverContent: current_content, serverEtag: current_etag })`
   - Add `conflictAtom` setter to hook dependencies
   - Return the hook's `UseEntitySaveReturn` with the conflict atom value so consumers can read it

3. Wire DiffPreview into entity pages (agents, skills, rules):
   - Read `conflictAtom` in each entity page (or a shared wrapper)
   - When conflict is non-null, render `<DiffPreview>` with the conflict state
   - "Keep My Changes" handler: retry PUT with the new server ETag, then clear conflict
   - "Accept Server Version" handler: refetch entity detail, update draft atom, clear conflict
   - "Cancel" handler: clear conflict atom (leaves user in editing state)

**Files to create/edit:**

- `packages/luca-studio/stores/config-atoms.ts` (add conflictAtom)
- `packages/luca-studio/hooks/use-entity-save.ts` (parse 409 body, set conflict)
- `packages/luca-studio/app/agents/page.tsx` (render DiffPreview on conflict)
- `packages/luca-studio/app/skills/page.tsx` (render DiffPreview on conflict)
- `packages/luca-studio/app/rules/page.tsx` (render DiffPreview on conflict)

**Verification:**

- `bunx --bun tsc --noEmit` passes with no new type errors
- 409 response with `current_content` sets conflict atom instead of throwing
- DiffPreview is imported and rendered conditionally in all three entity pages
- "Keep My Changes" / "Accept Server Version" / "Cancel" handlers all clear the conflict atom

---

### 2. Extract Localhost Guard into Shared Helper

**Type:** auto
**TDD:** false
**Depends on:** none

Extract the inline localhost check (host starts with `localhost`, `127.0.0.1`, or `[::1]`) into a shared `isLocalhostRequest()` helper, then apply it to all routes including the compile route which currently lacks the guard.

**Implementation details:**

1. Create `packages/luca-studio/lib/request-guards.ts`:
   - Export `isLocalhostRequest(request: Request): boolean`
   - Check `request.headers.get("host")` against localhost, 127.0.0.1, [::1]
   - Export `requireLocalhost(request: Request): NextResponse | null` convenience wrapper that returns a 403 response or null if allowed

2. Replace inline checks in existing routes:
   - `app/api/events/route.ts` -- replace lines 74-84 with `requireLocalhost()` call
   - `app/api/git/publish/route.ts` -- replace lines 63-69 with `requireLocalhost()` call

3. Add guard to compile route:
   - `app/api/compile/route.ts` -- add `requireLocalhost()` check at top of POST handler (currently missing)

4. Search for any other routes with inline localhost checks and replace them.

**Files to create/edit:**

- `packages/luca-studio/lib/request-guards.ts` (new file)
- `packages/luca-studio/app/api/events/route.ts` (replace inline check)
- `packages/luca-studio/app/api/git/publish/route.ts` (replace inline check)
- `packages/luca-studio/app/api/compile/route.ts` (add guard)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `request-guards.ts` exports `isLocalhostRequest` and `requireLocalhost`
- No inline localhost checks remain in any API route files (search for `host.startsWith("localhost")`)
- Compile route returns 403 for non-localhost requests

---

### 3. Replace .passthrough() with .strict() on Entity Metadata Schema

**Type:** auto
**TDD:** false
**Depends on:** none

Harden the `EntityPutBodySchema` metadata sub-object by replacing `.passthrough()` with `.strict()` and explicitly enumerating all `EntityMetadata` fields. This prevents unknown fields from being silently forwarded to `writeEntityFile()`.

**Implementation details:**

1. In `entity-route-helpers.ts`, update the metadata sub-object of `EntityPutBodySchema`:
   - Add all 9 fields from the `EntityMetadata` interface in `ts-round-trip.ts`:
     - `varName: z.string().min(1)`
     - `domain: z.enum(["agents", "skills", "rules"])`
     - `imports: z.array(z.string())`
     - `sharedConstants: z.array(z.string())`
     - `exportVarName: z.string().min(1)`
     - `factoryFn: z.string().min(1)`
     - `configType: z.string().min(1)`
     - `prefix: z.string()`
     - `suffix: z.string()`
   - Replace `.passthrough()` with `.strict()`
   - Remove the `as EntityMetadata` cast on line 443 since the Zod type now matches exactly

2. Update the JSDoc comment on `EntityPutBodySchema` to reflect the strict validation.

**Files to create/edit:**

- `packages/luca-studio/lib/entity-route-helpers.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No `.passthrough()` calls remain in entity-route-helpers.ts
- Schema uses `.strict()` which rejects unknown fields
- The `as EntityMetadata` cast is removed (Zod inferred type matches interface)

---

### 4. Sanitize Commit Message in Git Publish Route

**Type:** auto
**TDD:** false
**Depends on:** none

Prevent trailer injection and malformed commit messages by sanitizing the commit summary in `git/publish/route.ts` to printable ASCII and enforcing a max-length guard.

**Implementation details:**

1. Add a `sanitizeCommitMessage(raw: string): string` function in `git/publish/route.ts`:
   - Strip non-printable ASCII characters (keep 0x20-0x7E range)
   - Replace newlines, carriage returns, and other control characters
   - Truncate to 72 characters (git subject line convention)
   - Trim leading/trailing whitespace

2. Apply sanitization to the `summary` variable before building `commitMessage`:
   - `const sanitizedSummary = sanitizeCommitMessage(summary)`
   - `const commitMessage = \`[studio-edit] ${sanitizedSummary}\``

3. Add a guard: if the sanitized summary is empty after stripping, use a generic fallback like `"update ${studioFiles.length} entities"`.

**Files to create/edit:**

- `packages/luca-studio/app/api/git/publish/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Commit messages are limited to printable ASCII characters
- Max length is enforced (72 chars for subject line)
- Empty/all-control-char summaries fall back to a generic message
- No newline or trailer injection is possible in the commit summary

---

### 5. Mask Internal Error Messages in Compile Proxy

**Type:** auto
**TDD:** false
**Depends on:** none

Replace raw `error.message` forwarding in `compile/route.ts` with generic messages in production. Detailed errors are preserved for development mode only.

**Implementation details:**

1. Add an `isDev` constant at module scope:
   - `const isDev = process.env.NODE_ENV !== "production"`

2. Update the "Unknown fetch error" catch block (lines 199-210):
   - In production: return `{ error: "Unexpected compilation error" }` with status 502
   - In development: keep the existing `{ error: \`Proxy error: ${message}\` }` behavior
   - Still publish the full error to compile events (server-side only, not user-facing)

3. Review the sidecar-unreachable and timeout responses:
   - These are operational messages (not internal stack traces) so they can stay as-is
   - They tell the user what to do ("Start it with: bun run sidecar") which is safe for dev-only usage

**Files to create/edit:**

- `packages/luca-studio/app/api/compile/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- In production mode, the generic catch returns "Unexpected compilation error" (no raw error.message)
- In development mode, detailed proxy error messages are preserved
- Compile events still receive the full error for server-side logging

## Verification

1. **Type check:** `bunx --bun tsc --noEmit` passes with zero errors across the entire project
2. **No regressions:** All existing API routes continue to function (manual smoke test)
3. **Security audit closure:**
   - No `.passthrough()` on entity metadata schema
   - No inline localhost checks (all use shared helper)
   - No raw error.message exposure in production compile proxy responses
   - No unsanitized user content in git commit messages
4. **Integration closure:** DiffPreview is wired into all three entity pages and surfaces on 409 conflicts

## Success Criteria

- All 5 roadmap items from the v8.3.0 audit are resolved
- `bunx --bun tsc --noEmit` passes cleanly
- DiffPreview dialog appears when saving an entity that has been concurrently modified
- Compile route rejects non-localhost requests with 403
- Commit messages contain only printable ASCII, max 72 chars
- Unknown fields in PUT metadata are rejected (strict mode)
- Internal error details are hidden from users in production

## Output Specification

- `packages/luca-studio/lib/request-guards.ts` (new shared helper)
- `packages/luca-studio/stores/config-atoms.ts` (conflictAtom addition)
- `packages/luca-studio/hooks/use-entity-save.ts` (conflict flow)
- `packages/luca-studio/lib/entity-route-helpers.ts` (strict schema)
- `packages/luca-studio/app/api/events/route.ts` (shared guard)
- `packages/luca-studio/app/api/git/publish/route.ts` (shared guard + sanitization)
- `packages/luca-studio/app/api/compile/route.ts` (guard + error masking)
- `packages/luca-studio/app/agents/page.tsx` (DiffPreview rendering)
- `packages/luca-studio/app/skills/page.tsx` (DiffPreview rendering)
- `packages/luca-studio/app/rules/page.tsx` (DiffPreview rendering)
