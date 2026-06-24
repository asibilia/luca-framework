# PLAN-01 Summary: Fix MuninnDB Download URL and Binary Verification

**Phase:** 183
**Plan:** 1
**Status:** COMPLETE
**Commit:** 2d5ccbb7

## What Changed

Modified `packages/luca-framework/src/utils/muninndb-download.ts` with four additions:

### Task 1: `resolveLatestReleaseTag()` function

- Added module-level `MUNINNDB_REPO_SLUG` constant (env-overridable via `MUNINNDB_REPO_SLUG`)
- Added module-level `cachedLatestTag` cache variable (not exported)
- Added async `resolveLatestReleaseTag(repoSlug)` function that queries the GitHub Releases API with a 5-second timeout, caches the result, and returns `null` on any failure

### Task 2: Version resolution in `downloadMuninndbBinary()`

- When `requestedVersion === "latest"`, the function now tries API resolution first via `resolveLatestReleaseTag()`
- If API succeeds, uses the resolved tag (e.g. `v0.5.0`) with the existing `buildDownloadUrl()` path
- If API fails, constructs a redirect-based URL: `/releases/latest/download/{asset}` (GitHub redirect pattern)
- When using the redirect fallback, checksum verification is automatically skipped since the sidecar may not be available at the redirect location
- Explicit version downloads (e.g. `v0.5.0`) are completely unchanged

### Task 3: Binary file-size verification

- After chmod and before checksum verification, checks `Bun.file(binaryPath).size`
- If file is 0 bytes, cleans up the empty file and returns a failure with a descriptive error message
- Non-empty files proceed to checksum verification as before

### Task 4: JSDoc update for `buildDownloadUrl()`

- Updated JSDoc to document that `"latest"` should be pre-resolved by callers
- Added `@see resolveLatestReleaseTag` cross-reference
- Updated `@param version` to clarify it should be a concrete tag

## Verification

- `bunx --bun tsc --noEmit` shows zero new errors (4 pre-existing errors in `dist/plugin/` build artifacts, unrelated)
- Explicit version downloads produce unchanged URLs: `.../releases/download/v0.5.0/muninndb-{target}`
- `"latest"` version uses either resolved tag or redirect pattern -- never `/download/latest/`
- Empty binaries are rejected with descriptive error
- Module-level cache prevents repeated API calls

## Deviations

None. All tasks completed as specified in the plan.

## Success Criteria

- [x] REQ-01 satisfied: Download URL no longer 404s for `"latest"` version
- [x] REQ-02 satisfied: Binary existence and file size are verified after download
- [x] No regressions: Explicit version downloads continue to work
- [x] Graceful degradation: API resolution failure falls back to redirect URL
- [x] Cache efficiency: Tag is resolved at most once per process
