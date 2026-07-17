# Plan Review — #319 budget-guard, Phase 2 (budget-wiring)

**Status:** APPROVED
**Convergence:** CONVERGED (0 blocking, first review)
**Reviewer:** Plan Reviewer (cold-isolated)

All anchors verified against the untouched tree: `StatuslinePayload.cost` (handler.ts 86-89) lacks cost/duration fields; `main()` 292-319, used/limit at 307-308; both /lu surfaces' loop+Oversight confirmed; phase-execute wave boundary line 402 with existing `phase.suspend reason:"context_exhaustion"` (so `budget_halt` is genuinely new); `orchestrator-context-pruning.md` exists + live at phase-execute:501 (DELTA-3 correct); reader `UsageSidecarSchema` consumes only `{totalCostUsd, updatedAt}` (minimal write correct). Every grep ac anchors on a token ABSENT until its change lands (no pre-satisfied criteria). Splitting Test: all 11 ac + 3 anti are single binary probes. Deliverables map 1:1 to #319 changes 6–9. anti-03 dual-surface-sync guard present.

## Advisories (folded into execute/verify briefs — not looped back)
1. **G-CRIT-001** — the "budget guard is the one always-on stop, fires even in full-auto" Oversight claim (the crux behavioral requirement) has no ac. → executor must include a distinctive always-on/full-auto phrase on BOTH surfaces; verifier additionally greps both surfaces for it (extra goal-alignment check beyond the plan ac list).
2. **G-ARCH-001** — reader resolves the cache dir from process **cwd** (`budget.ts:171`), writer uses `workspace.project_dir` (`handler.ts:302`). They coincide at repo root in normal runs; a subdir invocation would miss the sidecar. Cost is best-effort (wall-time is the deterministic trip wire), so it degrades gracefully. → executor notes the cwd==project_dir assumption; no behavior change required.
3. **G-DX-001** — ac-04 only greps the key; executor must write the sidecar UNCONDITIONALLY when `totalCostUsd` is a number and stamp a fresh `new Date().toISOString()` `updatedAt` so the reader's staleness check (`budget.ts:190`) passes in live runs.

RECOMMENDATION: approve. Proceed to execute with the three advisories baked into the implementation brief.
