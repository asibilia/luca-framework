---
plan: 21-04
status: complete
commits: [154a075]
---

# Summary: Context Monitor Adaptation

## What Changed

- Updated script header documentation to describe the dual-signal approach (transcript file size + WORKING.md file size)
- Removed early exit when `transcript_path` is missing; script now continues to WORKING.md fallback check
- Added WORKING.md file size fallback with configurable thresholds (`CONTEXT_WMD_WARN`, `CONTEXT_WMD_ALERT`, `CONTEXT_WMD_CRITICAL`)
- Implemented severity comparison logic (`severity_rank` function) so the higher severity between transcript and WORKING.md wins
- Updated output block to use resolved severity variables (`FINAL_LEVEL`, `FINAL_MSG`)
- Both signals run when available; plugin users without transcript access now get context warnings via WORKING.md growth

## Files Modified

- `src/hooks/scripts/context-monitor.sh` -- source script (93 lines -> 137 lines)
- `.claude/hooks/context-monitor.sh` -- generated Claude Code copy (via build:all)
- `.cursor/hooks/context-monitor.sh` -- generated Cursor copy (via build:all)

## Test Results

- `bash -n src/hooks/scripts/context-monitor.sh` -- syntax valid, no errors
- `bun run build:all` -- 308 files generated successfully, all hook scripts distributed
- `bun test` -- 877 pass, 6 skip, 0 fail (2558 expect() calls)
- `bunx --bun tsc --noEmit` -- pre-existing type errors in test files only; no new errors introduced (changes are bash-only)

## Notes

- The `session-start.sh` files had unstaged changes from a prior plan (21-03) that were not committed; these were left unstaged as they are out of scope for this plan
- TypeScript type check errors are all pre-existing in test files (`jira-adapter.test.ts`, `manifest.test.ts`, `hook-registry.test.ts`, `security-validation.test.ts`, `validation-utils.test.ts`) and unrelated adapter files; none were introduced by this change
- WORKING.md thresholds (20KB/40KB/60KB) are configurable via environment variables, matching the pattern used for transcript thresholds
