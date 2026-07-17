# Learnings — Phase 2 (budget-wiring), #319 budget-guard

Phase 2 wired the Phase-1 budget guard into surfaces: statusline→sidecar cost bridge, `luca budget check` into both /lu loops + phase-execute waves, config docs. Both reviewers APPROVE, 0 must-fix; one advisory fix loop applied 4 should-fixes, converged 15/15. This was a narrow wiring phase — few but sharp learnings, all surfaced by the review advisory loop.

---

## pitfall: copied fragment references a prerequisite absent on the target surface

- **Type**: pitfall · **Confidence**: HIGH
- **Conjectured**: Duplicating a working instruction/code fragment onto a parallel surface (the dual `/lu` skill + command bodies) reproduces working behavior, since the two surfaces are kept textually parallel.
- **Refuted by**: `commands/lu.ts` step-1a copied the skill's `luca telemetry emit --kind budget.halt --run-id <RUN_ID>` emit, but the command surface's Step 0 never establishes a run id (only the skill's Step 0 has the run-id block) — an empty `--run-id` exits 1. Dangling reference (audits/code-review.md:6, verify.json ac-08).
- **Learned**: Textual parity is not behavioral parity. A copied fragment carries an implicit contract — every variable/setup it references (`<RUN_ID>`) must ALSO exist on the target surface. When cloning across the dual `/lu` surfaces, verify each referenced token has a producer on the destination, not just the source.
- **Criterion now**: When duplicating a fragment onto a parallel surface, enumerate every `<VAR>`/prerequisite it reads and confirm each is established on the target's setup step. Fix chosen here: establish `RUN_ID` inline in the command's Step 0 (mirror the skill) rather than delete the emit. See [[pattern:dual-lu-surface-sync]].

## pitfall: a review advisory fix can silently invalidate an existing verification criterion

- **Type**: pitfall · **Confidence**: HIGH
- **Conjectured**: A convergent should-fix from both reviewers is safe to apply as-written — reviewers optimize for correctness.
- **Refuted by**: The reviewers' proposed fix for the dangling `<RUN_ID>` was "DROP the budget.halt telemetry from the command surface" (audits/code-review.md:6). But plan ac-07/ac-08 REQUIRE `budget.halt` present on BOTH `/lu` surfaces — dropping it would have failed the verification contract. Caught before re-verify; the fix was changed to "establish RUN_ID" (verify.json ac-08, signal-digest orchestrator catch).
- **Learned**: An advisory fix is scoped to the reviewer's local concern; it can be blind to a plan-level acceptance criterion the fix would break. The reviewer and the ac contract are independent constraints, and the ac wins.
- **Criterion now**: Before accepting an advisory fix, grep the plan's `## Verification Criteria` for any ac that touches the symbol/behavior the fix removes or changes. If the fix would flip an ac from met→unmet, reject it and prefer the fix that preserves the contract (add the missing prerequisite, don't delete the referencing code).

## pattern: best-effort cross-process signal bridge via a minimal sidecar file

- **Type**: pattern · **Confidence**: HIGH
- **Conjectured**: To get a signal (cost) from a producer process (statusline) to a consumer in a different process (the budget evaluator), you need shared state / a richer handoff payload.
- **Refuted by**: Cost is reachable ONLY via the statusline (`cost.total_cost_usd`); hooks/orchestrator tools get no cost field (plan.md:15). The bridge is just a file: statusline writes `<projectDir>/.claude/cache/luca-usage-signal.json` = `{schemaVersion:1, totalCostUsd, updatedAt}` — exactly the shape the reader consumes, nothing more (handler.ts writeUsageSignal, summary.md:6).
- **Learned**: A one-way cross-process signal bridge needs only three properties: (1) write ONLY the minimal shape the reader parses (extra fields are inert/dead surface — Phase-1 review already stripped context fields); (2) stamp a FRESH `updatedAt` on every write so the reader's staleness gate passes; (3) wrap the entire mkdir+write in try/catch and `void`-call it so the bridge can NEVER crash or alter the producer's output/exit code (statusline must not crash the harness — anti-02).
- **Criterion now**: For any additive signal bridge, assert: schema matches the reader's consumed keys exactly; a fresh timestamp is written each time; the write is fully swallowed (a malformed/absent input still exits 0). Keep a deterministic fallback signal (here wall-time) since best-effort bridges degrade to absent (headless statusline). See [[pattern:pure-evaluator-advisory-cli-best-effort-signal-guard]].

## pitfall: an "always-on" guard expressed as an LLM-followed instruction needs an explicit escape note

- **Type**: pitfall · **Confidence**: MEDIUM
- **Conjectured**: Wiring an always-on stop as an unconditional instruction in the loop body is self-evidently unconditional — no editor would gate it.
- **Refuted by**: The phase-execute wave `budget check` sat alongside oversight-gated context self-assessment; a reviewer flagged that a future editor could gate it behind oversight mode. Fix added an explicit clause: "always-on stop — fires regardless of oversight mode; do NOT gate behind checkpoint/full-auto" (audits/code-review.md:8, verify.json G-CRIT-001).
- **Learned**: When a guard's whole point is to escape a conditioning mechanism it lives next to (oversight/`full-auto`), instruction bodies are mutated by future LLMs who pattern-match on nearby conditionals. The unconditional intent must be stated defensively in prose, or it decays into a gated check.
- **Criterion now**: Any always-on behavior placed next to gated behavior must carry an inline "do NOT gate this behind <the mechanism it must escape>" note. Grep for the escape clause as a verification token (here `always-on budget stop` on both surfaces).

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

- **Satisfaction valence trend (positive)**: checks positive ×2, verify positive ×2 (15/15), review positive (both reviewers APPROVE, 0 must-fix). No negative-valence steps. The one advisory fix loop applied 4 should-fixes and converged cleanly — friction was contained to the review→fix→re-verify cycle, which is the designed path, not a hotspot.
- **Recurring theme — dual-surface parity is the phase's dominant risk**: two of the four review advisories (dangling `<RUN_ID>`, missing `--complexity`) are both "the two surfaces diverged in a way textual-parity grep didn't catch." The `pattern:dual-lu-surface-sync` risk is real and recurs; grep-token anti-criteria (anti-03) catch presence but NOT prerequisite/argument parity.
- **Cross-cutting pattern — the orchestrator's ac-preservation catch**: the highest-value signal was the orchestrator overriding a reviewer-proposed fix (drop the emit) because it would have invalidated ac-07/08. This is the generalizable win (pitfall #2): the ac contract is a constraint the reviewer advisory does not see.
- **No failure signals / no confidence journal** entries were present in the digest beyond the satisfaction/review events above.
