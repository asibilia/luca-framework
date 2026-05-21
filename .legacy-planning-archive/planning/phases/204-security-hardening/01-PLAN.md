---
phase: 204
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 204 Plan 1: Security Hardening — Fix All 6 Audit Findings

## Objective

Apply targeted security fixes to four Studio API route files, addressing all six findings from the v8.1.0 security audit. Each fix is a contained, low-risk change. No new abstractions or files are created.

## Context

- `packages/luca-studio/app/api/git/revert/route.ts` — findings 1 and 2
- `packages/luca-studio/app/api/git/publish/route.ts` — findings 4 and 6
- `packages/luca-studio/app/api/git/history/route.ts` — findings 4 and 5
- `packages/luca-studio/lib/config-section-handler.ts` — finding 3

## Tasks

### 1. Fix revert route: path allowlist + commit_sha hex validation (findings 1 & 2)

**Type:** auto
**TDD:** false
**Depends on:** none

Two security fixes in `packages/luca-studio/app/api/git/revert/route.ts`:

**Finding 1 — Path allowlist:** After parsing the request body, validate `file_path` against `STUDIO_PATH_PREFIXES` (the same list already defined in publish/route.ts). Normalize the path first using `path.normalize` and reject any path containing `..` traversal sequences. Return 403 if the path is not covered by a Studio prefix.

Implementation steps:

- Import `normalize` from `node:path` at the top
- Define `STUDIO_PATH_PREFIXES` array inline (copy from publish route) — the same four entries: `"src/agents/"`, `"src/skills/"`, `"src/rules/"`, `".planning/config.json"`
- Add a helper `isStudioFile(filePath: string): boolean` identical in logic to the one in publish/route.ts
- After parsing the body, normalize `file_path` with `normalize(file_path)` and check for `..` — if found, return 403 `{ error: "Path not allowed" }`
- Then call `isStudioFile(normalizedPath)` — if false, return 403 `{ error: "Path not allowed" }`
- Pass `normalizedPath` to the git checkout command instead of the raw `file_path`

**Finding 2 — Hex-only commit_sha:** Change the `commit_sha` validator in `RevertBodySchema` from:

```typescript
commit_sha: z.string().min(4, "commit_sha must be at least 4 characters"),
```

to:

```typescript
commit_sha: z.string().regex(/^[0-9a-f]{4,40}$/i, "commit_sha must be a hex string (4–40 chars)"),
```

**Files to create/edit:**

- `packages/luca-studio/app/api/git/revert/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes in `packages/luca-studio`
- Non-Studio path `"../../etc/passwd"` would be blocked by the 403 guard
- `commit_sha: "xyz!"` would fail schema validation
- `commit_sha: "abc123"` passes schema validation

---

### 2. Fix config-section-handler: remove ETag from 409 response body (finding 3)

**Type:** auto
**TDD:** false
**Depends on:** none

In `packages/luca-studio/lib/config-section-handler.ts`, the 409 conflict response currently leaks the current server-side ETag value in the response body:

```typescript
return NextResponse.json(
  {
    error: "Conflict: config has been modified since last read",
    currentEtag,
  },
  { status: 409 },
);
```

Remove `currentEtag` from the body so only the human-readable error message is returned:

```typescript
return NextResponse.json(
  { error: "Conflict: config has been modified since last read" },
  { status: 409 },
);
```

The `currentEtag` variable is still needed for the comparison on the line above — do not remove the variable declaration, only remove it from the JSON response payload.

**Files to create/edit:**

- `packages/luca-studio/lib/config-section-handler.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The 409 response object no longer contains `currentEtag` as a property

---

### 3. Fix publish route: localhost guard + 409 file path redaction (findings 4 & 6)

**Type:** auto
**TDD:** false
**Depends on:** none

Two security fixes in `packages/luca-studio/app/api/git/publish/route.ts`:

**Finding 4 — Localhost guard:** The POST handler currently accepts `export async function POST()` with no request parameter. Change the signature to `export async function POST(request: Request)` and add a localhost check at the very top of the try block, before any git operations:

```typescript
const host = request.headers.get("host") ?? "";
if (!host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

**Finding 6 — File path redaction from 409:** The current 409 response leaks the list of non-Studio dirty file paths:

```typescript
return NextResponse.json(
  {
    error: "Non-Studio uncommitted changes detected",
    files: nonStudioFiles,
  },
  { status: 409 },
);
```

Replace `files: nonStudioFiles` with a count to avoid leaking internal file paths:

```typescript
return NextResponse.json(
  {
    error: "Non-Studio uncommitted changes detected",
    file_count: nonStudioFiles.length,
  },
  { status: 409 },
);
```

**Files to create/edit:**

- `packages/luca-studio/app/api/git/publish/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- POST handler accepts `request: Request` parameter
- 409 response body contains `file_count` (number), not `files` (array)

---

### 4. Fix history route: localhost guard + SHA hex validation before diff-tree (findings 4 & 5)

**Type:** auto
**TDD:** false
**Depends on:** none

Two security fixes in `packages/luca-studio/app/api/git/history/route.ts`:

**Finding 4 — Localhost guard:** Add a localhost check using the incoming request's `host` header. The function signature is `export async function GET(request: Request)` — `request` is already available. Add the guard at the top of the try block, before any git operations:

```typescript
const host = request.headers.get("host") ?? "";
if (!host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

**Finding 5 — SHA hex validation before diff-tree:** Inside the commit parsing loop, after extracting `sha` from the parsed git log output, add a hex format guard before calling `diff-tree`. If the SHA does not match the full hex pattern, skip the entry:

```typescript
// Validate SHA is a well-formed full hex SHA before calling git
if (!/^[0-9a-f]{40}$/i.test(sha)) continue;
```

Insert this check right after the existing `if (!sha) continue;` guard (line 56 in the current file), so that malformed SHAs from git log output are rejected before being passed to the shell command.

**Files to create/edit:**

- `packages/luca-studio/app/api/git/history/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- A 41-character or non-hex SHA string would be skipped in the loop
- A 40-character lowercase hex SHA would pass the guard

---

## Verification

After all four files are modified, run from the studio package root:

```bash
cd /Users/alecsibilia/Github/luca-framework/packages/luca-studio && bunx --bun tsc --noEmit
```

All six findings should be resolved:

1. Revert path allowlist blocks non-Studio paths and traversal sequences
2. commit_sha hex regex rejects non-hex or too-short values
3. ETag absent from 409 conflict response body
4. Localhost guard on both publish (POST) and history (GET) routes
5. SHA hex validation gates the diff-tree shell call
6. 409 publish response returns `file_count` not `files`

## Success Criteria

- `bunx --bun tsc --noEmit` exits 0 with no errors
- All 6 security findings from the v8.1.0 audit are addressed
- No new abstractions, files, or dependencies introduced
- The four modified files remain internally consistent and functional

## Output Specification

Four modified source files:

- `packages/luca-studio/app/api/git/revert/route.ts`
- `packages/luca-studio/app/api/git/publish/route.ts`
- `packages/luca-studio/app/api/git/history/route.ts`
- `packages/luca-studio/lib/config-section-handler.ts`
