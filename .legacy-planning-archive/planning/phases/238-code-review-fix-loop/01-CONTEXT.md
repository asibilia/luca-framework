# Phase 238: Code Review Fix Loop — Discussion Context

**Phase:** 238
**Complexity:** MODERATE
**Milestone:** v8.5.2
**Prepared by:** lu-discuss

---

## 1. Current Code Review Flow

### State Machine Path

```
executed -> verified -> reviewed -> learned -> committed
```

The code review runs at **Step 3** in `phase-execute.skill.ts` (lines 137–158):

1. **Entry gate** (Step 3, line 139): Skip if `--skip-review`, `workflow.code_review: false`, or harness failed.
2. **Parallel spawn** (lines 143–151): Four reviewer agents fire simultaneously:
   - `review-arch` — architecture concerns
   - `review-dx` — DX/ergonomics concerns
   - `review-security` — security concerns
   - `review-simplify` — simplification opportunities
3. **Aggregation** (line 154): "Aggregate findings from all reviewers by severity."
4. **State write** (lines 156–158): `current_state` set to `"reviewed"` unconditionally.

### Output Contract

Each reviewer emits:

```
FINDINGS_COUNT: {N}
CRITICAL_COUNT: {N}
```

The `PhaseExecuteReviewOutputSchema` stores `review_findings[]` with `{ reviewer, severity, finding }` and `review_summary`.

### Pre-step Hook Enforcement

`src/hooks/scripts/pre-step-phase-execute.ts` (line 34): `review-` agents are valid only in state `"verified"`. The `"fix"` agent is valid in `"executed"` (lines 32–33). No agent is registered as valid in state `"reviewed"`.

### Config Gate

`config.json` has `"pause_on_critical_review": true` (line 173) — stored in `LuConfigSchema` but **never read** by `phase-execute.skill.ts` or `lu.skill.ts`. It is schema-defined but behaviorally inert.

---

## 2. The Gap: What Happens When Reviewers Find Issues

### Current Behavior

After reviewers aggregate findings — even with `CRITICAL_COUNT: 3` — the orchestrator:

1. Writes `current_state = "reviewed"` (unconditionally)
2. Proceeds to `Step 4: Learning Capture`
3. Emits `LEARN_COMPLETE` bridge event
4. Proceeds to `Step 6: Final Commit`

**There is no decision branch on `CRITICAL_COUNT` or severity.** The findings are stored in the context file (`phase_execute_review.review_findings`) and in the SUMMARY.md, but nothing acts on them before the commit.

### Why This Is a Gap

The harness fix loop (Step 2) correctly models the repair cycle:

```
FOR attempt = 1 to HARNESS_FIX_ITERATIONS:
  harness agent -> IF PASSED: BREAK
  fix agent -> (repeat)
```

Code review has no equivalent. The findings live in `review_summary` but nothing converts critical findings into fix work. The state machine has no path from `reviewed` back to `executed` for re-execution.

### Contrast: What Does Work Today (Partial Mitigation)

`7p. Gap closure retry` in `lu.skill.ts` (lines 285–292) runs **after** the full phase-execute completes if the phase had failures. It loops `plan-gaps -> execute-gaps -> harness`. This can catch some review findings if they also caused harness failures — but:

- It runs at the `lu` orchestrator level, not inside `phase-execute`
- It's triggered by harness failure, not review severity
- It does not re-run code review after the fix

---

## 3. Recommended Approach

### Recommendation: **Option 2 — Hoisted Review Fix Loop** (like harness)

**Reject Option 1 (Backward Transition)** for the following reasons:

- Adding `REVIEW_ISSUES_FOUND` event `verified → executed` creates a backward edge in the state machine
- The `fix` agent is gate-valid in `"executed"` but that state semantically means "waves ran, harness not yet checked" — re-entering it after review mixes two different failure modes
- The pre-step hook would require `fix` to be valid in `"verified"` OR the orchestrator must not transition out of `"verified"` before fixing — requiring a new intermediate state anyway
- XState does not prohibit backward transitions, but it complicates the directed acyclic graph assumption and makes state history harder to reason about

**Reject Option 3 (Gap Routing)** for the following reasons:

