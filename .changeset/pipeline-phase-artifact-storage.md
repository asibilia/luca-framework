---
"@alecsibilia/luca-framework": minor
"@alecsibilia/luca-mastracode": minor
---

feat(pipeline): write run artifacts into `.planning/phases/<slug>/` instead of top-level

Introduces phase-scoped artifact storage. All session artifacts (PLAN.md, CONTEXT.md, RESEARCH.md, REVIEW-*.md, POSTMORTEM.md, CONFIDENCE-JOURNAL.md, verification-result.json, SUGGESTED-RULES.md, checks-convergence.json) now write to `.planning/phases/<phaseSlug>/` instead of `.planning/`. Cross-phase state (luca-state.json, ROADMAP.md, todos/, session-ledger.jsonl, routing-history.jsonl, verification-history.jsonl) stays at the `.planning/` root.

**New module**: `util/phase-paths.ts` — single source of truth for all `.planning/` path computations. Exports `phaseDir`, `phasePath`, `deriveSlug`, `resolveAvailableSlug`, and 10 root path constants.

**State schema**: `currentPhaseSlug?: string` added to `LucaWorkflowState`. Derived at triage from intent + ticket ID, immutable once set, survives mode transitions.

**Migration**: existing repos with loose `.planning/` artifacts can run `workflowState(action: "archive-loose")` to move them into a phase directory. The finalize `complete-phase` action now blocks if straggler artifacts are detected at the root.

**Security**: `claim-verifier.ts` `resolveArtifactPath` hardened — traversal guard runs before `existsSync` to prevent normalised-escape bypass; absolute-path inputs constrained to repo boundary.

Closes #220
