---
plan: 16-04
title: Agent Context Wiring
status: complete
---

# Plan 16-04 Summary: Agent Context Wiring

## Changes Made

### Task 1: Added `context` metadata to all 27 agent `.agent.ts` files

Added a `context` configuration block to each agent's `frontmatter` object, placed after the existing `cognition` block. Each block contains `default_tier`, `promotable_to`, and `isolation` fields.

**Core Workflow Agents (no isolation):**

| Agent                 | Path     | default_tier | promotable_to | isolation |
| --------------------- | -------- | ------------ | ------------- | --------- |
| lu-executor           | general/ | T2           | T3            | none      |
| lu-executor           | luca/    | T2           | T3            | none      |
| lu-planner            | general/ | T1           | T2            | none      |
| lu-planner            | luca/    | T1           | T2            | none      |
| lu-cognition          | general/ | T3           | T3            | none      |
| lu-debugger           | general/ | T2           | T3            | none      |
| lu-learner            | general/ | T1           | T2            | none      |
| lu-router             | general/ | T0           | T1            | none      |
| lu-plan-checker       | general/ | T1           | T2            | none      |
| lu-phase-researcher   | general/ | T1           | T1            | none      |
| lu-pr-reviewer        | general/ | T0           | T1            | none      |
| lu-project-researcher | general/ | T0           | T1            | none      |
| lu-roadmapper         | general/ | T0           | T1            | none      |
| code-developer        | general/ | T0           | T1            | none      |

**Cold Isolation Agents (5):**

| Agent               | Path     | default_tier | promotable_to | isolation |
| ------------------- | -------- | ------------ | ------------- | --------- |
| dx-advocate         | general/ | T0           | T0            | cold      |
| code-simplifier     | general/ | T0           | T0            | cold      |
| code-architect      | general/ | T0           | T1            | cold      |
| security-auditor    | general/ | T0           | T1            | cold      |
| performance-auditor | general/ | T0           | T1            | cold      |

**Warm Isolation Agent (1):**

| Agent       | Path     | default_tier | promotable_to | isolation |
| ----------- | -------- | ------------ | ------------- | --------- |
| lu-verifier | general/ | T1           | T2            | warm      |

**Stateless Utility Agents (7, all T0/T0/none):**

| Agent                   | Path     | default_tier | promotable_to | isolation |
| ----------------------- | -------- | ------------ | ------------- | --------- |
| lu-research-synthesizer | general/ | T0           | T0            | none      |
| lu-integration-checker  | general/ | T0           | T0            | none      |
| lu-codebase-mapper      | general/ | T0           | T0            | none      |
| product                 | general/ | T0           | T0            | none      |
| qa-plan-generator       | general/ | T0           | T0            | none      |
| ui                      | general/ | T0           | T0            | none      |
| ux                      | general/ | T0           | T0            | none      |

### Task 2: Added `<context_isolation>` sections to 5 cold-isolation agents

Inserted a `<context_isolation>` XML section into the `sections[0].content` template literal of each cold-isolation agent, placed after the opening role description and before the "When invoked" checklist. The section documents:

- What the agent receives (git diff, BRAIN.md summary)
- What the agent does NOT receive (STATE.md, WORKING.md, MEMORY.md, agent summaries)
- Why cold isolation exists (fresh perspective, unbiased review)

Files modified:

- `src/agents/general/dx-advocate.agent.ts`
- `src/agents/general/code-simplifier.agent.ts`
- `src/agents/general/code-architect.agent.ts`
- `src/agents/general/security-auditor.agent.ts`
- `src/agents/general/performance-auditor.agent.ts`

### Task 3: Added `<context_isolation>` section to lu-verifier (warm isolation)

Inserted a `<context_isolation>` XML section into lu-verifier's content, placed after the existing `</cognition_integration>` tag and before the `<always_verify>` section. The section documents:

- What the agent receives (plan contents, BRAIN.md, STATE.md, selective MEMORY.md at T2+)
- What the agent does NOT receive (WORKING.md, full MEMORY.md at T1)
- Why warm isolation exists (verify plan goals, not executor approach)

File modified:

- `src/agents/general/lu-verifier.agent.ts`

### Task 4: Verification

**Context field count:** `grep -r "context: {" src/agents/**/*.agent.ts` found 27 occurrences across 27 files -- all agents wired.

**Context isolation count:** `grep -r "context_isolation" src/agents/**/*.agent.ts` found 12 occurrences across 6 files (5 cold + 1 warm, 2 tags each).

**TypeScript check:** `bunx --bun tsc --noEmit` completed. All reported errors are pre-existing in test files, adapters, commands, and scripts unrelated to this plan. No new errors were introduced by the context wiring changes.

**Build:** `bun run build:all` completed successfully. Generated 25 agents (x2 formats = 50 agent files), plus skills, rules, and hooks. All compiled `.md` agent files contain:

- `context:` YAML block in frontmatter (25/25 Claude agents, 25/25 Cursor agents)
- `<context_isolation>` sections in the 6 agents that have isolation (5 cold + 1 warm)

## Deviations from Plan

None. All 27 agents received context metadata matching the tier table in 16-RESEARCH.md, all 5 cold-isolation agents received the cold template, and lu-verifier received the warm template. The `AgentConfig` type and Zod schema already supported the `context` field from Plans 16-01 and 16-02.

## Files Modified (27 source files)

- `src/agents/general/lu-executor.agent.ts`
- `src/agents/general/lu-planner.agent.ts`
- `src/agents/general/lu-cognition.agent.ts`
- `src/agents/general/lu-debugger.agent.ts`
- `src/agents/general/lu-learner.agent.ts`
- `src/agents/general/lu-router.agent.ts`
- `src/agents/general/lu-plan-checker.agent.ts`
- `src/agents/general/lu-phase-researcher.agent.ts`
- `src/agents/general/lu-pr-reviewer.agent.ts`
- `src/agents/general/lu-project-researcher.agent.ts`
- `src/agents/general/lu-roadmapper.agent.ts`
- `src/agents/general/code-developer.agent.ts`
- `src/agents/general/lu-research-synthesizer.agent.ts`
- `src/agents/general/lu-integration-checker.agent.ts`
- `src/agents/general/lu-codebase-mapper.agent.ts`
- `src/agents/general/product.agent.ts`
- `src/agents/general/qa-plan-generator.agent.ts`
- `src/agents/general/ui.agent.ts`
- `src/agents/general/ux.agent.ts`
- `src/agents/general/dx-advocate.agent.ts`
- `src/agents/general/code-simplifier.agent.ts`
- `src/agents/general/code-architect.agent.ts`
- `src/agents/general/security-auditor.agent.ts`
- `src/agents/general/performance-auditor.agent.ts`
- `src/agents/general/lu-verifier.agent.ts`
- `src/agents/luca/lu-executor.agent.ts`
- `src/agents/luca/lu-planner.agent.ts`
