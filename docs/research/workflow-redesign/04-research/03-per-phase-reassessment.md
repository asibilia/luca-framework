# Research: Reassessment After Every Phase

> **Learning:** GSD2 Learning 3 — Run `reassess-roadmap` after each slice (phase) completes, not just at the milestone boundary.
> **Date:** 2026-03-31
> **Status:** Research complete
> **Cross-references:** [01-fresh-context-per-unit.md](./01-fresh-context-per-unit.md), [02-task-sizing-constraint.md](./02-task-sizing-constraint.md)

## Summary

GSD2 runs a reassessment step after every slice (their equivalent of a Luca phase) to catch roadmap drift early. If a completed slice makes a future slice unnecessary, reveals a gap, or shifts dependencies, the roadmap is updated before the next slice begins. Luca currently has no per-phase reassessment — Step 5q (update state after each phase) marks the phase complete and emits PHASE_COMPLETE, but does not check whether remaining phases are still valid. GSD2's own ADR-003 acknowledges that always-on reassessment adds ceremony and proposes making it opt-in. The right design for Luca is a hybrid: a fast mechanical drift check that always runs, with a full LLM reassessment triggered only when the mechanical check flags a problem.

---

## 1. What Specifically Needs to Change in the Proposed Pipeline

### Step 5q Must Add a Drift Check After PHASE_COMPLETE

Currently, Step 5q (line 442-447 of lu.skill.ts) does two things:

1. Marks the phase complete in ROADMAP.md
2. Writes loop counter + remaining phases to the context file

It does NOT check whether the remaining phases are still valid. After a phase modifies the codebase, the assumptions underlying future phases may no longer hold.

**Change:** Insert a drift detection step between "mark phase complete" and "continue to next phase." This step runs after every phase, before the loop advances.

### New Step 5q+ (Drift Detection)

Position: After Step 5q (update state), before the loop advances to the next phase.

```
Step 5q+: Drift Detection (INLINE, always runs)

  1. MECHANICAL CHECK (deterministic, no LLM):
     - Read the files modified by this phase (from git diff)
     - Read the file lists referenced by remaining phases in ROADMAP.md
     - Check for intersection: did this phase modify files that future phases depend on?
     - Check for invalidation: did this phase delete/rename modules that future phases reference?
     - Check verification verdict: did the verifier flag issues that affect future phases?

  2. IF mechanical check flags drift:
     - Spawn Agent("reassess-{NN}") to evaluate and propose roadmap updates
     - OR: flag the drift for the user at the next oversight gate (5b of next phase)

  3. IF no drift detected:
     - Continue to next phase (zero overhead)
```

### Step 6 (Milestone Boundary) Inherits Better State

If per-phase reassessment catches drift early, the milestone boundary check (Step 6) sees a roadmap that accurately reflects reality. Currently, Step 6 may discover that 3 of 8 phases produced work that doesn't align — by then, significant tokens and time have been spent.

---

## 2. Mechanical vs LLM-Based Drift Detection

The key design question is: how much of the reassessment can be done mechanically (deterministic code, no LLM tokens) vs requiring LLM judgment?

### What Can Be Checked Mechanically

| Check                    | Method                                                                                                                               | Cost                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| File overlap             | Compare `git diff --name-only` against future phases' file references in ROADMAP.md                                                  | Zero LLM tokens — pure set intersection |
| Deleted/renamed modules  | Check if files referenced by future phases still exist                                                                               | Zero LLM tokens — `stat` calls          |
| Dependency graph changes | If this phase modified a dependency declaration (package.json, tsconfig paths), check if future phases depend on the changed package | Zero LLM tokens — grep + parse          |
| Verification failures    | Read harness/verifier output for this phase; if ISSUES verdict, check if the issues relate to files in future phases                 | Near-zero — read JSON, check file paths |
| New files created        | If this phase created files that weren't in the plan, check if they overlap with future phases' scope                                | Zero LLM tokens — set comparison        |
| Phase goal completion    | Did this phase's work fully achieve its ROADMAP.md goal, or were tasks parked?                                                       | Already known from verification step    |

### What Requires LLM Judgment

