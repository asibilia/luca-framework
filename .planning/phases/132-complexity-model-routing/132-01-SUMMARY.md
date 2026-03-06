# Phase 132 Plan 01 Summary: Audit Complexity Reads & Model Routing Table

## Objective

Audit all complexity reads in `src/`, update agent model tiers, and create a centralized model routing table mapping (agent, complexity) -> model tier.

## Task 1: Complexity Reads Audit

### Categorization

All complexity reads in `src/` fall into three categories:

#### Gates a Step (skip/run decisions)

| File                                           | What It Does                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `complexity/__helpers/complexity-gate.ts`      | `isDebateComplexity()` -- gates tribunal/debate workflows to COMPLEX+                                                  |
| `complexity/__helpers/defaults.ts`             | `DEFAULT_COMPLEXITY_MATRIX` -- gates step activation (research, discussion, UAT, code review agents, learning capture) |
| `complexity/__schemas/complexity.schemas.ts`   | `ComplexityGateSchema` -- defines per-level gating config (step activations, iteration limits, verification mode)      |
| `iteration/__helpers/budget.ts`                | `createBudgetState()` -- uses `harnessFixIterations` / `verifyFixIterations` from gate to set loop budgets             |
| `iteration/__schemas/iteration.schemas.ts`     | `IterationConfigSchema` -- stores iteration limits derived from complexity                                             |
| `skills/__schemas/milestone-debate.schemas.ts` | `min_complexity` field -- gates debate activation to a minimum complexity level                                        |
| `shared/__helpers/tribunal-detector.ts`        | `isDebateComplexity()` import -- gates tribunal activation                                                             |

#### Informs Routing (model/tier selection)

| File                                             | What It Does                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `agents/__helpers/resolve-model.ts`              | `resolveModel()` -- 6-step priority chain for model selection using complexity gate's `default_model`                |
| `agents/__helpers/resolve-tier.ts`               | `resolveEffectiveTier()` -- applies `cognitionPromotions` from complexity gate to determine effective cognition tier |
| `context/__helpers/resolve-context-tier.ts`      | `resolveEffectiveContextTier()` -- applies `contextPromotions` from complexity gate for context document assembly    |
| `context/__helpers/context-assembler.ts`         | Uses complexity to determine document assembly depth                                                                 |
| `hooks/pi-extensions/__helpers/model-routing.ts` | Pi-portable model resolver: reads STATE.md complexity -> model selection                                             |
| `hooks/pi-extensions/__helpers/state-bridge.ts`  | `readComplexity()` -- reads complexity from state for Pi extensions                                                  |
| `complexity/__helpers/self-tuning.ts`            | `assessComplexityAccuracy()` / `tuneComplexityModel()` -- calibrates routing accuracy                                |
| **NEW: `complexity/__helpers/model-routing.ts`** | `resolveModelForAgent()` -- centralized (agent, complexity) -> model tier table                                      |

#### Informational (logging/display/schema)

| File                                       | What It Does                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `iteration/__schemas/metrics.schemas.ts`   | `complexity` field in metrics -- logged for cost analysis                    |
| `iteration/__helpers/metrics-collector.ts` | Passes complexity string to metrics recording                                |
| `planner/__helpers/cost-model.ts`          | Uses complexity for effort estimation                                        |
| `planner/__helpers/scoring.ts`             | Uses complexity in WSJF scoring                                              |
| `planner/__helpers/scheduler.ts`           | Uses complexity for scheduling priority                                      |
| `planner/__schemas/planner.schemas.ts`     | Defines `EffortPointSchema` mapped from complexity                           |
| `context/__helpers/hydration-snapshot.ts`  | Stores complexity in snapshot for observability                              |
| `hooks/pi-extensions/luca-complexity.ts`   | Pi extension displaying complexity in UI                                     |
| `hooks/pi-extensions/luca-state.ts`        | Displays complexity in state panel                                           |
| `agents/__schemas/agent.schemas.ts`        | Schema definitions for `model_routing`, `model_tier`, `complexity_overrides` |

### Key Insight

The existing `resolveModel()` in `src/agents/__helpers/resolve-model.ts` already implements a 6-step priority chain. The new `MODEL_ROUTING_TABLE` provides a centralized system-level lookup that complements the per-agent frontmatter overrides.

## Task 2: Agent Model Tier Updates

### Changes Made

