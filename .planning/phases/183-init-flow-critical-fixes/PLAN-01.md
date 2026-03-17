---
phase: 183
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 183 Plan 1: Fix MuninnDB Download URL and Binary Verification

## Objective

Fix the MuninnDB download URL 404 (REQ-01) and add post-download binary verification (REQ-02). The current `buildDownloadUrl()` constructs an invalid GitHub release URL when version is `"latest"`, producing `.../releases/download/latest/...` which 404s. After fixing the URL, we add file-size verification after download to catch empty/corrupt binaries.

## Context

@packages/luca-framework/src/utils/muninndb-download.ts
@packages/luca-framework/src/utils/muninndb-health.ts
@packages/luca-framework/src/utils/muninndb-schemas.ts
@.planning/phases/183-init-flow-critical-fixes/183-RESEARCH.md
@.planning/phases/183-init-flow-critical-fixes/183-CONTEXT.md

## Tasks

### 1. Add `resolveLatestReleaseTag()` function

**Type:** auto
**TDD:** false
**Depends on:** none

Add a new async function `resolveLatestReleaseTag()` to `muninndb-download.ts` that resolves the `"latest"` version to an actual GitHub release tag.

**Implementation:**

1. Add a module-level cache variable: `let cachedLatestTag: string | null = null;`
2. Create `resolveLatestReleaseTag(repoSlug: string): Promise<string | null>`:
   - If `cachedLatestTag` is not null, return it immediately (session cache)
   - Fetch `https://api.github.com/repos/${repoSlug}/releases/latest` with a 5-second timeout
   - On success (200), parse JSON and extract `tag_name`
   - Set `cachedLatestTag = tag_name` and return it
   - On any failure (network, rate limit, 404), return `null`
3. Add a module-level constant for the repo slug: `const MUNINNDB_REPO_SLUG = process.env.MUNINNDB_REPO_SLUG ?? "nicholasgasior/muninn";`
4. Include full JSDoc documentation with `@example` blocks

**IMPORTANT NOTE on repo URL:** Research found that `nicholasgasior/muninn` returned 404 from the GitHub API. The `MUNINNDB_REPO_SLUG` env var override allows fixing this without code changes if the repo path is different. The executor should verify the repo URL is correct before proceeding. If the API returns 404, the fallback URL path still works.

**Files to create/edit:**

- `packages/luca-framework/src/utils/muninndb-download.ts` (add function after line 34, add constant after line 34)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Function signature matches: `(repoSlug: string) => Promise<string | null>`
- Cache variable is module-scoped (not exported)

### 2. Update `downloadMuninndbBinary()` to resolve tag before building URL

**Type:** auto
**TDD:** false
**Depends on:** 1

Modify `downloadMuninndbBinary()` to resolve the `"latest"` version to an actual tag before calling `buildDownloadUrl()`.

**Implementation:**

In `downloadMuninndbBinary()` (currently line 252), after the platform resolution block and before the URL construction block (currently line 274):

1. Resolve the effective version:

   ```
   const requestedVersion = version ?? MUNINNDB_DEFAULT_VERSION;
   let effectiveVersion = requestedVersion;

   if (requestedVersion === "latest") {
     const resolvedTag = await resolveLatestReleaseTag(MUNINNDB_REPO_SLUG);
     if (resolvedTag) {
       effectiveVersion = resolvedTag;
     } else {
       // Fallback: use redirect-based URL pattern
       // GitHub supports: releases/latest/download/{asset}
       // Our base ends with /download, so we need a different base
     }
   }
   ```

2. For the fallback case (API resolution failed), construct the URL differently:
   - Replace the base URL from `.../releases/download` to `.../releases/latest/download`
   - This means: when `effectiveVersion` is still `"latest"` after resolution attempt, build the URL using the redirect pattern instead of the tag pattern
   - Construct as: `${MUNINNDB_DOWNLOAD_BASE.replace('/releases/download', '/releases/latest/download')}/${MUNINNDB_BINARY_NAME}-${target}`

3. Pass `effectiveVersion` to `buildDownloadUrl()` instead of `version`:

   ```
   url = buildDownloadUrl(platformResult.target, effectiveVersion);
   ```

4. When using the fallback redirect URL, also set `skipChecksum = true` for that request since the sidecar may not be available at the redirect location.

**Files to create/edit:**

- `packages/luca-framework/src/utils/muninndb-download.ts` (modify `downloadMuninndbBinary()`)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- When `MUNINNDB_VERSION=v0.5.0`, URL should be `.../releases/download/v0.5.0/muninndb-{target}`
- When `MUNINNDB_VERSION=latest` and API succeeds, URL should use the resolved tag
- When `MUNINNDB_VERSION=latest` and API fails, URL should use `.../releases/latest/download/muninndb-{target}`

### 3. Add binary file-size verification after download

**Type:** auto
**TDD:** false
**Depends on:** 2

After the binary is written to disk and permissions are set, verify the file size is greater than 0 bytes.

**Implementation:**

In `downloadMuninndbBinary()`, after the `chmod 755` line (currently line 311) and before the checksum verification block (currently line 313):

```typescript
// Verify binary is not empty (REQ-02)
const downloadedFile = Bun.file(binaryPath);
const fileSize = downloadedFile.size;
if (fileSize === 0) {
  spinner?.stop("Download failed: binary is empty (0 bytes)");
  try {
    unlinkSync(binaryPath);
  } catch {
    // Best-effort cleanup
  }
  return MuninndbInstallResultSchema.parse({
    success: false,
    binaryPath: null,
    error:
      "Downloaded binary is empty (0 bytes). The release asset may be missing or the download was interrupted.",
  });
}
```

**Files to create/edit:**

- `packages/luca-framework/src/utils/muninndb-download.ts` (add after chmod, before checksum block)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Empty file (0 bytes) results in failure with descriptive error
- Non-empty file proceeds to checksum verification
- Failed binary is cleaned up (unlinked)

### 4. Update JSDoc for `buildDownloadUrl()` to document the "latest" behavior

**Type:** auto
**TDD:** false
**Depends on:** 2

Update the JSDoc comment on `buildDownloadUrl()` to clarify that callers should resolve `"latest"` before calling, since this function is synchronous and cannot do async tag resolution.

**Files to create/edit:**

- `packages/luca-framework/src/utils/muninndb-download.ts` (update JSDoc on `buildDownloadUrl`)

**Verification:**

- JSDoc mentions that `"latest"` should be pre-resolved by the caller
- Includes `@see resolveLatestReleaseTag` reference

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. The download URL for explicit versions (e.g. `v0.5.0`) is unchanged: `.../releases/download/v0.5.0/muninndb-{target}`
3. The download URL for `"latest"` uses either the resolved tag or the redirect pattern -- never `.../releases/download/latest/...`
4. Empty binaries are rejected with a descriptive error message
5. Module-level tag cache prevents repeated API calls within the same process

## Success Criteria

- REQ-01 satisfied: Download URL no longer 404s for `"latest"` version
- REQ-02 satisfied: Binary existence and file size are verified after download
- No regressions: Explicit version downloads continue to work
- Graceful degradation: API resolution failure falls back to redirect URL
- Cache efficiency: Tag is resolved at most once per process

## Output Specification

- Modified file: `packages/luca-framework/src/utils/muninndb-download.ts`
- New function: `resolveLatestReleaseTag(repoSlug: string): Promise<string | null>`
- New constant: `MUNINNDB_REPO_SLUG`
- New module variable: `cachedLatestTag`
- Updated function: `downloadMuninndbBinary()` (tag resolution + file size check)
- Updated JSDoc: `buildDownloadUrl()` documentation