| Check                   | Why LLM is needed                                                                                                | Cost                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Semantic drift          | "This phase implemented auth differently than planned — does this affect the API phase's design?"                | Moderate — needs to understand code intent   |
| Scope creep detection   | "This phase added 3 unplanned files — are these tech debt or do they satisfy a future phase's need?"             | Moderate — needs judgment                    |
| Assumption invalidation | "Phase 5 assumes a REST API, but Phase 3 implemented WebSockets instead. Is Phase 5's plan still valid?"         | Moderate — needs architectural understanding |
| Opportunity detection   | "Phase 3's refactoring exposed a clean extension point that Phase 6 could leverage, simplifying Phase 6's plan." | Moderate — needs creative analysis           |

### The Hybrid Strategy

```
ALWAYS RUN (mechanical, 0 LLM tokens):
  - File overlap check
  - Deleted module check
  - Dependency graph change check
  - Verification failure propagation check

TRIGGER LLM ONLY WHEN mechanical check flags drift:
  - Semantic drift analysis
  - Scope creep evaluation
  - Assumption invalidation check
  - Opportunity detection
```

**Expected trigger rate:** Based on Luca's typical phase execution patterns, the mechanical check will flag drift in roughly 15-25% of phases. The remaining 75-85% of phases pass through with zero additional cost. This matches GSD2's ADR-003 observation that reassessment adds ceremony — by making it conditional on mechanical signals, we get the value without the overhead.

---

## 3. Concrete Implementation Approach

### 3a. Mechanical Drift Check (Inline in Orchestrator)

This runs in the orchestrator itself (no Agent() call needed):

```bash
# Step 5q+a: Get files modified by this phase
MODIFIED_FILES=$(git diff --name-only HEAD~$(git log --oneline --since="phase start" | wc -l) HEAD)

# Step 5q+b: Get files referenced by remaining phases
# Parse ROADMAP.md for future phase descriptions, extract file/module references
REMAINING_PHASES=$(grep -A 5 "^### Phase" .planning/ROADMAP.md | grep -v "COMPLETE" | ...)

# Step 5q+c: Check for intersection
OVERLAP=$(comm -12 <(echo "$MODIFIED_FILES" | sort) <(echo "$FUTURE_FILES" | sort))

# Step 5q+d: Check for deleted modules
for file in $FUTURE_FILES; do
  if [ ! -f "$file" ]; then
    DRIFT_SIGNALS="$DRIFT_SIGNALS\nDELETED: $file"
  fi
done

# Step 5q+e: Route decision
if [ -n "$OVERLAP" ] || [ -n "$DRIFT_SIGNALS" ]; then
  DRIFT_DETECTED=true
else
  DRIFT_DETECTED=false
fi
```

In practice, this would be more robust — the ROADMAP.md parsing needs to extract file references from phase descriptions, which may not always be explicit. A practical fallback is to check if the modified files are in directories that other phases' descriptions mention.

### 3b. LLM Reassessment Agent (Conditional)

Only spawned when `DRIFT_DETECTED=true`:

```typescript
export const REASSESS_PROMPT = (
  p: AgentPromptParams & {
    completedPhase: number;
    modifiedFiles: string[];
    remainingPhases: string[];
    driftSignals: string[];
  },
): string => `
<role>
You are lu-reassessor. Evaluate whether the just-completed phase's changes
invalidate, modify, or enhance remaining phases in the roadmap.
${AGENT_CONSTRAINT}
</role>

${memoryProtocol(p.vault, "cold", `phase ${p.completedPhase} reassessment`)}

<drift_signals>
Phase ${p.completedPhase} completed. The mechanical drift check flagged:
${p.driftSignals.join("\n")}

Files modified: ${p.modifiedFiles.join(", ")}
Remaining phases: ${p.remainingPhases.join(", ")}
</drift_signals>

<task>
1. Read ROADMAP.md for the remaining phase descriptions
2. Read the modified files to understand what changed
3. For each remaining phase, assess:
   - VALID: Phase plan is still correct, no changes needed
   - NEEDS_UPDATE: Phase plan needs modification (describe what)
   - REDUNDANT: Phase is no longer needed (this phase already did the work)
   - BLOCKED: Phase is now blocked by an issue this phase introduced
4. If any phase is REDUNDANT, propose marking it complete
5. If any phase NEEDS_UPDATE, describe the required changes
6. Write assessment to context file for the orchestrator
</task>

