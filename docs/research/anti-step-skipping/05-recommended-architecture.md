# Recommended Architecture: Layered Anti-Step-Skipping

## Design Principle

Move workflow enforcement **outside the LLM's decision loop**. The LLM handles content generation within each step. Deterministic infrastructure handles step ordering, validation, and completion tracking.

## The Five Layers

```
Layer 0: DECOMPOSITION
  Reduce cognitive load per skill invocation.

Layer 1: PROGRESSIVE DISCLOSURE
  Reveal only the current step. Mandatory tool call to advance.

Layer 2: STATE MACHINE
  Per-skill state definitions. luca-bridge validates transitions.

Layer 3: HOOK ENFORCEMENT
  Pre-step hooks check DAG prerequisites. Framework-level, unbypassable.

Layer 4: EVENT-SOURCED GAP DETECTION
  Session ledger as authority. Post-execution audit. Re-execute gaps.
```

### Why Five Layers (Defense in Depth)

Each layer addresses a different failure mode:

| Layer                      | Prevents                             | Catches                    | Enforcement Type               |
| -------------------------- | ------------------------------------ | -------------------------- | ------------------------------ |
| 0 - Decomposition          | "Lost in the middle" attention decay | Within-skill step omission | Structural (smaller units)     |
| 1 - Progressive Disclosure | LLM seeing and rationalizing skips   | All visible step skipping  | Protocol (tool-gated)          |
| 2 - State Machine          | Illegal state transitions            | Between-skill skipping     | Structural (typed transitions) |
| 3 - Hook Enforcement       | Prerequisites not met                | Any skipped prerequisite   | Infrastructure (deterministic) |
| 4 - Gap Detection          | Anything layers 0-3 missed           | Post-hoc gap discovery     | Reactive (audit + re-execute)  |

## Layer 0: Decomposition

### What Changes

Break large skills into chains of focused sub-skills:

```
pr-address (817 lines, 9+ steps)
  -> pr-fetch (~100 lines)
  -> pr-validate (~150 lines)
  -> pr-debate (~100 lines, conditional)
  -> pr-fix (~150 lines)
  -> pr-learn (~80 lines)
  -> pr-respond (~120 lines)
```

### Implementation

- Each sub-skill is a new `.skill.ts` file in `src/skills/general/`
- The parent skill becomes a thin orchestrator calling `Skill()` for each sub-skill
- State passes between sub-skills via typed context objects

### Effort: 1-2 weeks (across all major skills)

### Priority Skills for Decomposition

| Skill                         | Current Size   | Steps | Skip Risk                  |
| ----------------------------- | -------------- | ----- | -------------------------- |
| `lu.skill.ts`                 | ~19,000 tokens | 11+   | HIGH                       |
| `phase-execute.skill.ts`      | ~29,000 tokens | 10+   | MEDIUM (has state machine) |
| `pr-address.skill.ts`         | 815 lines      | 9+    | HIGH                       |
| `milestone-complete.skill.ts` | ~800 lines     | 9+    | HIGH                       |
| `verify.skill.ts`             | ~800 lines     | 12    | MEDIUM                     |

## Layer 1: Progressive Disclosure

### What Changes

Instead of loading the full skill spec into context, the DAG executor reveals only the current step.

### How It Works

1. Orchestrator holds the full workflow DAG
2. For each step, sends the LLM only that step's instructions
3. Step includes a mandatory tool call: `report_step_complete(step_id, evidence)`
4. Orchestrator validates the evidence, then generates step N+1's prompt
5. LLM never sees future steps

### Implementation

Extend `src/workflow/__helpers/dag-executor.ts` with a `progressive` execution mode:

```typescript
function executeProgressively(dag: WorkflowDAG, context: StepContext) {
  for (const step of topologicalSort(dag)) {
    const prompt = generateStepPrompt(step, context);
    const result = await invokeLLM(prompt); // LLM only sees this step
    const evidence = extractEvidence(result, step.outputSchema);
    if (!evidence) throw new StepIncompleteError(step.id);
    context = mergeContext(context, evidence);
    checkpoint(dag, step.id, context);
  }
}
```

### Effort: 1-2 days

## Layer 2: State Machine

### What Changes

Each multi-step skill gets a state definition file. `luca-bridge` validates transitions.

### Schema Design

```typescript
// src/skills/__schemas/skill-states.ts

export const SkillStateDefinitionSchema = z.object({
  skill: z.string(),
  initial: z.string(),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      event: z.string(),
      guard: z.string().optional(),
      evidence_required: z.boolean().default(true),
    }),
  ),
});
```

### Per-Skill Definitions

Each skill with 3+ steps gets a state definition:

```
src/skills/__schemas/states/
  pr-address.states.ts
  phase-execute.states.ts
  milestone-complete.states.ts
  verify.states.ts
  debug.states.ts
```

### Bridge Extension

New subcommand: `luca-bridge skill-state --skill=NAME --event=EVENT --data=JSON`

- Validates transition against skill's registered state machine
- Rejects illegal transitions with clear error
- Persists state to `.planning/skill-state/{skill-name}.json`
- Provides `--explain` mode for debugging

