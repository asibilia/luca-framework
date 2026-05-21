# Phase 238: Code Review Fix Loop — Execution Plan

**Phase:** 238
**Complexity:** MODERATE
**Milestone:** v8.5.2
**Approach:** Option 2 — Hoisted Review Fix Loop (mirrors harness fix loop)
**Waves:** 2
**Tasks:** 6

---

## Objective

Add a hoisted review fix loop inside `phase-execute.skill.ts` so that code review findings with `CRITICAL_COUNT > 0` trigger a fix-and-re-review cycle before the orchestrator transitions to `"reviewed"`. The loop stays in `"verified"` state for all iterations and only exits when critical findings are resolved or iterations are exhausted. No new state machine states or backward transitions are needed.

---

## Context

- @src/skills/general/phase-execute.skill.ts — Step 3 (lines 137–158), the code review section to replace
- @src/skills/\_\_helpers/agent-prompts.ts — `HARNESS_FIX_PROMPT` (lines 495–521) and `CODE_REVIEW_PROMPT` (lines 558–583) as the pattern to mirror
- @src/skills/\_\_schemas/phase-execute-context.schemas.ts — `PhaseExecuteReviewOutputSchema` (lines 76–92) to extend
- @src/skills/\_\_schemas/states/phase-execute.states.ts — `PhaseExecuteMachineContextSchema` (lines 56–62) for optional context field
- @src/hooks/scripts/pre-step-phase-execute.ts — `validStates` map (lines 29–37) for the `review-fix-` prefix
- @.planning/phases/238-code-review-fix-loop/01-CONTEXT.md — Full discussion context and risk analysis

---

## Wave 01: Schema + Prompt Changes

### Task 01.1 — Add `review_fix_iterations` to `PhaseExecuteReviewOutputSchema`

**File:** `src/skills/__schemas/phase-execute-context.schemas.ts`
**Lines:** 76–92 (`PhaseExecuteReviewOutputSchema`)

Add two fields to `PhaseExecuteReviewOutputSchema`:

- `review_fix_iterations: z.number().default(0)` — tracks how many fix iterations were attempted
- `review_critical_resolved: z.boolean().default(false)` — true when final `CRITICAL_COUNT == 0`

**Change:**

```typescript
// Before (lines 76–88):
export const PhaseExecuteReviewOutputSchema = z.object({
  reviewers_spawned: z.array(z.string()).default([]),
  review_findings: z
    .array(
      z.object({
        reviewer: z.string(),
        severity: z.string().default("info"),
        finding: z.string().default(""),
      }),
    )
    .default([]),
  review_summary: z.string().default(""),
});

// After — add two fields before closing brace:
export const PhaseExecuteReviewOutputSchema = z.object({
  reviewers_spawned: z.array(z.string()).default([]),
  review_findings: z
    .array(
      z.object({
        reviewer: z.string(),
        severity: z.string().default("info"),
        finding: z.string().default(""),
      }),
    )
    .default([]),
  review_summary: z.string().default(""),
  review_fix_iterations: z.number().default(0),
  review_critical_resolved: z.boolean().default(false),
});
```

**Verification:**

- `bunx --bun tsc --noEmit` passes (no type errors)
- `PhaseExecuteReviewOutput` inferred type includes `review_fix_iterations: number` and `review_critical_resolved: boolean`
- Existing callers that create `PhaseExecuteReviewOutput` objects without these fields still pass schema validation (both have `.default()`)

---

### Task 01.2 — Add `REVIEW_FIX_PROMPT` to `agent-prompts.ts`

**File:** `src/skills/__helpers/agent-prompts.ts`
**Location:** After line 583 (after `CODE_REVIEW_PROMPT` export closing brace), before the `LEARNING_CAPTURE_PROMPT` block

Add a new exported function `REVIEW_FIX_PROMPT` that mirrors `HARNESS_FIX_PROMPT`. It accepts:

- `findings: string` — aggregated critical findings text from the reviewer outputs
- `p: AgentPromptParams` — standard prompt params

Output contract: `FIXES_APPLIED: {N}` and `UNFIXED: {N}`.

**Template to add:**

```typescript
/**
 * Prompt for review fix: fix CRITICAL-severity code review findings.
 *
 * Called by the review fix loop in phase-execute when CRITICAL_COUNT > 0.
 * Mirrors HARNESS_FIX_PROMPT — fixes specific items and commits.
 *
 * @param findings - Aggregated CRITICAL finding text from all reviewer outputs
 * @param p - Standard agent prompt params
 */
export const REVIEW_FIX_PROMPT = (
  findings: string,
  p: AgentPromptParams,
): string => {
  const sanitizedFindings = findings
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `
<role>
You are the review fixer. Fix the CRITICAL-severity code review findings listed below.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "warm", "fixing critical review findings")}

<critical_findings>
${sanitizedFindings}
</critical_findings>