${outputContract("PHASES_VALID: {N}\nPHASES_NEED_UPDATE: {N}\nPHASES_REDUNDANT: {N}\nPHASES_BLOCKED: {N}")}
`;
```

### 3c. Orchestrator Decision Logic

After the reassessment agent returns (or after a clean mechanical check):

```
IF DRIFT_DETECTED == false:
  Continue to next phase (zero overhead added)

IF DRIFT_DETECTED == true AND reassessment returned:
  IF PHASES_REDUNDANT > 0:
    Mark redundant phases complete in ROADMAP.md (skip them)
    Log: "Phases {list} made redundant by Phase {NN}"

  IF PHASES_NEED_UPDATE > 0:
    IF oversight == "full-auto":
      Auto-apply updates to ROADMAP.md
    ELSE:
      PAUSE: Show user the proposed changes, ask for confirmation

  IF PHASES_BLOCKED > 0:
    Park blocked phases
    Check if this cascades to dependent phases
    Log warning

  Rebuild phase execution order (re-run Step 6 logic)
  Continue with updated order
```

### 3d. Agent Type Routing for Reassessor

Add to the Agent Type Mapping table in lu.skill.ts:

```
| reassess-* | lu-reassessor | ROUTER |
```

The ROUTER preset means: haiku for TRIVIAL/SIMPLE, sonnet for MODERATE+. Reassessment is a judgment task but not a deep analysis task — sonnet is sufficient.

### 3e. State Machine Integration

Add a new transition event for drift:

```bash
# When drift detected and handled:
luca-bridge transition --event=DRIFT_DETECTED --data='{"phase_id":PHASE_NUMBER,"drift_type":"overlap|deleted|semantic","action":"update|skip|park"}' 2>/dev/null || true
```

This creates an audit trail of drift detections in the session ledger, which is valuable for process metrics (Learning 7) and learning capture (how often does drift occur? which types of phases cause drift?).

---

## 4. Risks and Tradeoffs

### Risks of Adopting

1. **False positive drift signals.** The mechanical check may flag file overlaps that are benign. For example, Phase 3 modifies `tsconfig.json` (a file referenced by many phases) — this triggers drift detection even though the change is compatible. Mitigation: maintain an ignore list of "infrastructure files" (tsconfig.json, package.json, etc.) that don't trigger drift unless their structure changes materially.

2. **Reassessment agent quality.** The reassessment agent must understand both the completed phase's changes and the remaining phases' intent. If it gets this wrong, it may skip a needed phase or unnecessarily modify a plan. Mitigation: the reassessment agent's output goes through the oversight gate — in "flagged" or "phase" oversight modes, the user sees and approves changes.

3. **Added latency for drifting phases.** When drift IS detected, the reassessment agent adds an Agent() call (500-2000ms + token cost). For phases that frequently drift, this adds up. Mitigation: the mechanical check is sub-millisecond; only the LLM call adds latency, and it only fires when needed.

4. **Complexity in the orchestrator.** The drift check + conditional reassessment + roadmap update + execution order rebuild adds branching logic to the orchestrator. This is manageable but adds surface area for bugs. Mitigation: the drift check is deterministic (testable), and the reassessment agent is a standard leaf worker.

### Risks of NOT Adopting

1. **Wasted work on stale phases.** Without reassessment, the orchestrator executes phases whose assumptions are no longer valid. Phase 5 plans based on Phase 2's API design, but Phase 4 changed the API. Phase 5's executor attempts to implement against a stale design, fails verification, enters the fix loop, and may eventually park — all wasted work.

2. **Late drift discovery.** At the milestone boundary (Step 6), drift discovered across 8 phases is much harder to remediate than drift discovered after each phase. By then, code changes have been committed, branches have diverged, and the fix surface is large.

3. **Inaccurate milestone completion tracking.** Without per-phase reassessment, the milestone summary at Step 6 may show "5/8 phases complete" when in reality 2 of those 5 phases produced work that needs revision.

### Tradeoff Summary

| Dimension                   | Adopt                                    | Don't Adopt                  |
| --------------------------- | ---------------------------------------- | ---------------------------- |
| Wasted work                 | Lower (catch drift early)                | Higher (discover drift late) |
| Per-phase latency           | +0ms (no drift) to +2s (drift detected)  | +0ms                         |
| Orchestrator complexity     | Higher (drift check + conditional logic) | Lower                        |
| Milestone accuracy          | Higher (roadmap reflects reality)        | Lower                        |
| Agent() calls per milestone | +0 to +N (where N = phases with drift)   | +0                           |

