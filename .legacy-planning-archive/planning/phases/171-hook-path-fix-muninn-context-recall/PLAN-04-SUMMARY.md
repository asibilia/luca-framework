# PLAN-04 Summary: Create MuninnDB Context Recall Hook

**Phase:** 171
**Plan:** 4
**Status:** COMPLETE
**Wave:** 2

## Objective

Create a synchronous UserPromptSubmit hook that recalls relevant MuninnDB memories from both repo and default vaults and injects them as `additionalContext` into the conversation.

## Tasks Completed

| #   | Task                                                       | Commit     | Status |
| --- | ---------------------------------------------------------- | ---------- | ------ |
| 1   | Create muninn-context-recall.ts hook script                | `07330893` | Done   |
| 2   | Register in canonical hook registry                        | `e7488285` | Done   |
| 3   | Add UserPromptSubmit to deploy-global.ts mergeSettings()   | `a36d1106` | Done   |
| 4   | Add missing scripts to removeGlobalArtifacts() lucaScripts | `1de5506b` | Done   |

## Files Changed

- **NEW:** `src/hooks/scripts/muninn-context-recall.ts` -- Sync UserPromptSubmit hook with dual-vault recall and additionalContext injection
- **MODIFIED:** `src/hooks/__helpers/hook-registry.ts` -- Added `muninn-context-recall` entry (async: false, timeout: 8)
- **MODIFIED:** `scripts/deploy-global.ts` -- Added UserPromptSubmit event with both hooks; completed all 3 lucaScripts arrays with 4 missing script names

## Key Design Decisions

1. **Sync hook (async: false)** -- Required for `additionalContext` to be injected; Claude Code only processes `hookSpecificOutput.additionalContext` from synchronous hooks
2. **guardDedup at module level** -- Prevents double-firing when hook is registered at both global and project level
3. **60-second throttle** -- Avoids hammering MuninnDB on rapid prompts while still providing fresh context for meaningful work units
4. **Dual-vault recall with Promise.all** -- Parallel recall from repo vault (project-specific) and default vault (cross-cutting patterns/preferences), merged by concept with dedup
5. **Top 5 after dedup** -- Recall 3 per vault (6 total), deduplicate by concept keeping highest score, take top 5 for context injection
6. **Silent failure** -- Wraps `await main()` in `.catch()` that exits 0; hook must never block user prompts

## Deviations

- **[Rule 2 - Missing Critical]** Added 4 missing script names (`user-prompt-submit.sh`, `muninn-context-recall.sh`, `subagent-stop.sh`, `post-tool-use-failure.sh`) to all 3 `lucaScripts` arrays in `deploy-global.ts`. Without these entries, `removeGlobalArtifacts()` would not clean up these hooks and `mergeSettings()` would not filter them from non-Luca hooks during re-deploy.

## Verification

- TypeScript compiles cleanly (only pre-existing errors in `packages/luca-observer/lib/types.ts`)
- Hook file uses `guardDedup("muninn-context-recall")` at module level
- Hook uses `checkThrottle()` with 60-second TTL
- Hook performs dual-vault recall via `recallMuninnEngrams()`
- Hook emits `hookSpecificOutput.additionalContext` (not `systemMessage`)
- Hook always exits 0 (catch handler on main())
- Registry entry has `async: false`, `timeout: 8`, `event: "user_prompt_submit"`
- Sync hook listed before async hook in UserPromptSubmit event
- All lucaScripts arrays are now complete
