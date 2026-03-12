---
description: "Complexity gating: model tier routing per complexity level"
globs:
  - "*.ts"
  - "*.md"
  - .planning/config.json
alwaysApply: true
---

# Complexity gating: model tier routing per complexity level

## rule

# Complexity Gating

## Five Complexity Levels

Luca classifies task complexity into five levels, grouped into three behavioral tiers:

| Level | Tier | File Count | Scope | Risk |
|-------|------|-----------|-------|------|
| TRIVIAL | Lightweight | 1 | Single component | Low |
| SIMPLE | Lightweight | 2-3 | Related components | Low-Medium |
| MODERATE | Standard | 3-5 | Feature-scoped | Medium |
| COMPLEX | Thorough | 5-10 | Cross-cutting | High |
| CRITICAL | Thorough | 10+ / architectural | System-wide | Very High |

## Always-On Steps

ALL workflow steps run at every complexity level. Complexity no longer gates step activation -- it controls **model tier** only (via the routing table below). Steps are never skipped based on complexity alone.

1. Model profile resolution
2. Cognitive pre-flight
3. Phase/environment validation
4. Research
5. Discussion
6. Plan discovery and wave grouping
7. Core execution (lu-executor)
8. Code review (all reviewers)
9. UAT
10. Result aggregation
11. Verification harness
12. lu-verifier
13. Learning capture
14. State/roadmap/requirements updates
15. Commit

## Model Routing Table

Complexity determines which model tier each agent receives. The **canonical source of truth** is \`MODEL_ROUTING_TABLE\` in \`src/complexity/__helpers/model-routing.ts\`, which uses **7 named presets** to keep the table DRY.

### Named Routing Presets

| Preset | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL | Agents |
|--------|---------|--------|----------|---------|----------|--------|
| ALWAYS_FAST | fast | fast | fast | fast | fast | lu-cognition |
| FAST_PROMOTED | fast | fast | fast | fast | balanced | lu-learner, lu-router-fast, lu-verifier-fast |
| ROUTER | fast | fast | balanced | balanced | balanced | lu-router |
| ORCHESTRATOR | fast | balanced | balanced | capable | capable | lu-executor, lu-planner, + 17 others |
| DEEP_ANALYSIS | fast | balanced | capable | capable | capable | lu-verifier, code-architect, dx-advocate, + 7 others |
| DEBUGGER_PRESET | balanced | balanced | capable | capable | capable | lu-debugger |
| ALWAYS_CAPABLE | capable | capable | capable | capable | capable | lu-executor-capable |

Model tiers map to concrete models: **fast** (haiku/lightweight), **balanced** (sonnet/standard), **capable** (opus/deep analysis). Resolve at runtime via \`resolveModelForAgent(agentName, complexity)\`. The exported \`ROUTING_PRESETS\` record provides programmatic access to all presets.

**Single source of truth:** The \`MODEL_ROUTING_TABLE\` is the only authoritative source for agent model selection. Agent frontmatter \`model_routing\` and \`model_tier\` fields are deprecated and no longer consulted by \`resolveModel()\`.

## Loop Budgets (Not Step Gating)

The following parameters cap **iteration loop depth** and **verification thoroughness**. They do NOT gate workflow steps -- all steps run at every complexity level. Configured in \`config.json\` complexity matrix.

| Parameter | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL | Used by |
|-----------|---------|--------|----------|---------|----------|---------|
| Cognitive pre-flight | Lite | Lite | Full | Full | Full | lu-cognition depth |
| Plan verification iterations | 1 | 1 | 1 | 2 | 3 | lu-plan-checker retries |
| Harness fix iterations | 1 | 2 | 2 | 2 | 3 | Loop A (mechanical fix) |
| Verify fix iterations | 1 | 1 | 1 | 1 | 2 | Loop B (semantic fix) |
| Verification mode | Quick | Quick | Standard | Full | Full+Human | lu-verifier depth |
| Recall depth | 1 | 1 | 3 | null | null | MuninnDB entry cap |

## How to Apply

**Before spawning sub-agents**, resolve their model tier from the routing table:

1. Read complexity from STATE.md \`Task Complexity:\` field
2. If not set, read from lu-router's classification output
3. Call \`resolveModelForAgent(agentName, complexity)\` to get the model tier
4. All steps run at every complexity level -- only the model tier and loop budgets vary
5. Flag-based overrides (\`--skip-review\`, \`--skip-uat\`, \`--skip-research\`) still allow explicit skipping

**Complexity is set by:**
- lu-router (automatic inference)
- \`--complexity=<level>\` flag (manual override)
- Persisted in STATE.md for session continuity

## Override Mechanisms

- \`--complexity=<level>\`: Explicit level, skips router inference
- \`--force-complex\`: Alias for \`--complexity=COMPLEX\`
- \`workflow.code_review: false\`: Skip code review regardless of complexity
- \`workflow.uat_required: false\`: Skip UAT regardless of complexity
- \`--skip-review\`, \`--skip-uat\`: Per-invocation skip flags

Config booleans and per-invocation flags take precedence over complexity gating. If \`workflow.code_review: false\`, code review is skipped even at CRITICAL level.