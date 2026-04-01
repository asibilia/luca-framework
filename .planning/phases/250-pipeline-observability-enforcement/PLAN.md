# Phase 250: Pipeline Observability & Enforcement

## Objective

Close the observability and enforcement gap in the `/lu` flat orchestrator. The state machine (28 events, 14 states), agent definitions (48 compiled), model routing table (7 presets, 40+ agents), and enforcement hooks all exist but are disconnected from actual execution. Wire them up in three complementary layers without changing the flat orchestrator architecture.

## Context

**Root cause:** Phase 232 migrated from nested `Skill()` calls to flat `Agent()` orchestration to work around Claude Code bug #17351. The migration preserved the anti-skip enforcement hooks but dropped ~20 observability touchpoints (bridge transitions, status bus writes, agent type routing).

**Current symptoms:**

- Statusline shows "idle" during active `/lu` execution
- State machine receives only 2 transitions per run (START via hook, COMMIT_COMPLETE at end)
- Agent definitions with tool constraints, model routing, and cognition tiers are orphaned
- LLM can spawn arbitrary agents (e.g., `code-developer`) outside the pipeline

**Constraint:** Must NOT change the flat orchestrator architecture. Bug #17351 is still open.

## Success Criteria

1. Statusline shows accurate step progress during `/lu` execution (e.g., `[lu] > executing [6/8] phase 42`)
2. State machine transitions through all relevant states during a full `/lu` run
3. Every Agent() call in lu.skill.ts specifies `subagent_type` with model routing
4. Unregistered agent names are blocked by enforcement hooks (advisory first, then blocking)
5. `bunx --bun tsc --noEmit` passes after all changes

---

## Wave 1: Layer A — Wire Up Transitions

**Goal:** Connect lu.skill.ts to the existing state machine and status bus infrastructure.

### Task 1.1: Add bridge transitions to lu.skill.ts

**File:** `src/skills/luca/lu.skill.ts`

Add the following instrumentation to the skill prompt template (the `sections[0].content` string):

| Location in skill                     | Transition to add                | Data                                                            |
| ------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| Step 1 (after crash recovery)         | `luca-bridge ensure-init`        | None                                                            |
| Step 2 (after classify output parsed) | Already exists: `ROUTE_COMPLETE` | `{complexity}` — verify LLM fills this correctly                |
| Step 7 loop entry (before 7a)         | `PHASE_START`                    | `{phase_id}`                                                    |
| Step 7i (after harness loop)          | `HARNESS_COMPLETE`               | `{status, total_errors}` — LLM parses from harness agent output |
| Step 7n (after git commit)            | `PHASE_COMPLETE`                 | `{phase_id, summary}`                                           |
| Step 7m (after process-data agent)    | `PROCESS_DATA_COMPLETE`          | None                                                            |

Each transition uses the existing pattern: `luca-bridge transition --event=EVENT --data='...' 2>/dev/null || true`

**Verification:**

- [ ] lu.skill.ts has 6+ bridge transition calls (up from 2)
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] ROUTE_COMPLETE includes complexity data
- [ ] PHASE_START/PHASE_COMPLETE bracket each phase loop iteration

### Task 1.2: Add status bus writes to lu.skill.ts

**File:** `src/skills/luca/lu.skill.ts`

Add `luca-bridge write-status` calls at key milestones where the hooks don't already cover:

| Location                         | Status write                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Step 4.5 (git setup)             | `--step="git-setup" --stage="EXECUTING" --detail="Creating issue and branch"` |
| Step 6 (build execution order)   | `--step="phase-order" --detail="N phases queued"`                             |
| Step 7i (harness fix loop entry) | `--step="harness" --stage="VERIFYING"`                                        |
| Step 8 (milestone boundary)      | `--step="milestone" --stage="EXECUTING"`                                      |

The `agent-status-sync` hook already handles status writes for agent entry — these additions cover the INLINE steps that have no agent trigger.

**Verification:**

- [ ] Status bus is updated for inline steps (git setup, phase ordering, harness, milestone)
- [ ] Statusline shows progress during inline work (not just during agent calls)

### Task 1.3: Add missing transition events to agent-transition-sync

**File:** `src/hooks/scripts/agent-transition-sync.ts`

Currently the lu orchestrator mapping (lines 293-328) fires transitions for: cognition (START, PREFLIGHT_COMPLETE), discuss, plan, verify, learn. Missing:

Add to the lu orchestrator block:

