# Complexity gating: which workflow steps activate at which complexity level

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

| Step | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|------|---------|--------|----------|---------|----------|
| Cognitive pre-flight | Lite | Lite | Full | Full | Full |
| Research | Skip | Skip | Optional | Required | Required |
| Discussion | Skip | Skip | Optional | Run | Required |
| Plan verification | 0 iter | 0 iter | 1 iter | 2 iter | 3 iter |
| Harness fix iterations | 1 | 2 | 2 | 2 | 3 |
| Verify fix iterations | 0 | 1 | 1 | 1 | 2 |
| Verification mode | Quick | Quick | Standard | Full | Full+Human |
| Code review: dx-advocate | Skip | Skip | Run | Run | Run |
| Code review: code-simplifier | Skip | Skip | Run | Run | Run |
| Code review: code-architect | Skip | Skip | Skip | Run | Run |
| Code review: tailwind-auditor | Skip | Skip | If UI | If UI | Run |
| Code review: security-auditor | Skip | Skip | If auth | If auth | Always |
| UAT | Skip | Skip | Optional | Required | Required+Thorough |
| Learning capture | Skip | Brief | Standard | Full | Full+Debrief |

## How to Apply

**Before spawning optional sub-agents**, check the current task complexity:

1. Read complexity from STATE.md \`Task Complexity:\` field
2. If not set, read from lu-router's classification output
3. Look up the step in the matrix above
4. If the step says "Skip" for the current level, skip it
5. If the step says "Optional", skip unless the user or config explicitly enables it
6. If the step says "Run" or "Required", always execute

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