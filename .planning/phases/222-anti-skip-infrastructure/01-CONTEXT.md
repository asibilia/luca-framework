# Phase 222: Anti-Skip Infrastructure — Context

## Phase Goal

Build the core enforcement infrastructure — per-skill state machines, progressive disclosure executor mode, pre-step hook enforcement, and event-sourced gap detection.

## Decisions

### 1. State Machine Factory Placement [researched]

**Decision:** Place `createSkillStateMachine` in `src/workflow/__helpers/` (T1 Core) as a generic factory wrapping XState `setup()` with Zod-validated state and event schemas.

**Rationale:** T2 entity isolation rule prevents placing it in `src/skills/__helpers/` — scout-02 (v8.6.0, also T2) would not be able to import it. T0 shared is for primitive utilities without workflow semantics. T1 workflow already contains `dag-builder.ts` as precedent for typed workflow structure factories.

**Constraints:**

- Factory must accept caller-supplied Zod schemas for states, events, and guards
- Must follow functional factory pattern (no classes)
- File name: `skill-state-machine.ts` in `src/workflow/__helpers/`
- Export via `src/workflow/index.ts` barrel

### 2. Hook Re-Entrancy Protection [researched]

**Decision:** Use `/tmp` timestamp-file guard with 1-2 second TTL and per-tool-call dedup key, extending the existing `guardDedup`/`checkThrottle` pattern from `hook-io.ts`.

**Rationale:** Claude Code hooks run as separate child processes — environment variables cannot share state between invocations. Lock files risk permanent blocking on crash. The `/tmp` timestamp pattern is already battle-tested in `hook-io.ts` (5s TTL for dedup, 60-120s for throttle). Key format: `/tmp/.luca-prestep-{hookName}-{projectHash}-{toolName}-ts`.

**Constraints:**

- Guard must execute BEFORE any expensive operations (bridge calls, file reads)
- TTL of 1-2 seconds (just enough to collapse a burst within a single LLM turn)
- Exit 0 on re-entry (don't block the tool, just skip the check)
- Import and extend existing `guardDedup` from `hook-io.ts`

### 3. Progressive Disclosure Context Budget [researched]

**Decision:** Use structured summaries as the default context inclusion strategy, with zone-adaptive degradation when context fills.

**Structured summary per prior step includes:**

- Step intent (1 sentence)
- Key decisions made
- Artifact references (file paths written/modified)
- Output pointers (not full output)

**Degradation policy:**

- PEAK zone (0-30%): Structured summary (default)
- GOOD zone (30-50%): Structured summary (unchanged)
- DEGRADING zone (50-70%): Key decisions only (drop artifact refs)
- POOR zone (70%+): Step name + pass/fail only

**Constraints:**

- Consume existing context zone signal from `resolve-context-tier.ts`
- Do NOT build a separate budget tracker — reuse zone machinery
- `executeProgressively()` must accept a `contextMode` parameter overridable by caller
- Never include full raw output of prior steps

### 4. Gap Detector Tolerance Model [researched]

**Decision:** Three-tier classification model — strict on required, tolerant on explicit skips, warn on optional.

**Classification:**

- **Required step with no ledger entry:** FAIL (gap detected)
- **Step skipped via --skip flag:** PASS — but requires `status: "skipped"` ledger entry with reason; missing entry is itself a gap
- **Step with guard returning false:** PASS — already recorded in `skippedSteps` in `DAGCheckpointSchema`
- **Optional step (new `optional: boolean` field):** WARNING if absent, not failure

**Implementation:**

- Add `optional: z.boolean().default(false)` to `WorkflowStepSchema`
- Update step executor to always write a ledger entry (even on skip/guard-false)
- Gap detector asserts: for each step in executed waves, `completedSteps[id] OR skippedSteps includes id OR failedSteps[id]`; if none match and `optional === false`, it is a gap

**Constraints:**

- Post-execution audit only — not a pre-step blocker (that's Layer 3's job)
- Output: JSON array of gap descriptions with step ID, expected status, and recommendation
- Bridge subcommand: `audit-gaps` returns structured JSON

## Deferred Ideas

- Scout-02 state machine: will borrow `createSkillStateMachine` from T1 workflow — no action needed now
- Hook performance profiling: if hook execution time exceeds 500ms per Skill() call, investigate — monitor after deployment

## Scope Boundary

This phase implements Layers 1-4 of the anti-skip architecture. Layer 0 (skill decomposition) and the pilot (applying all layers to pr-address) are Phase 223. Rollout to remaining skills is Phase 224.