- `process-data-` prefix → `PROCESS_DATA_COMPLETE` transition
- `research-graduate-` prefix → no transition needed (v2 only, informational)

NOTE: `classify-*`, `harness-*`, and `review-*` are intentionally NOT in the hook because they require LLM output parsing (complexity data, pass/fail, parallel completion). These stay as manual bridge calls in lu.skill.ts.

**Verification:**

- [ ] `process-data-*` agents trigger PROCESS_DATA_COMPLETE on completion
- [ ] No regressions in existing transition mappings
- [ ] `bunx --bun tsc --noEmit` passes

---

## Wave 2: Layer B — Enforce Agent Type Routing

**Goal:** Connect agent definitions and model routing to lu.skill.ts Agent() calls.

### Task 2.1: Map all Agent() calls to subagent_type

**File:** `src/skills/luca/lu.skill.ts`

Update every Agent() call in the skill prompt to include `subagent_type` and `model`. The mapping:

| Current Agent() name        | subagent_type                  | Model routing preset |
| --------------------------- | ------------------------------ | -------------------- |
| `cognition`                 | `lu-cognition`                 | ALWAYS_FAST          |
| `classify-{NN}`             | `lu-cognition`                 | ALWAYS_FAST          |
| `configure`                 | (new) `lu-configure`           | ROUTER               |
| `backlog`                   | `lu-phase-researcher`          | ORCHESTRATOR         |
| `discuss-{NN}`              | `lu-discuss-researcher`        | ORCHESTRATOR         |
| `research-scope-{NN}`       | (new) `lu-research-scope`      | ROUTER               |
| `research-arch-{NN}`        | `lu-architecture-researcher`   | ROUTER               |
| `research-impl-{NN}`        | `lu-implementation-researcher` | ROUTER               |
| `research-eco-{NN}`         | `lu-ecosystem-researcher`      | ROUTER               |
| `research-risk-{NN}`        | `lu-risk-researcher`           | ROUTER               |
| `research-synth-{NN}`       | `lu-research-synthesizer`      | ORCHESTRATOR         |
| `research-expand-{NN}`      | `lu-research-synthesizer`      | ORCHESTRATOR         |
| `research-graduate-{NN}`    | `lu-research-graduator`        | ORCHESTRATOR         |
| `review-accuracy-{NN}`      | `lu-accuracy-reviewer`         | DEEP_ANALYSIS        |
| `review-completeness-{NN}`  | `lu-completeness-reviewer`     | DEEP_ANALYSIS        |
| `review-actionability-{NN}` | `lu-actionability-reviewer`    | DEEP_ANALYSIS        |
| `plan-{NN}`                 | `lu-planner`                   | ORCHESTRATOR         |
| `plan-review-{NN}`          | `lu-plan-checker`              | ORCHESTRATOR         |
| `plan-revise-{NN}`          | `lu-planner`                   | ORCHESTRATOR         |
| `execute-{NN}`              | `lu-executor`                  | ORCHESTRATOR         |
| `harness-{NN}`              | (new) `lu-harness-check`       | FAST_PROMOTED        |
| `fix-{NN}`                  | `lu-executor`                  | ORCHESTRATOR         |
| `verify-{NN}`               | `lu-verifier`                  | DEEP_ANALYSIS        |
| `review-arch-{NN}`          | `code-architect`               | DEEP_ANALYSIS        |
| `review-dx-{NN}`            | `dx-advocate`                  | DEEP_ANALYSIS        |
| `review-security-{NN}`      | `security-auditor`             | DEEP_ANALYSIS        |
| `review-simplify-{NN}`      | `code-simplifier`              | DEEP_ANALYSIS        |
| `learn-{NN}`                | `lu-learner`                   | FAST_PROMOTED        |
| `process-data-{NN}`         | `lu-process-data`              | FAST_PROMOTED        |
| `plan-gaps-{NN}`            | `lu-planner`                   | ORCHESTRATOR         |
| `execute-gaps-{NN}`         | `lu-executor`                  | ORCHESTRATOR         |
| `milestone-learn`           | `lu-learner`                   | FAST_PROMOTED        |
| `milestone-prune`           | (new) `lu-milestone-prune`     | FAST_PROMOTED        |
| `milestone-shadow`          | `lu-shadow-scanner`            | FAST_PROMOTED        |
| `milestone-archive`         | `lu-learner`                   | FAST_PROMOTED        |
| `milestone-finalize`        | `lu-learner`                   | FAST_PROMOTED        |

**Pattern in skill prompt changes from:**

