# Phase 204 Plan 1: Security Hardening — Execution Summary

## Result: COMPLETE

All 6 security audit findings from the v8.1.0 audit addressed across 4 route files in 4 atomic commits.

## Tasks Completed

### Task 1: Revert route — path allowlist + commit_sha hex validation (findings 1 & 2)

- **Commit:** `37fe3f98`
- **File:** `packages/luca-studio/app/api/git/revert/route.ts`
- **Changes:**
  - Added `STUDIO_PATH_PREFIXES` allowlist and `isStudioFile()` helper (identical logic to publish route)
  - Added `path.normalize()` with `..` traversal rejection (403)
  - Added non-Studio path rejection (403)
  - Changed `commit_sha` from `z.string().min(4)` to `z.string().regex(/^[0-9a-f]{4,40}$/i)` for hex-only validation
  - Passes `normalizedPath` to git checkout instead of raw `file_path`

### Task 2: Config-section-handler — remove ETag from 409 response (finding 3)

- **Commit:** `d14584fe`
- **File:** `packages/luca-studio/lib/config-section-handler.ts`
- **Changes:**
  - Removed `currentEtag` from the 409 conflict response JSON body
  - The `currentEtag` variable is retained for the If-Match comparison check

### Task 3: Publish route — localhost guard + 409 file path redaction (findings 4 & 6)

- **Commit:** `4f79c1e9`
- **File:** `packages/luca-studio/app/api/git/publish/route.ts`
- **Changes:**
  - Added `request: Request` parameter to POST handler (was parameterless)
  - Added localhost/127.0.0.1 host header guard (403)
  - Replaced `files: nonStudioFiles` with `file_count: nonStudioFiles.length` in 409 response
  - Updated JSDoc to reflect `file_count` instead of `files`

### Task 4: History route — localhost guard + SHA hex validation (findings 4 & 5)

- **Commit:** `3c4b77bc`
- **File:** `packages/luca-studio/app/api/git/history/route.ts`
- **Changes:**
  - Added localhost/127.0.0.1 host header guard (403) at top of try block
  - Added `if (!/^[0-9a-f]{40}$/i.test(sha)) continue;` after existing `if (!sha) continue;` guard

## Findings Mapping

| #   | Finding                               | File                               | Fix                                                          |
| --- | ------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| 1   | Revert path not validated             | revert/route.ts                    | STUDIO_PATH_PREFIXES allowlist + normalize + traversal check |
| 2   | commit_sha accepts arbitrary strings  | revert/route.ts                    | Hex-only regex `/^[0-9a-f]{4,40}$/i`                         |
| 3   | ETag leaked in 409 body               | config-section-handler.ts          | Removed `currentEtag` from response payload                  |
| 4   | No localhost guard on publish/history | publish/route.ts, history/route.ts | Host header check on both routes                             |
| 5   | SHA not validated before diff-tree    | history/route.ts                   | 40-char hex regex guard before shell call                    |
| 6   | File paths leaked in 409 response     | publish/route.ts                   | Replaced `files` array with `file_count` number              |

## Deviations

None. All changes followed the plan exactly.

## Verification

- `bunx --bun tsc --noEmit` exits with only pre-existing errors (`.next/types/validator.ts`, `harness-tab.tsx`, `raw-config-editor.tsx`, `file-watcher.ts`, and pre-existing strict null checks in the modified route files)
- No new TypeScript errors introduced
- No new files, abstractions, or dependencies added
