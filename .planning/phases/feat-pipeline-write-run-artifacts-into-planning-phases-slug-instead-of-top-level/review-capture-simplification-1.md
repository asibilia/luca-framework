# Review Capture — Simplification [Wave 1]

Subagent: reviewer | Perspective: simplification | 2026-05-05T19:10:00Z

## Findings

VERDICT: REQUEST_CHANGES

- [SHOULD-FIX] ensurePhaseDir is exported with zero external callers — dead API surface.
  File: packages/luca-mastracode/src/util/phase-paths.ts:155
  Suggestion: Unexport or inline.

- [SHOULD-FIX] PHASE_WHITELIST_LENIENT_EXTRA is a fully-derived subset of PHASE_WHITELIST_STRICT (identical 3 entries).
  File: packages/luca-mastracode/src/tools/repo-cleanup.ts:89-93
  Suggestion: Delete the LENIENT_EXTRA constant; use STRICT in lenient branch.

- [SHOULD-FIX] archiveLoose + archivePriorRun share ~20 lines of duplicated rename loop.
  Files: repo-cleanup.ts:219-270, session-ledger.ts:344-372
  Suggestion: Extract moveSafely() helper.

- [SHOULD-FIX] save-plan-artifacts has bespoke 3-branch path classifier (bare filename → phasePath; explicit → preserve; undefined → default). The "preserve-as-is" branch bypasses phasePath's traversal guard.
  File: packages/luca-mastracode/src/tools/workflow-state.ts:804-837
  Suggestion: Reject path-separator inputs; collapse to 2 branches.

- [NOTE] 6 instruction-file artifact-paths callouts duplicate boilerplate. Defer.

- [NOTE] STATE_PATH()/LOCK_PATH()/etc as zero-arg functions justified by mid-load chdir, but verbose. Future simplification.

CONSOLIDATED: MUST_FIX=0 SHOULD_FIX=4 NOTE=2 CROSS_PHASE=1
