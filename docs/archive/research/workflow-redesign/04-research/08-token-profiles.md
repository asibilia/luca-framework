# Research: Token Profiles Over Complexity Gating (Learning 8)

> **Learning:** GSD2 coordinates model selection, phase depth, and context compression into three profiles (budget/balanced/quality). The budget profile skips research and validation, saving 40-60%. The quality profile runs everything.
>
> **Cross-references:** Learning 6 (deterministic classification), Learning 7 (ceremony audit), Learning 9 (structured state)

## Problem Statement

Luca currently uses **complexity gating** as the primary control axis:

1. Task complexity (TRIVIAL through CRITICAL) is classified per-phase
2. Complexity determines model tier via `MODEL_ROUTING_TABLE`
3. Complexity determines loop budgets via `complexity.matrix` in config.json
4. Complexity determines verification depth

**The issue:** Complexity answers "how hard is this task?" but not "how much rigor does the user want?" A MODERATE task during rapid prototyping should behave differently from a MODERATE task during a production release. The user's intent (speed vs. quality) is orthogonal to the task's intrinsic complexity.

GSD2 solves this by separating the two axes: complexity remains an input signal, but the **token profile** (budget/balanced/quality) determines how the system responds to that complexity.

## Current Control Mechanisms in Luca

### From config.json

```json
{
  "model_profile": "balanced",           // <-- exists but underutilized
  "complexity": {
    "defaultLevel": "auto",
    "matrix": {
      "TRIVIAL": { ... },
      "MODERATE": { ... },
      "CRITICAL": { ... }
    }
  }
}
```

The `model_profile` field exists in config.json but is currently unused by the orchestrator. It is a vestige of an earlier design.

### From model-routing.ts

Seven named presets (ALWAYS_FAST, FAST_PROMOTED, ROUTER, ORCHESTRATOR, DEEP_ANALYSIS, DEBUGGER_PRESET, ALWAYS_CAPABLE) map agent roles to model tiers per complexity level. The presets are fixed -- they do not vary by user intent.

### From the complexity matrix

Loop budgets (harness fix iterations, plan verification iterations, verify fix iterations) scale with complexity level. These are currently the only "depth" controls.

## Proposed Token Profiles

Three profiles that control what the system does, independent of how complex the task is.

### Profile: `budget`

**Intent:** Ship fast with minimal ceremony. Prototyping, spike work, quick fixes.

| Dimension               | Setting                                               | Rationale                                                                               |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Model tier override** | All agents use `fast` except executor (`balanced`)    | Minimize token spend. Executor needs enough capability to write code.                   |
| **v2 research**         | Skipped entirely                                      | Research adds ~13 agents. Not worth it for speed-focused work.                          |
| **Code review**         | Skipped                                               | No reviewers spawned. Pre-commit hooks (tsc) still catch mechanical errors.             |
| **Discussion**          | Skipped                                               | Plan directly from task description.                                                    |
| **Verification**        | Harness only (tsc + test). No goal-backward verifier. | Mechanical checks catch real errors. Semantic verification is ceremony for budget work. |
| **Learning**            | Mechanical only (structured JSON append)              | No LLM learning call. Milestone-boundary learning still runs.                           |
| **Loop budgets**        | 1 iteration for everything                            | No retries. If it fails, park and move on.                                              |
| **Context depth**       | Minimal inlining. Only PLAN.md + task description.    | Reduce prompt size for faster agent execution.                                          |
| **Recall depth**        | 0-1 MuninnDB entries                                  | Skip deep recall. Brain tree only.                                                      |

**Estimated savings vs. balanced:** 50-70% token reduction per phase.

### Profile: `balanced`

**Intent:** Default production work. Good quality with reasonable cost.

| Dimension               | Setting                                                                  | Rationale                                                                 |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Model tier override** | Use existing `MODEL_ROUTING_TABLE` as-is, indexed by complexity          | Current behavior. Proven.                                                 |
| **v2 research**         | 2 researchers (architecture + implementation). No review loop.           | Focused research without ceremony. Skip ecosystem/risk for balanced work. |
| **Code review**         | 2 consolidated reviewers (structure + safety, per Merge 3 in Learning 7) | Covers both perspectives with half the calls.                             |
| **Discussion**          | Merged into planning (per Merge 2 in Learning 7)                         | Discussion context becomes a planning prompt section.                     |
| **Verification**        | Harness + goal-backward verifier                                         | Full mechanical + semantic verification.                                  |
| **Learning**            | Mechanical per-phase, LLM at milestone                                   | Structured capture during work, synthesis at boundary.                    |
| **Loop budgets**        | From complexity matrix (current behavior)                                | No change from current system.                                            |
| **Context depth**       | Standard inlining. PLAN.md + relevant source files + research findings.  | Current behavior.                                                         |
| **Recall depth**        | From complexity matrix (1-3 entries)                                     | Current behavior.                                                         |

**Token cost:** Baseline. This is what current Luca costs minus the ceremony reductions from Learning 7.

### Profile: `quality`

**Intent:** Production releases, critical infrastructure, high-stakes changes.

