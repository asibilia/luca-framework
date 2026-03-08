# rule-complexity-gating

Five complexity levels (TRIVIAL to CRITICAL) with model routing matrix for per-agent model selection.

## main

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

ALL workflow steps run at every complexity level. Complexity no longer gates step activation -- it controls **model tier** (via the routing table below) and **iteration counts**. Steps are never skipped based on complexity alone.

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

Complexity determines which model tier each agent category receives. The canonical routing table lives in \`src/complexity/__helpers/model-routing.ts\` (\`MODEL_ROUTING_TABLE\`). This summary shows the category-level defaults:

| Agent Category | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|----------------|---------|--------|----------|---------|----------|
| Classifiers (lu-cognition, lu-learner) | haiku | haiku | haiku | haiku | sonnet |
| Routers (lu-router, lu-router-fast) | haiku | haiku | sonnet | sonnet | sonnet |
| Orchestrators (lu-executor, lu-planner) | haiku | sonnet | sonnet | opus | opus |
| Deep analysis (lu-verifier, lu-debugger) | haiku | sonnet | opus | opus | opus |
| Reviewers (dx-advocate, code-simplifier) | haiku | sonnet | opus | opus | opus |

Model tiers map to concrete models: **haiku** (fast/lightweight), **sonnet** (balanced/standard), **opus** (capable/deep analysis). Resolve at runtime via \`resolveModelForAgent(agentName, complexity)\`.

## Iteration Count Scaling

These parameters still scale with complexity:

| Parameter | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|-----------|---------|--------|----------|---------|----------|
| Cognitive pre-flight | Lite | Lite | Full | Full | Full |
| Plan verification iterations | 1 | 1 | 1 | 2 | 3 |
| Harness fix iterations | 1 | 2 | 2 | 2 | 3 |
| Verify fix iterations | 1 | 1 | 1 | 1 | 2 |
| Verification mode | Quick | Quick | Standard | Full | Full+Human |

## How to Apply

**Before spawning sub-agents**, resolve their model tier from the routing table:

1. Read complexity from bridge: \`bun run packages/luca-framework/src/state/bridge.ts read-complexity 2>/dev/null\`
2. Fallback: Read from STATE.md \`Task Complexity:\` field
3. If not set, read from lu-router's classification output
4. Call \`resolveModelForAgent(agentName, complexity)\` to get the model tier
5. All steps run at every complexity level -- only the model tier varies
6. Flag-based overrides (\`--skip-review\`, \`--skip-uat\`, \`--skip-research\`) still allow explicit skipping

**Complexity is set by:**
- lu-router (automatic inference)
- \`--complexity=<level>\` flag (manual override)
- Persisted in state machine (state.json + STATE.md) for session continuity

## Override Mechanisms

- \`--complexity=<level>\`: Explicit level, skips router inference
- \`--force-complex\`: Alias for \`--complexity=COMPLEX\`
- \`workflow.code_review: false\`: Skip code review regardless of complexity
- \`workflow.uat_required: false\`: Skip UAT regardless of complexity
- \`--skip-review\`, \`--skip-uat\`: Per-invocation skip flags

Config booleans and per-invocation flags take precedence over complexity gating. If \`workflow.code_review: false\`, code review is skipped even at CRITICAL level.