<task>
1. Read each CRITICAL finding, identify the file and location
2. Fix the root cause (not just the symptom)
3. Commit fixes atomically: git add <files> && git commit -m "fix(review): resolve critical review findings"
4. Run bunx --bun tsc --noEmit to verify no type errors introduced
5. If a finding is intentional by design and should NOT be changed, explain why in UNFIXED
</task>

${outputContract("FIXES_APPLIED: {N}\nUNFIXED: {N}")}
`;
};
```

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `REVIEW_FIX_PROMPT` is exported from the module (can be imported in `phase-execute.skill.ts`)
- Function signature matches `HARNESS_FIX_PROMPT` pattern exactly (two params: data string + AgentPromptParams)

---

### Task 01.3 — Register `review-fix-` prefix in `pre-step-phase-execute.ts`

**File:** `src/hooks/scripts/pre-step-phase-execute.ts`
**Lines:** 26–37 (`agentPrefixes` and `validStates`)

Add `"review-fix-"` to `agentPrefixes` set and add its valid state entry.

Per Risk 4 analysis in 01-CONTEXT.md: the existing `"review-"` prefix already covers `review-fix-*` because prefix matching uses `.startsWith("review-")`. However, we add an explicit `"review-fix-"` entry to `validStates` so the fix agents are locked to `"verified"` state — separate from the regular `"review-"` prefix that is also valid in `"verified"`.

**Change:**

```typescript
// Before:
  agentPrefixes: new Set([
    "review-", // matches review-arch, review-dx, review-security, review-simplify
  ]),
  validStates: {
    "execute-waves": new Set(["setup"]),
    harness: new Set(["executed"]),
    fix: new Set(["executed"]),
    verify: new Set(["executed", "verified"]),
    "review-": new Set(["verified"]),
    learn: new Set(["reviewed"]),
    "process-data": new Set(["reviewed", "learned"]),
  },

// After:
  agentPrefixes: new Set([
    "review-",      // matches review-arch, review-dx, review-security, review-simplify
    "review-fix-",  // matches review-fix-1, review-fix-2 (fix loop agents)
  ]),
  validStates: {
    "execute-waves": new Set(["setup"]),
    harness: new Set(["executed"]),
    fix: new Set(["executed"]),
    verify: new Set(["executed", "verified"]),
    "review-": new Set(["verified"]),
    "review-fix-": new Set(["verified"]),
    learn: new Set(["reviewed"]),
    "process-data": new Set(["reviewed", "learned"]),
  },
```

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The hook TypeScript compiles without error
- `agentPrefixes` set contains both `"review-"` and `"review-fix-"` entries

---

## Wave 02: phase-execute Spec Update

### Task 02.1 — Replace Step 3 in `phase-execute.skill.ts` with the hoisted review fix loop

**File:** `src/skills/general/phase-execute.skill.ts`
**Lines:** 137–158 (Step 3: Code Review section)

Replace the flat Step 3 code review section with the hoisted fix loop spec. The loop:

1. Runs all reviewers in parallel (unchanged from today)
2. Parses `CRITICAL_COUNT` from aggregate output
3. If `CRITICAL_COUNT == 0`: breaks (no critical findings)
4. If `attempt < REVIEW_FIX_ITERATIONS`: spawns `review-fix-{attempt}` with `REVIEW_FIX_PROMPT`
5. On the final attempt: logs remaining issues, continues (non-blocking)

**Replacement content for lines 137–158:**

```
### Step 3: Code Review Fix Loop (verified -> reviewed) — HOISTED

Skip if: --skip-review, workflow.code_review: false, or harness failed.

Read `REVIEW_FIX_ITERATIONS` from config (default: 1 for MODERATE, 2 for COMPLEX/CRITICAL).

**If review runs:** Run the following loop:

```

FOR attempt = 1 to REVIEW_FIX_ITERATIONS:

Spawn ALL reviewers in PARALLEL from this orchestrator:

Agent(name: "review-arch-{attempt}", description: "Architecture review",
prompt: CODE_REVIEW_PROMPT("architecture", {...}))
Agent(name: "review-dx-{attempt}", description: "DX review",
prompt: CODE_REVIEW_PROMPT("dx-advocate", {...}))
Agent(name: "review-security-{attempt}", description: "Security review",
prompt: CODE_REVIEW_PROMPT("security", {...}))
Agent(name: "review-simplify-{attempt}", description: "Simplification review",
prompt: CODE_REVIEW_PROMPT("simplifier", {...}))

Parse CRITICAL_COUNT from aggregated reviewer output.

IF CRITICAL_COUNT == 0: BREAK (no critical findings, proceed)

IF attempt < REVIEW_FIX_ITERATIONS:
Aggregate all CRITICAL findings into a single findings string.
Agent(name: "review-fix-{attempt}", description: "Fix critical review findings",
prompt: REVIEW_FIX_PROMPT(critical_findings_text, {...}))