### Cost-Benefit Estimate

For a typical 5-phase milestone:

- **Without reassessment:** 0 additional Agent() calls. But ~20% chance of wasting 1-2 phases on stale work. Expected cost of wasted work: ~1 phase worth of tokens + time.
- **With reassessment:** ~1.25 additional Agent() calls (25% drift rate \* 5 phases). Cost: ~2-5K tokens per reassessment call. Expected savings: avoids the ~1 wasted phase.

The math strongly favors reassessment: spend ~5K tokens to potentially save ~50K+ tokens of wasted execution.

---

## 5. Interaction with Other Learnings

### With Learning 1 (Fresh Context Per Unit)

Reassessment produces drift information that should be included in the context payload for subsequent phases (as described in Learning 1's research). The `PhaseContextPayload` from Learning 1 should include:

```typescript
upstream_drift?: {
  source_phase: number;
  drift_type: 'overlap' | 'deleted' | 'semantic';
  affected_files: string[];
  recommendation: string;
};
```

This ensures that the next phase's executor knows about drift without needing to recall it from MuninnDB or re-read the roadmap.

### With Learning 2 (Task Sizing)

Reassessment may discover that a future phase's tasks are now oversized or undersized given the completed phase's changes. For example:

- Phase 3 creates a new abstraction layer that Phase 5 can leverage, making Phase 5's tasks smaller than planned
- Phase 3 introduces complexity that Phase 5 must account for, making Phase 5's tasks larger

When reassessment detects a NEEDS_UPDATE phase, the update should include re-evaluating task sizes. If the reassessment agent flags that Phase 5's scope has grown, the orchestrator should trigger a re-planning pass (Step 7g) for Phase 5 before executing it.

### With Learning 4 (Stuck Detection)

Stuck detection operates at the task level (within a phase). Reassessment operates at the phase level (between phases). They are complementary:

- Stuck detection catches: "this task keeps failing the same way"
- Reassessment catches: "this phase is working against outdated assumptions"

A task may not be "stuck" in the loop sense but may be producing wrong output because its phase plan was invalidated by a previous phase. Reassessment prevents this category of failure entirely.

### With Learning 5 (Structured Verification Data)

If verification output is structured JSON (Learning 5), the mechanical drift check can read it programmatically:

```json
{
  "verdict": "ISSUES",
  "criteria_met": 4,
  "criteria_total": 5,
  "gaps": [
    {
      "criterion": "API endpoints follow REST conventions",
      "status": "FAILED",
      "affected_files": ["src/routes/api.ts"]
    }
  ]
}
```

The drift check can mechanically determine: "Phase 5 references `src/routes/api.ts`, and the verifier flagged an issue with that file. Trigger reassessment." No LLM interpretation needed.

### With Learning 7 (Pipeline Ceremony Overhead)

GSD2's ADR-003 proposes making reassessment opt-in to reduce ceremony. Our hybrid approach achieves this: the mechanical check is always-on (zero ceremony — it's sub-millisecond deterministic code) and the LLM reassessment is conditional (fires only when drift is detected). This means:

- **75-85% of phases:** zero additional overhead
- **15-25% of phases:** one additional Agent() call (~2-5K tokens)

This is significantly cheaper than GSD2's always-on approach (where every slice gets a full LLM reassessment session) while catching the same drift signals.

### With Learning 9 (State is Data, Not Documents)

The drift signals should be stored as structured data in the session ledger, not as prose in STATE.md:

```json
{
  "event": "DRIFT_DETECTED",
  "phase_id": 3,
  "timestamp": "2026-03-31T15:42:00Z",
  "drift_type": "overlap",
  "affected_phases": [5, 7],
  "action_taken": "reassess",
  "result": {
    "phases_valid": 1,
    "phases_need_update": 1,
    "phases_redundant": 0
  }
}
```

This enables mechanical analysis of drift patterns across milestones — which types of phases drift most often, which file categories cause drift, whether drift frequency correlates with complexity level. These metrics feed back into better planning (Learning 2) and better ceremony calibration (Learning 7).
