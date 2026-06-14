# Learnings — Phase 2: init-mcp-cleanup

**Outcome:** PASS. Low-risk cleanup (WS5+WS6+WS7); both reviewers `issues: []`. No must-fix iterations.

## Validated this phase (no new MuninnDB engrams — already covered or routine)
- The WS6 token-read seam left "swap-ready" in phase 1 paid off: extraction to `readMuninnToken()` and rewiring both call sites was a one-line swap at each site with zero behavior change. Confirms the phase-1 process note (leaving a documented seam for a deferred refactor). Already captured as part of phase-1 learnings; no new engram.
- Helper placement (`utils/muninn-token.ts`) was a routine application of the promotion model (2 cross-module callers + deletion test) — not novel enough to persist.

## Carry-forward (non-blocking, for a future tidy-up — NOT this milestone)
- `writeApiKeyToEnv` (vault-setup.ts) still loops over a now-single-element `envLines` array — leftover multi-key scaffolding from the old per-vault aliasing. Harmless; a one-liner simplification if ever touched.
- `readMuninnToken`'s `existsSync` guard is strictly redundant with the catch (ENOENT swallowed) — kept for readability.

## Process
- Subagent commits worked this phase (unlike the phase-1 review-fix wave) — the stage-gate `bash-commit` block during execute is intermittent/session-scoped; the durable rule (orchestrator commits if a subagent is blocked) is already captured in `process:execute-stage-gate-blocks-subagent-commit`.