- `--gaps-only` is a UAT-routed path for user-confirmed failures, not an automated fix path
- Routing review findings through gap closure would bypass the structured `plan → execute → harness → review` pipeline inside `phase-execute`
- It would execute at the `lu` level, losing the context of which reviewer flagged what

**Why Option 2 (Hoisted Fix Loop) is correct:**

1. **Mirrors the harness pattern exactly**: The harness fix loop runs entirely inside `phase-execute`, is INLINE in the orchestrator, and keeps the state machine on `"verified"` until the loop completes. A review fix loop can mirror this structure: stay in `"verified"`, loop `review → fix → review`.

2. **No new states or backward transitions needed**: The loop fires while the machine is still in `"verified"`. Only one outcome exits the loop: either all critical findings are fixed (transition to `"reviewed"` via `REVIEW_COMPLETE`) or iterations exhausted (transition via `REVIEW_COMPLETE` with warnings noted).

3. **Pre-step hook requires minimal change**: `"fix-review-"` agents (or reuse of the existing `"fix"` agent with a new prompt) can be added to `validStates` as valid in `"verified"`.

4. **Consistent with `pause_on_critical_review: true`**: The config key is already defined in the schema. The fix loop naturally provides a decision point — on CRITICAL findings, spawn a fix agent; on HIGH/MEDIUM, log to SUMMARY.md and continue.

5. **Config-gated**: A new `review_fix_iterations` key in `config.json` (or reuse `harness.maxFixIterations`) controls depth. Default: 1 iteration for MODERATE, 2 for COMPLEX/CRITICAL (per complexity matrix).

### Recommended Loop Design

```
### Step 3: Code Review Fix Loop (verified -> reviewed) — HOISTED

Skip if: --skip-review, workflow.code_review: false, or harness failed.

FOR attempt = 1 to REVIEW_FIX_ITERATIONS (default 1 for MODERATE, 2 for COMPLEX):

  Spawn ALL reviewers in PARALLEL (same as today):
    Agent(name: "review-arch-{attempt}", ...)
    Agent(name: "review-dx-{attempt}", ...)
    Agent(name: "review-security-{attempt}", ...)
    Agent(name: "review-simplify-{attempt}", ...)

  Parse CRITICAL_COUNT from aggregated reviewer output.

  IF CRITICAL_COUNT == 0: BREAK (no critical findings, proceed to reviewed)

  IF attempt < REVIEW_FIX_ITERATIONS:
    Agent(name: "review-fix-{attempt}", description: "Fix critical review findings",
      prompt: REVIEW_FIX_PROMPT with findings from review agents)

  # On last attempt: log remaining issues, continue anyway (do not block commit)

Write state: reviewed
```

---

## 4. Integration Points

### Files to Modify (5 files)

| #   | File                                                    | Change                                                                                                                                                                                | Lines                                  |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | `src/skills/__schemas/states/phase-execute.states.ts`   | Add `review_fix_iterations` to `PhaseExecuteMachineContextSchema`. No new states or transitions needed — the loop stays in `"verified"`.                                              | Lines 56–62 (schema), no state changes |
| 2   | `src/skills/general/phase-execute.skill.ts`             | Replace Step 3 (lines 137–158) with the hoisted fix loop spec. Add `REVIEW_FIX_ITERATIONS` variable. Add `review-fix-{attempt}` agent invocation conditional on `CRITICAL_COUNT > 0`. | Lines 137–158                          |
| 3   | `src/hooks/scripts/pre-step-phase-execute.ts`           | Add `"review-fix-"` to `agentPrefixes` set (line 27). Add `"review-fix-": new Set(["verified"])` to `validStates` (lines 30–36).                                                      | Lines 26–37                            |
| 4   | `src/skills/__helpers/agent-prompts.ts`                 | Add `REVIEW_FIX_PROMPT` function. Takes `reviewer_findings[]` and instructions to fix CRITICAL severity items only. Output contract: `FIXES_APPLIED: {N}` / `UNFIXED: {N}`.           | After line 583                         |
| 5   | `src/skills/__schemas/phase-execute-context.schemas.ts` | Add `review_fix_iterations: z.number().default(0)` and `review_critical_resolved: z.boolean().default(false)` to `PhaseExecuteReviewOutputSchema`.                                    | Lines 76–92                            |

