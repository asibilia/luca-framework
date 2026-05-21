# Phase 01-02 Summary: Improve stale session lock cleanup in build system

## Completed Tasks

### t1: Improve error message with recovery options

- Updated the `else` branch (session lock blocking build) in `scripts/build-all.ts`
- Replaced the terse two-line error with a structured message listing four recovery options:
  1. Wait for the session to end naturally
  2. Run with `--force` to override the lock and build anyway
  3. Manually delete the lock file (`rm .claude/.session-lock`)
  4. Run with `--cleanup-stale-locks` to remove the lock without building
- Added note that locks older than 4 hours are automatically removed

### t2: Add --cleanup-stale-locks flag

- Added `--cleanup-stale-locks` CLI flag handling at the top of `main()`, before the existing lock check block
- If the flag is present and the lock file exists: removes the lock and prints confirmation, then exits 0
- If the flag is present and no lock file exists: prints "No stale lock found" and exits 0
- Updated the JSDoc usage comment at the top of the file to document both `--force` and `--cleanup-stale-locks` flags

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors
- Error message includes all four recovery options
- 4h auto-cleanup threshold preserved unchanged (line 61: `hoursOld > 4`)

## Files Modified

- `scripts/build-all.ts` — session lock guard improvements and new `--cleanup-stale-locks` flag
