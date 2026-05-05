# Review Capture — DX [Wave 1]

Subagent: reviewer | Perspective: dx | 2026-05-05T19:10:00Z

## Findings

VERDICT: REQUEST_CHANGES

- [MUST-FIX] repoCleanupTool action enum has zero per-value documentation for archive-loose.
  File: packages/luca-mastracode/src/tools/repo-cleanup.ts:291
  Suggestion: Expand .describe() to explain archive-loose preconditions + when to prefer workflowState vs repoCleanup.

- [MUST-FIX] phasePath JSDoc documents wrong invariant — claims "ensures parent dir" but @example doesn't show the side effect.
  File: packages/luca-mastracode/src/util/phase-paths.ts:169-174
  Suggestion: Add explicit side-effect note + cross-reference to phaseDir.

- [SHOULD-FIX] repoCleanupTool's archive-loose returns `{error}` while workflowStateTool returns `{success:false, error}` — shape mismatch confuses agents.
  File: packages/luca-mastracode/src/tools/repo-cleanup.ts:473-477
  Suggestion: Normalize to `{success:false, error}` shape.

- [SHOULD-FIX] finalize.md step 2.5 doesn't explain why workflowState is preferred over repoCleanup for archive-loose.
  File: packages/luca-mastracode/src/instructions/finalize.md:132-146
  Suggestion: Add one-line rationale.

- [SHOULD-FIX] Artifact-paths callouts inconsistent across 6 instruction files:
  - triage.md lists RESEARCH.md (which doesn't exist at triage time)
  - review.md callout omits review-capture-*.md
  - finalize.md callout omits SUGGESTED-RULES.md
  Suggestion: Audit each callout against PHASE_WHITELIST_STRICT.

- [NOTE] Test gap (gitignored *.test.ts) undocumented.

CONSOLIDATED: MUST_FIX=2 SHOULD_FIX=3 NOTE=1