### Effort: 3-5 days

## Layer 3: Hook Enforcement

### What Changes

Add pre-step hooks that check DAG prerequisites at the framework level.

### Hook Design

```typescript
// src/hooks/scripts/pre-step-gate.ts

const preStepGate: HookHandler = {
  trigger: "PreToolUse",
  matcher: /^(Skill|Task)\(/,
  handler: async (event) => {
    const skillState = await readSkillState(event.skillName);
    const requiredState = getPrerequisiteState(event.stepId);

    if (skillState.current !== requiredState) {
      return {
        blocked: true,
        message: `BLOCKED: Step ${event.stepId} requires state ${requiredState}, but current state is ${skillState.current}. Complete prerequisite steps first.`,
      };
    }
  },
};
```

### Integration with Existing Hooks

Luca already has:

- `pre-commit-gate` (blocks commits on typecheck failure)
- `vault-guard` (blocks misrouted MuninnDB writes)

The `pre-step-gate` follows the same pattern.

### Effort: 1-2 days

## Layer 4: Event-Sourced Gap Detection

### What Changes

Post-execution audit of `session-ledger.jsonl` against the DAG.

### How It Works

1. Each step completion is logged to the session ledger (already exists)
2. After skill execution completes, a deterministic script:
   - Reads the DAG for the skill
   - Reads the session ledger
   - Computes `expected_steps - completed_steps = gaps`
   - If gaps exist, reports them and optionally triggers re-execution

### Implementation

```typescript
// src/workflow/__helpers/gap-detector.ts

function detectGaps(dag: WorkflowDAG, ledger: LedgerEntry[]): string[] {
  const requiredSteps = dag.steps.filter((s) => !s.optional).map((s) => s.id);
  const completedSteps = ledger
    .filter((e) => e.event === "STEP_COMPLETE")
    .map((e) => e.stepId);
  return requiredSteps.filter((s) => !completedSteps.includes(s));
}
```

### Effort: 1 day

## Existing Infrastructure to Leverage

| Component           | Location                                      | Layer |
| ------------------- | --------------------------------------------- | ----- |
| DAG executor        | `src/workflow/__helpers/dag-executor.ts`      | 1, 4  |
| DAG sorter          | `src/workflow/__helpers/dag-sorter.ts`        | 1     |
| DAG validator       | `src/workflow/__helpers/dag-validator.ts`     | 2     |
| Step contracts      | `src/workflow/__schemas/contracts.schemas.ts` | 1, 2  |
| State bridge        | `luca-bridge` CLI                             | 2     |
| Session ledger      | `.planning/session-ledger.jsonl`              | 4     |
| Hook infrastructure | `src/hooks/`, `.claude/settings.json`         | 3     |
| Checkpoint schemas  | `DAGCheckpointSchema`                         | 1, 4  |
| Skill invocation    | `Skill()` tool                                | 0     |
| Agent invocation    | `Task()` tool                                 | 0     |

## Implementation Sequence

### Phase 1: Quick Wins (1-2 days)

1. **Hook enforcement** (Layer 3) -- Extend hooks with pre-step gate
2. **Gap detection** (Layer 4) -- Post-execution audit script

These layers are reactive but catch the most egregious skips immediately.

### Phase 2: Progressive Disclosure (2-3 days)

3. **Progressive executor mode** (Layer 1) -- Step-by-step prompt generation
4. **State machine for pr-address** (Layer 2) -- Pilot the pattern on one skill

### Phase 3: Full Rollout (1-2 weeks)

5. **Decompose pr-address** (Layer 0) -- Split into sub-skills
6. **State machines for remaining skills** (Layer 2)
7. **Decompose lu.skill.ts, phase-execute, milestone-complete** (Layer 0)

### Phase 4: Hardening (optional)

8. **Agent Behavioral Contracts** -- Mathematical compliance guarantees
9. **Formal properties** -- LTL specifications for critical paths

## Success Metrics

| Metric                                         | Current                  | Target |
| ---------------------------------------------- | ------------------------ | ------ |
| Steps skipped per pr-address run               | 3-4 (Steps 3, 5, 7, 7.5) | 0      |
| Learning capture rate                          | ~0% (skipped)            | 100%   |
| Verification step execution                    | ~50% (sometimes skipped) | 100%   |
| All-steps-complete probability (15-step skill) | ~20% (0.9^15)            | >99%   |

## Key Sources

- [Strands Agents: 100% accuracy with hooks](https://strandsagents.com/blog/steering-accuracy-beats-prompts-workflows/)
- [Blueprint First, Model Second](https://arxiv.org/html/2508.02721v1)
- [MASFT: +14% ceiling on prompt fixes](https://arxiv.org/html/2503.13657v1)
- [Anthropic: Effective Harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic: Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Temporal: Durable Execution](https://temporal.io/blog/of-course-you-can-build-dynamic-ai-agents-with-temporal)
- [LangGraph: Thinking in Graphs](https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph)
- [Agent Behavioral Contracts](https://arxiv.org/abs/2602.22302)