### Optional: config.json

Add `"reviewFixIterations": 1` under `workflow` section or under the complexity matrix. This is a cosmetic improvement — the skill can default to 1 without a config key.

### Not Needed

- `lu.skill.ts` Step 7k: The lu orchestrator delegates entirely to `phase-execute`. Step 7k is a high-level label; the loop lives inside `phase-execute.skill.ts`. No change needed in `lu.skill.ts`.
- `context-cli.ts` `LU_STATE_TO_BRIDGE_EVENTS`: Code review runs inside `phase-execute`, not at the `lu` state level. No bridge event change needed.
- New bridge events: The fix loop stays in `"verified"` state. `REVIEW_COMPLETE` and `SKIP_REVIEW` remain the only exit events from `"verified"`.

---

## 5. Risks and Edge Cases

### Risk 1 — Fix Agent Re-Introduces Issues (Medium)

**Scenario:** The `review-fix` agent fixes one CRITICAL finding but introduces a regression caught by a later reviewer iteration.
**Mitigation:** Cap at 1–2 iterations. On the final iteration, log remaining issues to `review_summary` but do not block the commit. The harness (which already ran before review) would catch any introduced regressions on the next phase.
**Residual risk:** Low. Review happens after harness, so mechanical regressions are unlikely.

### Risk 2 — Stale Diff Scope (Medium)

**Scenario:** `review-fix` agent reads `git diff main...HEAD` which includes all previous changes plus the wave execution. After `review-fix` applies additional edits, the second round of reviewers may re-flag the same original issues if the diff scope hasn't narrowed.
**Mitigation:** Pass the specific findings list as context to each reviewer iteration. The `CODE_REVIEW_PROMPT` should carry `PREVIOUS_ISSUES` parameter (analogous to `PLAN_REVIEW_PROMPT` pattern at line 229 of `lu.skill.ts`) so reviewers know what was already addressed.

### Risk 3 — Infinite False-Positive CRITICAL Flags (Low)

**Scenario:** A reviewer consistently flags a CRITICAL item that is actually correct by design (e.g., intentional `any` type, intentional empty catch block).
**Mitigation:** After iteration 1 fix attempt, if `CRITICAL_COUNT` is unchanged, treat as "acknowledged" and continue. The fix agent's output contract includes `UNFIXED: {N}` which the orchestrator uses to detect no-progress.

### Risk 4 — Pre-Step Hook False Rejection (Low)

**Scenario:** The `review-fix-` prefix-based matching in the hook fails to match `review-fix-1` if the prefix list only has `"review-"` (which already matches).
**Mitigation:** `"review-"` prefix already covers `review-fix-*`. The existing prefix set handles this correctly because it uses `.startsWith("review-")` matching. No ambiguity introduced.

### Risk 5 — Complexity Gating Overhead (Low)

**Scenario:** TRIVIAL/SIMPLE phases already skip review (`complexity < MODERATE`). Adding a fix loop for phases that never run review is a no-op.
**Mitigation:** The existing skip condition (`complexity >= MODERATE, not --skip-review`) covers this. The fix loop is inside the same skip gate — zero overhead for TRIVIAL/SIMPLE.

### Edge Case: `harness_passed: false` with Review Running

**Current behavior:** Line 139 of `phase-execute.skill.ts` skips review when harness failed. This is correct. The fix loop inherits this gate — no change needed.

### Edge Case: `--gaps-only` Mode

**Current behavior:** Line 55 of `phase-execute.skill.ts` shows `Conditional: SKIP_REVIEW when --skip-review, code_review: false, or harness failed`. Gaps-only mode runs with the same skip gates. The fix loop does not run in gaps-only mode.

---

## Summary

The recommended design adds a **hoisted review fix loop** (Option 2) inside `phase-execute.skill.ts` Step 3. It mirrors the harness fix loop architecture exactly: stays in `"verified"` state, loops `review → fix → review` up to `REVIEW_FIX_ITERATIONS`, then unconditionally transitions to `"reviewed"`. No new state machine states or backward transitions are needed. Five files change; the largest change is in `phase-execute.skill.ts` and `agent-prompts.ts`.