# On last attempt with remaining criticals: log to review_summary but continue.

# Track no-progress: if CRITICAL_COUNT unchanged from prior attempt, treat as

# acknowledged and break (prevents stall on false-positive CRITICAL flags).

````

Write context with review results:
```bash
bun src/skills/__schemas/context-cli.ts write phase-execute \
  '{"phase_execute_review":{"reviewers_spawned":[...],"review_findings":[...],"review_summary":"...","review_fix_iterations":{N},"review_critical_resolved":{bool}}}'
````

````

**Write state (unchanged):**
```bash
bun src/skills/__schemas/context-cli.ts write phase-execute '{"current_state":"reviewed"}'
````

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The step spec references `REVIEW_FIX_PROMPT` (added in Task 01.2)
- The loop structure mirrors Step 2 (Harness Fix Loop) exactly
- The no-progress guard prevents infinite stall on acknowledged false-positive criticals
- On `--skip-review`: loop is entirely skipped, no change from current behavior
- Context write includes both new fields (`review_fix_iterations`, `review_critical_resolved`)

---

### Task 02.2 — Update Success Criteria in `phase-execute.skill.ts`

**File:** `src/skills/general/phase-execute.skill.ts`
**Lines:** 221–231 (Success Criteria section at bottom of spec)

Add one new success criterion for the review fix loop:

```markdown
## Success Criteria

- [ ] All plans executed (execute-waves agent)
- [ ] Harness fix loop ran (hoisted, up to N iterations)
- [ ] Phase goal verified (verify agent)
- [ ] VERIFICATION.md created
- [ ] Code review fix loop ran (parallel reviewers + optional fix agent, unless skipped)
- [ ] Review fix loop resolved CRITICAL findings or exhausted iterations
- [ ] Learnings captured (learn agent)
- [ ] Bridge transitions emitted (VERIFY_PASSED, LEARN_COMPLETE, COMMIT_COMPLETE)
- [ ] current_state written after every transition
- [ ] STATE.md and ROADMAP.md updated
```

**Verification:**

- `bunx --bun tsc --noEmit` passes (this is a spec string change, type-safe)
- Success criteria list matches the updated loop behavior

---

### Task 02.3 — Verify bridge sync is NOT needed

**File:** `src/skills/__schemas/context-cli.ts`
**Section:** `LU_STATE_TO_BRIDGE_EVENTS` map

Confirm that no bridge event changes are needed. Per 01-CONTEXT.md Section 4 "Not Needed":

- The review fix loop stays entirely in `"verified"` state
- `REVIEW_COMPLETE` and `SKIP_REVIEW` remain the only exit events from `"verified"`
- The fix loop is contained within Step 3 of `phase-execute.skill.ts` — it does not emit new bridge events
- The `lu.skill.ts` Step 7k delegates entirely to `phase-execute` — no change needed there

**Action:** Read `src/skills/__schemas/context-cli.ts` and confirm `LU_STATE_TO_BRIDGE_EVENTS` contains no `review-fix` entry and no change is needed. Add a comment to `context-cli.ts` near the review event entries noting that the review fix loop is intentionally contained within `phase-execute` and does not require additional bridge events.

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `LU_STATE_TO_BRIDGE_EVENTS` is unchanged or has only a comment addition
- Confirmed: `REVIEW_COMPLETE` and `SKIP_REVIEW` are the only review-related bridge events

---

## Overall Success Criteria

- [ ] `PhaseExecuteReviewOutputSchema` has `review_fix_iterations` and `review_critical_resolved` fields with defaults
- [ ] `REVIEW_FIX_PROMPT` exported from `agent-prompts.ts`, mirrors `HARNESS_FIX_PROMPT` pattern
- [ ] `pre-step-phase-execute.ts` has `"review-fix-"` in both `agentPrefixes` and `validStates` (state: `"verified"`)
- [ ] `phase-execute.skill.ts` Step 3 replaced with hoisted fix loop spec (loop structure, no-progress guard, context write)
- [ ] Step 3 skip conditions unchanged: `--skip-review`, `workflow.code_review: false`, harness failed
- [ ] All fix iterations stay in `"verified"` state — no backward transitions added
- [ ] `lu.skill.ts` and `context-cli.ts` unchanged (bridge sync not needed)
- [ ] `bunx --bun tsc --noEmit` passes on all modified files
- [ ] No test files created (no-tests rule)

---

## Risk Notes

- **Risk 1 (Fix agent re-introduces issues):** Capped at 1–2 iterations. Non-blocking on final attempt.
- **Risk 3 (False-positive CRITICAL stall):** No-progress guard detects unchanged `CRITICAL_COUNT` and breaks.
- **Risk 4 (Pre-step hook prefix matching):** Confirmed safe — `"review-"` already matches `review-fix-*`. Explicit entry added for clarity.
- **Not modified:** State machine transitions, bridge events, `lu.skill.ts`, `context-cli.ts`