```
Agent(name: "execute-{NN}", prompt: EXECUTE_WAVES_PROMPT({...}))
```

**To:**

```
Agent(name: "execute-{NN}", subagent_type: "lu-executor", model: RESOLVED_MODEL, prompt: EXECUTE_WAVES_PROMPT({...}))
```

Where RESOLVED_MODEL is derived from the complexity classified in Step 2 using the MODEL_ROUTING_TABLE. The skill prompt should instruct the LLM to look up the model tier:

```
# Model Resolution (run once after Step 2)
# Use resolveModelForAgent(agentName, COMPLEXITY) from the routing table.
# COMPLEXITY was determined in Step 2. Map tiers: fast→"haiku", balanced→"sonnet", capable→"opus"
```

**Verification:**

- [ ] Every Agent() call in lu.skill.ts includes `subagent_type`
- [ ] Every Agent() call includes `model` (resolved from complexity + routing table)
- [ ] No bare `Agent(name: "...")` calls remain without subagent_type
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2.2: Create missing agent definitions

4 agent definitions need to be created. Follow the existing pattern in `src/agents/general/`:

**2.2a. `src/agents/general/lu-configure.agent.ts`**

- Purpose: Session configuration resolver
- Tools: `["Read", "Grep", "Glob"]` (read-only)
- Cognition: T1 (read-only)
- Model routing: Add `"lu-configure": ROUTER` to MODEL_ROUTING_TABLE

**2.2b. `src/agents/general/lu-research-scope.agent.ts`**

- Purpose: Research scope planner (v2 pipeline)
- Tools: `["Read", "Grep", "Glob"]` (read-only)
- Cognition: T1 → T2
- Model routing: Add `"lu-research-scope": ROUTER` to MODEL_ROUTING_TABLE

**2.2c. `src/agents/general/lu-milestone-prune.agent.ts`**

- Purpose: Milestone cleanup (prune completed/obsolete items)
- Tools: `["Read", "Write", "Edit", "Grep", "Glob"]`
- Cognition: T1
- Model routing: Add `"lu-milestone-prune": FAST_PROMOTED` to MODEL_ROUTING_TABLE

**2.2d. `src/agents/general/lu-harness-check.agent.ts`**

- Purpose: Run harness checks (tsc, test, lint, build)
- Tools: `["Read", "Bash", "Grep", "Glob"]` (no write — only checks)
- Cognition: T1
- Model routing: Add `"lu-harness-check": FAST_PROMOTED` to MODEL_ROUTING_TABLE

**Verification:**

- [ ] 4 new agent definition files exist in `src/agents/general/`
- [ ] 4 new entries added to MODEL_ROUTING_TABLE in `src/complexity/__helpers/model-routing.ts`
- [ ] Agent definitions follow existing pattern (frontmatter, sections, cognition tiers)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2.3: Update agent-transition-sync to use subagent_type

**File:** `src/hooks/scripts/agent-transition-sync.ts`

The hook currently reads `tool_input.name` for agent matching. It should ALSO check `tool_input.subagent_type` for more reliable matching (agent name includes phase suffix, but subagent_type is the clean agent identity).

Update `main()` at line 438-442:

```typescript
const agentName = toolInput?.subagent_type ?? toolInput?.name;
```

This is a one-line change that makes the hook work with both old-style (name only) and new-style (subagent_type + name) Agent() calls.

**Verification:**

- [ ] Hook reads subagent_type first, falls back to name
- [ ] Existing mappings continue to work (backward compatible)
- [ ] `bunx --bun tsc --noEmit` passes

---

## Wave 3: Layer C — Hook-Driven Pipeline Enforcement

**Goal:** Prevent the LLM from spawning agents outside the registered pipeline.

### Task 3.1: Add v2 research agent prefixes to pre-step-lu

**File:** `src/hooks/scripts/pre-step-lu.ts`

The existing enforcement hook is missing v2 research agent prefixes. Add to `agentPrefixes`:

```typescript
agentPrefixes: new Set([
  // ... existing prefixes ...
  // v2 research agents
  "research-scope-",
  "research-arch-",
  "research-impl-",
  "research-eco-",
  "research-risk-",
  "research-synth-",
  "research-expand-",
  "research-graduate-",
  // v2 research reviewers
  "review-accuracy-",
  "review-completeness-",
  "review-actionability-",
  // v2 plan review
  "plan-review-",
  "plan-revise-",
]);
```

And add corresponding `validStates` entries — all v2 research agents are valid from `executing` state:

