# Summary 135-02: Convert ErrorBoundary to functional + replace cost page inline loading

## Status: COMPLETE

## Changes Made

### T1: Add react-error-boundary dependency

- Added `react-error-boundary@^6.1.1` to `packages/luca-observer/package.json` dependencies.
- Commit: `feat(luca-observer): add react-error-boundary dependency for functional error boundary`

### T2: Rewrite ErrorBoundary as functional component (M4)

- Replaced class-based `ErrorBoundary` with a functional wrapper around `react-error-boundary`.
- **Bug fixed**: The original class was missing `static getDerivedStateFromError()`, so React never set `hasError: true` and the error boundary silently swallowed all errors. The new implementation correctly catches errors via `react-error-boundary`'s internal `getDerivedStateFromError`.
- Preserved identical named export (`ErrorBoundary`) and props API (`children`, `fallback?`, `name?`) -- zero consumer changes required across all 11 importing files.
- Adapted to v6 types: `onError` callback uses `unknown` for the error parameter; `DefaultFallback` extracts the error message via `instanceof Error` type guard.
- Commit: `fix(luca-observer): rewrite ErrorBoundary as functional component using react-error-boundary`

### T3: Replace cost page inline loading with LoadingSkeleton (M5)

- Replaced 4 inline `animate-pulse` summary cards with `<LoadingSkeleton variant="card" />`.
- Replaced `space-y-6` with `flex flex-col gap-6` on both loading and loaded-state wrapper divs.
- Zero `animate-pulse` instances remain in `cost/page.tsx`.
- Commit: `style(luca-observer): replace cost page inline loading with shared LoadingSkeleton`

## Verification

| Check                                       | Result                   |
| ------------------------------------------- | ------------------------ |
| `bunx --bun tsc --noEmit`                   | Pass (clean)             |
| `react-error-boundary` in package.json      | `^6.1.1` in dependencies |
| `error-boundary.tsx` has no `class` keyword | Confirmed (0 matches)    |
| `cost/page.tsx` has no `animate-pulse`      | Confirmed (0 matches)    |
| All 11 consumer files compile unchanged     | Pass                     |

## Files Modified

- `packages/luca-observer/package.json` -- added react-error-boundary dependency
- `packages/luca-observer/bun.lock` -- lockfile updated
- `packages/luca-observer/components/shared/error-boundary.tsx` -- full rewrite to functional
- `packages/luca-observer/app/cost/page.tsx` -- loading skeleton + layout consistency