| Agent                  | Previous `model_tier` | New `model_tier` | Rationale                                                               |
| ---------------------- | --------------------- | ---------------- | ----------------------------------------------------------------------- |
| lu-learner             | balanced              | **fast**         | Lightweight synthesizer; learning extraction doesn't need deep analysis |
| lu-router              | fast                  | **balanced**     | Classification benefits from standard reasoning at MODERATE+            |
| lu-verifier            | balanced              | **capable**      | Goal-backward verification requires deep analysis                       |
| lu-debugger            | balanced              | **capable**      | Scientific debugging requires deep analytical reasoning                 |
| lu-integration-checker | balanced              | **capable**      | Cross-phase integration verification needs thorough analysis            |

### Agents Already Correctly Assigned

- **fast**: lu-cognition
- **balanced**: lu-executor, lu-planner, lu-pm-planner (+ 16 other agents)
- **capable**: code-architect, dx-advocate, code-simplifier, security-auditor, ui, ux, code-developer, performance-auditor

## Task 3: Model Routing Table

### Created

- `src/complexity/__helpers/model-routing.ts` -- Centralized routing table with Zod schemas
- `__tests__/src/complexity/model-routing-table.test.ts` -- 15 tests, all passing

### API

- `resolveModelForAgent(agentName, complexity)` -- Returns `ModelTier` for an agent at a complexity level
- `getRoutingRow(agentName)` -- Returns the full 5-level routing row for an agent
- `MODEL_ROUTING_TABLE` -- The raw table (14 agent-specific entries)
- `DEFAULT_COMPLEXITY_TIERS` -- Fallback: TRIVIAL/SIMPLE=fast, MODERATE=balanced, COMPLEX/CRITICAL=capable
- `ModelRoutingTableSchema` / `ModelRoutingRowSchema` -- Zod validation

### Default Tier Mapping

| Complexity | Default Tier |
| ---------- | ------------ |
| TRIVIAL    | fast         |
| SIMPLE     | fast         |
| MODERATE   | balanced     |
| COMPLEX    | capable      |
| CRITICAL   | capable      |

### Exported from `src/complexity/index.ts`

## Task 4: Transition Plan

### Current State

Steps are gated via `ComplexityGateSchema` fields (research, discussion, UAT, etc.) with skip/run/required semantics. These fields are already marked `@deprecated` in the schema with notes about model routing superseding them.

### Steps That Would Transition to Model Routing

1. **Code review agents list** (`codeReviewAgents` field): Currently a static list per complexity. Could transition to: all review agents always run, but at appropriate model tiers via the routing table.

2. **Research step** (`research` field): Currently skip/optional/required. Could transition to: always run the research agent, but at `fast` for TRIVIAL/SIMPLE (effectively a no-op) and `capable` for COMPLEX/CRITICAL.

3. **Discussion step** (`discussion` field): Same pattern as research.

4. **UAT step** (`uat` field): Currently skip/optional/required. Less suited for model routing -- this gates human involvement, not AI model selection.

5. **Learning capture** (`learningCapture` field): Currently skip/brief/standard/full. Could partially transition: lu-learner always runs, but at different model tiers (already reflected in the routing table).

### Recommended Approach

**Phase 1 (This phase)**: Table exists, schemas exported, tests pass. No behavioral changes yet.

**Phase 2 (Future)**: Wire `resolveModelForAgent()` into the existing `resolveModel()` priority chain as an additional fallback between steps 3 (model_tier) and 4 (purpose default). This gives the routing table authority when an agent doesn't have explicit `model_routing.complexity_overrides`.

**Phase 3 (Future)**: Remove deprecated step activation fields from `ComplexityGateSchema` after confirming all consumers use model routing instead.

## Files Changed

- `src/agents/general/lu-learner.agent.ts` -- model_tier: balanced -> fast
- `src/agents/general/lu-router.agent.ts` -- model_tier: fast -> balanced
- `src/agents/general/lu-verifier.agent.ts` -- model_tier: balanced -> capable
- `src/agents/general/lu-debugger.agent.ts` -- model_tier: balanced -> capable
- `src/agents/general/lu-integration-checker.agent.ts` -- model_tier: balanced -> capable
- `src/complexity/__helpers/model-routing.ts` -- **NEW** model routing table
- `src/complexity/index.ts` -- Added model routing exports
- `__tests__/src/complexity/model-routing-table.test.ts` -- **NEW** 15 tests

## Verification

- `bunx --bun tsc --noEmit`: 0 new errors (pre-existing errors in interop-scanner.ts unchanged)
- `bun test __tests__/src/complexity/`: 90 tests pass, 0 fail