| Dimension               | Setting                                                                                                                   | Rationale                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Model tier override** | Promote all agents one tier up from MODEL_ROUTING_TABLE. ORCHESTRATOR agents get `capable`. FAST_PROMOTED get `balanced`. | Higher capability across the board.                          |
| **v2 research**         | Full pipeline: 4 researchers + review loop (up to 2 iterations) + graduation                                              | Maximum research depth for informed execution.               |
| **Code review**         | Full 4 reviewers (architecture, DX, security, simplifier)                                                                 | Maximum review coverage.                                     |
| **Discussion**          | Separate discussion agent (not merged into planning)                                                                      | Dedicated context for user decisions and constraints.        |
| **Verification**        | Harness + goal-backward verifier + human review gate at COMPLEX+                                                          | Full pipeline plus human-in-the-loop for critical decisions. |
| **Learning**            | Full LLM learning per-phase + milestone                                                                                   | Capture nuanced learnings at every boundary.                 |
| **Loop budgets**        | Double the complexity matrix values (up to cap)                                                                           | More retry budget for hard problems.                         |
| **Context depth**       | Deep inlining. PLAN.md + source files + research + related phase summaries + recalled engrams.                            | Maximum context for best output quality.                     |
| **Recall depth**        | Unlimited MuninnDB entries                                                                                                | Full semantic recall.                                        |

**Estimated cost vs. balanced:** 40-80% more tokens per phase.

## Profile-to-Dimension Control Matrix

| Dimension                    | budget                    | balanced                   | quality                    |
| ---------------------------- | ------------------------- | -------------------------- | -------------------------- |
| Model tier                   | override to fast+balanced | from routing table         | promote one tier           |
| v2 research                  | skip                      | 2 researchers, no review   | full pipeline              |
| Code review                  | skip                      | 2 consolidated             | 4 separate                 |
| Discussion                   | skip                      | merged into planning       | separate agent             |
| Verification depth           | harness only              | harness + verifier         | harness + verifier + human |
| Learning depth               | mechanical                | mechanical + milestone LLM | full LLM per-phase         |
| Harness fix iterations       | 1                         | from matrix                | 2x matrix                  |
| Plan verification iterations | 0                         | from matrix                | 2x matrix                  |
| Verify fix iterations        | 0                         | from matrix                | 2x matrix                  |
| Context inlining             | minimal                   | standard                   | deep                       |
| Recall depth                 | 0-1                       | from matrix                | unlimited                  |

## Interaction with Existing Model Routing Presets

The token profile does NOT replace the routing presets. Instead, it applies a **modifier** on top of them.

### Profile modifier logic

```
function resolveModelForAgentWithProfile(
  agentName: string,
  complexity: ComplexityLevel,
  profile: TokenProfile
): ModelTier {
  // Base: existing routing table lookup
  const baseTier = resolveModelForAgent(agentName, complexity)

  switch (profile) {
    case "budget":
      // Override: demote all to fast, except executor which stays balanced minimum
      if (agentName === "lu-executor") return demoteMax(baseTier, "balanced")
      return "fast"

    case "balanced":
      // No modification -- use routing table as-is
      return baseTier

    case "quality":
      // Promote one tier: fast->balanced, balanced->capable, capable->capable
      return promoteTier(baseTier)
  }
}
```

### Preset interaction table

| Preset         | budget modifier                    | balanced modifier          | quality modifier                 |
| -------------- | ---------------------------------- | -------------------------- | -------------------------------- |
| ALWAYS_FAST    | fast (no change)                   | fast (no change)           | balanced (promoted)              |
| FAST_PROMOTED  | fast (demoted)                     | per-complexity (no change) | promoted one tier                |
| ROUTER         | fast (demoted)                     | per-complexity (no change) | promoted one tier                |
| ORCHESTRATOR   | fast/balanced (executor exception) | per-complexity (no change) | promoted one tier                |
| DEEP_ANALYSIS  | fast (demoted)                     | per-complexity (no change) | capable (most already capable)   |
| ALWAYS_CAPABLE | fast (demoted)                     | capable (no change)        | capable (no change, already max) |

**Key insight:** The budget profile is aggressive. By forcing most agents to `fast`, it trades output quality for speed. The executor exception (minimum `balanced`) ensures code generation quality is maintained even in budget mode.

## Migration Path from Complexity Gating

### Phase 1: Add profile field to config and state

1. Add `token_profile` to `config.json` (alongside existing `model_profile`)
2. Add `token_profile` to `WorkflowContext` (state machine context)
3. Add `--profile=budget|balanced|quality` CLI flag
4. Default: `balanced` (matches current behavior exactly)

### Phase 2: Wire profiles into orchestrator

1. Modify `resolveModelForAgent()` to accept a profile parameter
2. The orchestrator reads the profile from state and passes it to all model resolution calls
3. Add profile-based skip logic for discussion, review, research (conditional checks in lu.skill.ts)
4. Add profile-based loop budget multipliers

### Phase 3: Complexity becomes an input to profiles (not a controller)

1. Complexity classification (now deterministic per Learning 6) produces a complexity level
2. The complexity level indexes into the routing table (unchanged)
3. The profile applies its modifier on top (new)
4. Loop budgets come from `matrix[complexity] * profileMultiplier` (new)