```typescript
validStates: {
  // ... existing entries ...
  "research-scope-": new Set(["executing"]),
  "research-arch-": new Set(["executing"]),
  // ... etc for all v2 prefixes
  "plan-review-": new Set(["executing"]),
  "plan-revise-": new Set(["executing"]),
}
```

**Verification:**

- [ ] All agent prefixes from lu.skill.ts are registered in pre-step-lu
- [ ] v2 research agents are allowed from "executing" state
- [ ] No regressions for existing prefixes
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3.2: Add unregistered agent blocking (advisory mode)

**File:** `src/hooks/scripts/pre-step-lu.ts`

Currently, unmatched agents silently pass through (the enforcement hook returns `exitSuccess()` for non-matching names at line 268 of the factory). This is the gap that allows `code-developer` to be spawned.

Modify the behavior: when an Agent() call is made during an active lu session (`/tmp/lu-context.json` exists) but the agent name doesn't match ANY registered prefix, emit a **warning** via `systemMessage` (advisory mode — still exits 0, but the LLM sees the warning).

This requires a small extension to the enforcement hook factory OR a separate lightweight hook. Recommended approach: create a new hook `pre-step-lu-allowlist.ts` that runs alongside `pre-step-lu`:

```typescript
// pre-step-lu-allowlist.ts
// Advisory guard: warns when unregistered agents are spawned during lu

const REGISTERED_PREFIXES = new Set([
  "cognition",
  "classify-",
  "configure",
  "backlog",
  "discuss-",
  "plan-",
  "plan-gaps-",
  "plan-review-",
  "plan-revise-",
  "execute-",
  "execute-gaps-",
  "harness-",
  "fix-",
  "verify-",
  "review-arch-",
  "review-dx-",
  "review-security-",
  "review-simplify-",
  "learn-",
  "process-data-",
  "milestone-",
  // v2
  "research-scope-",
  "research-arch-",
  "research-impl-",
  "research-eco-",
  "research-risk-",
  "research-synth-",
  "research-expand-",
  "research-graduate-",
  "review-accuracy-",
  "review-completeness-",
  "review-actionability-",
  // route handlers
  "verify-route",
  "learn-route",
]);

// If agent name doesn't match any prefix AND lu-context.json exists:
// exitSuccess() with systemMessage warning
```

**Verification:**

- [ ] Unregistered agent names during lu session produce a warning in systemMessage
- [ ] Registered agent names pass through without warning
- [ ] Hook always exits 0 (advisory, never blocks)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3.3: Register hook in hook registry

**File:** `src/hooks/__helpers/hook-registry.ts`

Add `pre-step-lu-allowlist` to the hook registry so it's included in the build pipeline.

**Verification:**

- [ ] Hook appears in hook registry
- [ ] Hook is included in `bun run build:all` output
- [ ] `bunx --bun tsc --noEmit` passes

---

## Wave 4: Integration Verification

### Task 4.1: Type-check all changes

Run `bunx --bun tsc --noEmit` to verify no type errors across:

- lu.skill.ts modifications
- New agent definition files
- Hook modifications
- Model routing table additions

### Task 4.2: Verify hook registry consistency

Verify all hooks are registered and the complete set of agent prefixes in:

- `agent-status-sync.ts` (LU_STEP_MAP)
- `agent-transition-sync.ts` (ORCHESTRATOR_MAPPINGS → lu block)
- `pre-step-lu.ts` (agentPrefixes + validStates)
- `pre-step-lu-allowlist.ts` (REGISTERED_PREFIXES)

All four files should have consistent agent prefix coverage.

### Task 4.3: Document the architecture

Add a brief section to `src/skills/luca/lu.skill.ts` (as a code comment, not in the skill prompt) documenting:

- The three observability layers (transitions, agent types, enforcement)
- Where each layer's infrastructure lives
- How to add a new agent to the pipeline (update all 4 hook files + model routing)

---

## Dependencies

- Wave 1 is independent (can ship alone)
- Wave 2 depends on Wave 1 (agent types without transitions would be partial)
- Wave 3 depends on Wave 2 (enforcement without agent types would block legitimate calls)
- Wave 4 depends on all previous waves

## Post-Execution

After all waves complete, the user must run `bun run build:all` manually (never during Claude Code session — crashes the process). This compiles:

- Updated lu skill → `dist/claude/skills/lu/SKILL.md`
- New agent definitions → `dist/claude/agents/*.md`
- Updated hooks → `dist/claude/hooks/`
