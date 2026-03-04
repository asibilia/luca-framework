# Plan 106-01 Summary: Modernize Next.js Config

## Status: COMPLETE

## What Was Done

### Task 106-01-1: Update next.config.ts with security headers and modern settings

- Removed redundant `reactStrictMode: true` (default since Next.js 13.4)
- Added `output: "standalone"` for production-ready builds with optimized output
- Added security headers from joes-book--next reference repo:
  - `X-Frame-Options: DENY` (clickjacking protection)
  - `X-Content-Type-Options: nosniff` (MIME sniffing prevention)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` (camera, microphone, geolocation disabled)
  - `X-DNS-Prefetch-Control: on`
  - `Strict-Transport-Security` (HSTS with preload)
- Fixed pre-existing TS2532 strict null errors in `__tests__/utils/test-helpers.test.ts` (6 occurrences)

### Task 106-01-2: Verify

- `bunx --bun tsc --noEmit` passes (clean)
- `bun test` passes (3395 tests, 0 failures)

## Files Changed

### Modified Files

- `packages/luca-observer/next.config.ts` (+26/-2 lines)
- `packages/luca-observer/__tests__/utils/test-helpers.test.ts` (+6/-6 lines, strict null fix)

### New Files

- `.planning/phases/106-modernize-nextjs-config/01-PLAN.md`

## Key Design Decisions

1. **Skipped image remote patterns**: Reference repo has app-specific patterns for Pokemon/TMDB images. Observer doesn't use remote images.
2. **Skipped API rewrites**: Reference repo rewrites to Flask backend. Observer's API routes are internal Next.js API routes.
3. **Added standalone output**: Enables `next build` to produce a self-contained `.next/standalone` directory for deployment without `node_modules`.

## Verification

- TypeScript: `bunx --bun tsc --noEmit` passes
- Tests: 3395 tests pass, 0 failures