### Phase 4: Deprecate complexity-as-controller semantics

1. Remove per-phase re-classification (already eliminated per Learning 7 Merge 1)
2. Simplify the `complexity.matrix` to only store base values
3. Profile multipliers stored in a new `profiles` section of config.json

### Proposed config.json schema

```json
{
  "token_profile": "balanced",
  "profiles": {
    "budget": {
      "model_modifier": "demote",
      "skip_research": true,
      "skip_review": true,
      "skip_discussion": true,
      "verification_depth": "harness",
      "learning_depth": "mechanical",
      "loop_multiplier": 0.5,
      "context_depth": "minimal",
      "recall_depth": 1
    },
    "balanced": {
      "model_modifier": "none",
      "skip_research": false,
      "skip_review": false,
      "skip_discussion": false,
      "verification_depth": "standard",
      "learning_depth": "milestone",
      "loop_multiplier": 1.0,
      "context_depth": "standard",
      "recall_depth": null
    },
    "quality": {
      "model_modifier": "promote",
      "skip_research": false,
      "skip_review": false,
      "skip_discussion": false,
      "verification_depth": "full",
      "learning_depth": "full",
      "loop_multiplier": 2.0,
      "context_depth": "deep",
      "recall_depth": null
    }
  }
}
```

## Constraints from Claude Code Runtime

1. **No cost tracking API.** Claude Code does not expose token counts or cost per agent call. We cannot measure actual savings from profile changes at runtime. Estimated savings are based on agent call count reduction and model tier changes.

2. **Model selection is per-agent.** The `model` parameter on Agent() calls determines the model. Profile modifiers apply at this resolution point. This is a clean integration -- no additional API needed.

3. **No session-level model override.** We cannot set a session-wide model tier. Every Agent() call must specify its model individually. This means the profile modifier logic runs for every agent spawn, which is correct but requires the profile to be accessible to the orchestrator at all times.

4. **Agent skip decisions are prompt-level.** When the profile says "skip code review," the orchestrator (lu.skill.ts prompt) must conditionally not emit the Agent() calls. This is straightforward in the compiled skill prompt -- it's just an if-check.

## Interaction with Other Learnings

- **Learning 6 (Deterministic Classification):** Classification becomes an input signal that profiles modify. With heuristic classification, the complexity level is available instantly (no LLM call), and the profile modifier applies on top. This is the intended interaction.

- **Learning 7 (Ceremony Audit):** Profiles and ceremony reduction are complementary. Learning 7 eliminates agents that never produce value (process-data as LLM, classify per-phase). Profiles control agents that produce value conditionally (research, review). Together, budget profile + ceremony reduction could cut agents from 12 to 4 per phase.

- **Learning 9 (Structured State):** The profile field lives in `state.json`. Profile-based skip decisions are recorded in structured state for crash recovery. "Phase 3 was running at balanced profile" is recoverable state.

- **Learning 10 (Crash Recovery):** Profile is pipeline context. On crash recovery, the profile determines which steps need to re-run. A budget-profile crash recovery skips review and research re-execution.

## Risks and Tradeoffs

### Risk: Budget profile misses real issues

**Scenario:** Budget mode skips code review. A security vulnerability ships.
**Mitigation:** Pre-commit hooks (tsc, test) still run. Harness catches mechanical errors. Budget mode is explicitly for prototyping -- production work should use balanced or quality.
**Decision:** Accept. The user explicitly opts into budget mode knowing the tradeoffs.

### Risk: Profile proliferation

**Scenario:** Users want custom profiles (e.g., "balanced but skip research").
**Mitigation:** Start with three fixed profiles. Add per-dimension CLI overrides (`--skip-review`, `--skip-research`) that work independently of profiles. Don't add more profile names.
**Decision:** Three profiles + per-dimension flags covers all realistic use cases.

### Risk: Complexity becomes meaningless

**Scenario:** If profiles control everything, what does complexity do?
**Answer:** Complexity remains the input signal for model tier selection within a profile. A CRITICAL task at balanced profile gets opus for deep analysis agents. A TRIVIAL task at quality profile still uses fast for classifiers. The two axes are orthogonal: complexity = intrinsic difficulty, profile = desired rigor.

### Risk: Breaking existing complexity matrix config

**Scenario:** Users who have customized their complexity matrix lose their customizations.
**Mitigation:** Phase 1-2 are additive -- complexity matrix continues working exactly as before. Profile modifiers are applied on top, not as replacements. Custom matrix values are preserved. The profile multiplier scales them.

## Recommendation

Adopt three-profile system. Start with Phase 1 (config field + CLI flag) as the simplest increment. The `balanced` profile matches current behavior exactly, so this is a no-regression change. Budget and quality profiles are opt-in via CLI flag.

The highest immediate value is the budget profile for spike work and prototyping. Currently, `/lu` applies the same ceremony to a quick spike as to a production feature. Budget profile would let users run `/lu --profile=budget "add a debug endpoint"` and get execution + harness only, finishing in a fraction of the time.
