# Complexity Matrix Reference

## Overview

<%= branding.frameworkName %> uses five complexity levels to gate workflow steps. Each level determines which optional steps activate, how many agents are spawned, iteration limits, and verification depth.

## Levels

| Level    | Files               | Scope              | Risk      | Time      | Route                    |
| -------- | ------------------- | ------------------ | --------- | --------- | ------------------------ |
| TRIVIAL  | 1                   | Single component   | Low       | < 15 min  | Direct execute           |
| SIMPLE   | 2-3                 | Related components | Low-Med   | 15-30 min | Direct execute           |
| MODERATE | 3-5                 | Feature-scoped     | Medium    | 30-60 min | Quick plan + execute     |
| COMPLEX  | 5-10                | Cross-cutting      | High      | 1-3 hours | Full pipeline            |
| CRITICAL | 10+ / architectural | System-wide        | Very High | 3+ hours  | Full pipeline + enhanced |

## Behavioral Tiers

Five levels, three effective tiers:

- **Lightweight** (TRIVIAL, SIMPLE): Skip most optional steps. Direct execution.
- **Standard** (MODERATE): Standard workflow with optional research and review.
- **Thorough** (COMPLEX, CRITICAL): Full workflow with scaling. All agents, all verification.

## Gating Matrix

| Step                   | TRIVIAL | SIMPLE | MODERATE | COMPLEX  | CRITICAL          |
| ---------------------- | ------- | ------ | -------- | -------- | ----------------- |
| Cognitive pre-flight   | Lite    | Lite   | Full     | Full     | Full              |
| Research               | Skip    | Skip   | Optional | Required | Required          |
| Discussion             | Skip    | Skip   | Optional | Run      | Required          |
| Plan verification      | 0 iter  | 0 iter | 1 iter   | 2 iter   | 3 iter            |
| Harness fix iterations | 1       | 2      | 2        | 2        | 3                 |
| Verification mode      | Quick   | Quick  | Standard | Full     | Full+Human        |
| dx-advocate            | Skip    | Skip   | Run      | Run      | Run               |
| code-simplifier        | Skip    | Skip   | Run      | Run      | Run               |
| code-architect         | Skip    | Skip   | Skip     | Run      | Run               |
| tailwind-auditor       | Skip    | Skip   | If UI    | If UI    | Run               |
| security-auditor       | Skip    | Skip   | If auth  | If auth  | Always            |
| UAT                    | Skip    | Skip   | Optional | Required | Required+Thorough |
| Learning capture       | Skip    | Brief  | Standard | Full     | Full+Debrief      |

## Always-On Steps

These always run regardless of complexity:

1. Model profile resolution
2. Phase/environment validation
3. Plan discovery and wave grouping
4. Core execution (<%= branding.commandPrefix %>-executor)
5. Result aggregation
6. Verification harness (scope scales)
7. <%= branding.commandPrefix %>-verifier (mode scales)
8. State/roadmap/requirements updates
9. Commit

## Classification Signals

### TRIVIAL

- "fix", "update", "change" single item
- No external services, no type/schema changes
- Intuition flags: none or OPPORTUNITY only

### SIMPLE

- "add", "create" small utility or component
- Related files in same module
- Clear pattern to follow

### MODERATE

- "add", "create", "implement" feature
- Multiple related files
- Intuition flags: may have CAUTION

### COMPLEX

- "design", "refactor", "migrate"
- External service integration
- Database schema changes
- Intuition flags: RISK or UNKNOWN

### CRITICAL

- "architect", "overhaul", "redesign"
- System-wide impact
- Multiple RISK/UNKNOWN flags

## Edge Cases (Always Override Upward)

- Auth/security work: MODERATE minimum
- Database schema changes: MODERATE minimum
- External API integration: COMPLEX minimum
- "Refactor" in task: Usually COMPLEX
- "Architect" or "overhaul": Usually CRITICAL

## Override Mechanisms

- `--complexity=<level>`: Explicit override, skips router
- `--force-complex`: Alias for `--complexity=COMPLEX`
- Config booleans (`workflow.code_review`, `workflow.uat_required`): Take precedence
- Per-invocation flags (`--skip-review`, `--skip-uat`): Take precedence

## Configuration

The complexity matrix lives in `.planning/config.json` under the `complexity` key:

```json
{
  "complexity": {
    "defaultLevel": "auto",
    "matrix": { ... }
  }
}
```

When `defaultLevel` is `"auto"`, <%= branding.commandPrefix %>-router infers complexity from cognitive report signals. Set to a specific level (e.g., `"MODERATE"`) to always use that level as the default.
