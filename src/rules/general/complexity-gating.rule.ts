/**
 * Complexity gating: which workflow steps activate at which complexity level
 */
import { createRule } from "~/rules/__helpers/create-rule";
import type { RuleConfig } from "~/rules/__schemas/rule.schemas";

const complexityGatingConfig: RuleConfig = {
  frontmatter: {
    description:
      "Complexity gating: which workflow steps activate at which complexity level",
    globs: ["*.ts", "*.md", ".planning/config.json"],
    alwaysApply: true,
  },
  sections: [
    {
      title: "rule",
      content: `# Complexity Gating

## Five Complexity Levels

Luca classifies task complexity into five levels, grouped into three behavioral tiers:

| Level | Tier | File Count | Scope | Risk |
|-------|------|-----------|-------|------|
| TRIVIAL | Lightweight | 1 | Single component | Low |
| SIMPLE | Lightweight | 2-3 | Related components | Low-Medium |
| MODERATE | Standard | 3-5 | Feature-scoped | Medium |
| COMPLEX | Thorough | 5-10 | Cross-cutting | High |
| CRITICAL | Thorough | 10+ / architectural | System-wide | Very High |

## Always-On Steps (Cannot Be Gated)

These steps run regardless of complexity:

1. Model profile resolution
2. Phase/environment validation
3. Plan discovery and wave grouping
4. Core execution (lu-executor)
5. Result aggregation
6. Verification harness (scope scales, always runs)
7. lu-verifier (mode scales, always invoked)
8. State/roadmap/requirements updates
9. Commit

## Complexity Matrix

All workflow steps now always run. Complexity controls **model tier** (via the routing table) and **iteration counts**, not step activation. Steps are never skipped based on complexity alone.

| Step | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|------|---------|--------|----------|---------|----------|
| Cognitive pre-flight | Lite | Lite | Full | Full | Full |
| Research | Run (fast) | Run (balanced) | Run (balanced) | Run (capable) | Run (capable) |
| Discussion | Run (fast) | Run (balanced) | Run (balanced) | Run (capable) | Run (capable) |
| Plan verification | 1 iter | 1 iter | 1 iter | 2 iter | 3 iter |
| Harness fix iterations | 1 | 2 | 2 | 2 | 3 |
| Verify fix iterations | 1 | 1 | 1 | 1 | 2 |
| Verification mode | Quick | Quick | Standard | Full | Full+Human |
| Code review: all reviewers | Run (fast) | Run (balanced) | Run (capable) | Run (capable) | Run (capable) |
| UAT | Run (quick) | Run (quick) | Run (standard) | Run (full) | Run (full+human) |
| Learning capture | Standard (fast) | Standard (fast) | Standard (fast) | Full (fast) | Full+Debrief (balanced) |

Model tiers in parentheses are resolved from \\\`MODEL_ROUTING_TABLE\\\` in \\\`src/complexity/__helpers/model-routing.ts\\\` via \\\`resolveModelForAgent(agentName, complexity)\\\`.

## How to Apply

**Before spawning sub-agents**, resolve their model tier from the routing table:

1. Read complexity from STATE.md \\\`Task Complexity:\\\` field
2. If not set, read from lu-router's classification output
3. Call \\\`resolveModelForAgent(agentName, complexity)\\\` to get the model tier
4. All steps run at every complexity level — only the model tier varies
5. Flag-based overrides (\\\`--skip-review\\\`, \\\`--skip-uat\\\`, \\\`--skip-research\\\`) still allow explicit skipping

**Complexity is set by:**
- lu-router (automatic inference)
- \\\`--complexity=<level>\\\` flag (manual override)
- Persisted in STATE.md for session continuity

## Override Mechanisms

- \\\`--complexity=<level>\\\`: Explicit level, skips router inference
- \\\`--force-complex\\\`: Alias for \\\`--complexity=COMPLEX\\\`
- \\\`workflow.code_review: false\\\`: Skip code review regardless of complexity
- \\\`workflow.uat_required: false\\\`: Skip UAT regardless of complexity
- \\\`--skip-review\\\`, \\\`--skip-uat\\\`: Per-invocation skip flags

Config booleans and per-invocation flags take precedence over complexity gating. If \\\`workflow.code_review: false\\\`, code review is skipped even at CRITICAL level.`,
      order: 1,
    },
  ],
};

export const complexityGatingRule = createRule(complexityGatingConfig);
