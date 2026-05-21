# Phase 228 — Post-Execution Gap Detection: Context

## Problem

The enforcement hooks (Layer 3) only fire when Skill() calls are made. If the LLM goes ad-hoc and does work inline, hooks never fire. Phase 227 added explicit "NEVER inline" constraints and state tracking, but these are still prompt-level enforcement (the LLM must choose to follow them).

Gap detection (Layer 5) provides a safety net: after execution completes, audit whether all expected sub-skills were actually invoked.

## Decisions

### 1. Gap audit implementation approach [auto-resolved]

**Decision:** The gap detection infrastructure already exists at `src/workflow/__helpers/gap-detector.ts`. The pr-address.skill.ts already documents Step 7 (gap detection audit) but it was never implemented in the orchestrator flow. Extend this pattern to all 5 orchestrators.

### 2. Non-terminal state detection hook [auto-resolved]

**Decision:** Create a SessionEnd/Stop hook that checks if any active orchestrator context file has a non-terminal `current_state`. If so, emit a warning that the session ended with steps potentially skipped.

### 3. Where gap audit code lives [auto-resolved]

**Decision:** Gap audit logic belongs in each orchestrator's SKILL.md spec as the final step before returning. It reads the context file, builds a checkpoint from the execution trace, and calls `detectGaps()`. This is documentation/spec work in .skill.ts files, not runtime code.

## Scope Boundary

- Add gap audit instructions to all 5 orchestrator specs
- Create a non-terminal state detection hook
- Do NOT modify gap-detector.ts or DAG definitions (already exist)
