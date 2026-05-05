# Review Capture — Architecture [Wave 1]

Subagent: reviewer | Perspective: architecture | 2026-05-05T19:10:00Z

## Findings

VERDICT: REQUEST_CHANGES

- [MUST-FIX] reset-pipeline silently preserves currentPhaseSlug, breaking the "immutable once set" invariant on the next run.
  File: packages/luca-mastracode/src/tools/workflow-state.ts:916-958
  Detail: The reset-pipeline action clears every triage output field and all phase-progress fields but does NOT clear currentPhaseSlug. After reset, when the user starts a new intent, save-triage-results guards with `if (!current.currentPhaseSlug && triage.intent)` — guard becomes false, resolveAvailableSlug never called, new session inherits prior session's phase directory. Two unrelated sessions then collide under the same phases/<old-slug>/ tree.
  Suggestion: Add `currentPhaseSlug: undefined` to explicit clear list in reset-pipeline freshState object.

- [SHOULD-FIX] Two non-pipeline modules hardcode .planning/ path construction bypassing the chokepoint.
  File: packages/luca-mastracode/src/integration/branding.ts:17, packages/luca-mastracode/src/state/shadow-scanner.ts:156, packages/luca-mastracode/src/modes/triage.ts:38
  Detail: Direct `join(process.cwd(), '.planning', ...)` instead of CONFIG_PATH() / LOCK_PATH().
  Suggestion: Replace with phase-paths constants.

- [SHOULD-FIX] completePhase does NOT clear currentPhaseSlug — multi-phase ROADMAP reuses Phase 1's slug for Phase 2.
  Detail: Slug is per-triage-session by design, but JSDoc is ambiguous.
  Suggestion: Add explicit JSDoc clarification to LucaWorkflowState.currentPhaseSlug confirming "one slug per triage session; all ROADMAP phases share it."

- [SHOULD-FIX] phasePath() traversal guard misses '.' filename (resolves to dir itself).
  File: packages/luca-mastracode/src/util/phase-paths.ts:176-190
  Suggestion: Add `|| filename === '.'` to rejection condition.

- [NOTE] resolveAvailableSlug TOCTOU race (acknowledged in code comments).

- [NOTE] PHASE_WHITELIST_STRICT does not include REVIEW-{n}.md patterns.

CONSOLIDATED: MUST_FIX=1 SHOULD_FIX=3 NOTE=2
