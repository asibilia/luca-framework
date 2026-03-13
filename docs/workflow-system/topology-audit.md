# Topology Audit

Comparison of the hardcoded topology in `packages/luca-observer/lib/workflow-topology.ts` against the actual agents, skills, and workflow rules in the framework.

## Summary

The topology has **3 critical accuracy issues**:

1. **Complexity gating is wrong** — topology hides agents by complexity, but the actual workflow runs all agents at all levels (complexity only controls model tier)
2. **19 agents missing** — only 20 of 38 agents from `src/agents/` are represented
3. **Skills completely absent** — 51 skills exist but zero appear in the topology; skills are the actual orchestration layer

## Agents in Topology vs Source

### Present in Both (20 agents)

| Agent                 | Stage    | File                                                |
| --------------------- | -------- | --------------------------------------------------- |
| lu-cognition          | classify | `src/agents/general/lu-cognition.agent.ts`          |
| lu-router             | classify | `src/agents/general/lu-router.agent.ts`             |
| lu-router-fast        | classify | `src/agents/general/lu-router-fast.agent.ts`        |
| lu-discuss-researcher | discuss  | `src/agents/general/lu-discuss-researcher.agent.ts` |
| lu-premortem          | discuss  | `src/agents/luca/lu-premortem.agent.ts`             |
| lu-planner            | plan     | `src/agents/luca/lu-planner.agent.ts`               |
| lu-plan-checker       | plan     | `src/agents/general/lu-plan-checker.agent.ts`       |
| lu-phase-researcher   | plan     | `src/agents/general/lu-phase-researcher.agent.ts`   |
| lu-executor           | execute  | `src/agents/luca/lu-executor.agent.ts`              |
| lu-executor-capable   | execute  | `src/agents/general/lu-executor-capable.agent.ts`   |
| lu-test-writer        | execute  | `src/agents/general/lu-test-writer.agent.ts`        |
| lu-verifier           | verify   | `src/agents/general/lu-verifier.agent.ts`           |
| lu-verifier-fast      | verify   | `src/agents/general/lu-verifier-fast.agent.ts`      |
| code-architect        | verify   | `src/agents/general/code-architect.agent.ts`        |
| security-auditor      | verify   | `src/agents/general/security-auditor.agent.ts`      |
| dx-advocate           | verify   | `src/agents/general/dx-advocate.agent.ts`           |
| performance-auditor   | verify   | `src/agents/general/performance-auditor.agent.ts`   |
| code-simplifier       | verify   | `src/agents/general/code-simplifier.agent.ts`       |
| lu-learner            | learn    | `src/agents/general/lu-learner.agent.ts`            |

Plus 1 gate node (`complexity-gate`) which is not a real agent file.

### Missing from Topology (19 agents)

| Agent                   | File                                       | Suggested Stage | Notes                                                 |
| ----------------------- | ------------------------------------------ | --------------- | ----------------------------------------------------- |
| code-developer          | `general/code-developer.agent.ts`          | execute         | Implementation partner, used after architect approval |
| lu-debugger             | `general/lu-debugger.agent.ts`             | execute         | Bug investigation with scientific method              |
| lu-integration-checker  | `general/lu-integration-checker.agent.ts`  | verify          | Cross-phase integration and E2E flow checks           |
| lu-codebase-mapper      | `general/lu-codebase-mapper.agent.ts`      | plan            | Codebase exploration and analysis                     |
| lu-pm-planner           | `general/lu-pm-planner.agent.ts`           | plan            | Sprint planning with WSJF scoring                     |
| lu-pr-reviewer          | `general/lu-pr-reviewer.agent.ts`          | verify          | PR comment review coordination                        |
| lu-project-researcher   | `general/lu-project-researcher.agent.ts`   | plan            | Domain ecosystem research                             |
| lu-repo-architect       | `general/lu-repo-architect.agent.ts`       | verify          | Repository structure auditing                         |
| lu-research-synthesizer | `general/lu-research-synthesizer.agent.ts` | plan            | Synthesizes parallel research outputs                 |
| lu-roadmap-architect    | `general/lu-roadmap-architect.agent.ts`    | plan            | Architectural impact analysis for roadmap             |
| lu-roadmap-prioritizer  | `general/lu-roadmap-prioritizer.agent.ts`  | plan            | WSJF scoring for roadmap revision                     |
| lu-roadmap-qa           | `general/lu-roadmap-qa.agent.ts`           | verify          | Testing gap analysis for roadmap                      |
| lu-roadmap-synthesizer  | `general/lu-roadmap-synthesizer.agent.ts`  | plan            | Merges specialist analyses into roadmap               |
| lu-roadmapper           | `general/lu-roadmapper.agent.ts`           | plan            | Creates project roadmaps                              |
| lu-process-data         | `luca/lu-process-data.agent.ts`            | learn           | Computes process metrics                              |
| product                 | `general/product.agent.ts`                 | discuss         | Feature request analysis and scoping                  |
| qa-plan-generator       | `general/qa-plan-generator.agent.ts`       | verify          | QA testing plan generation                            |
| ui                      | `general/ui.agent.ts`                      | verify          | Visual design and styling review                      |
| ux                      | `general/ux.agent.ts`                      | verify          | User flow and accessibility review                    |

### Agent Stage Assignment Notes

The "suggested stage" above is inferred from agent descriptions and model routing presets. In the actual workflow, many agents can be invoked from multiple stages (e.g., `lu-debugger` can run during execute or as a standalone `/debug` workflow). A proper workflow config would need to support agents appearing in multiple contexts.

## Skills (Completely Missing)

The topology has zero skill nodes. Skills are the **orchestration layer** — they invoke agents, not the reverse. 51 skills exist in `src/skills/`.

### Core Pipeline Skills (should be in topology)

| Skill          | Stage   | Role                                      |
| -------------- | ------- | ----------------------------------------- |
| lu             | entry   | Unified entry point, routes to sub-skills |
| phase-discuss  | discuss | Orchestrates discussion phase             |
| phase-plan     | plan    | Orchestrates planning phase               |
| phase-execute  | execute | Orchestrates execution, spawns agents     |
| phase-research | plan    | Pre-planning research                     |
| verify         | verify  | Ad-hoc verification                       |
| autopilot      | meta    | Autonomous multi-phase orchestrator       |
| debug          | meta    | Debug workflow entry point                |
| quick          | meta    | Quick task handler                        |

### Support Skills (may not need topology nodes)

| Skill                                          | Category           |
| ---------------------------------------------- | ------------------ |
| git-commit, git-feature, git-pr                | git workflow       |
| jira-issue                                     | project management |
| session-plan, session-resume, session-pause    | session lifecycle  |
| project-new, milestone-new, milestone-complete | project lifecycle  |
| todo-add, todo-check                           | task management    |
| progress, outcome                              | status reporting   |
| pr-address                                     | PR review workflow |
| code-typecheck, code-lint, test-run            | quality checks     |

## Complexity Gating (Wrong)

### What the Topology Does

The topology has `complexity_min` on 4 agents:

- `lu-router`: MODERATE
- `lu-premortem`: MODERATE
- `lu-executor-capable`: COMPLEX
- `lu-verifier`: MODERATE

When the user selects a complexity level in the filter, agents with `complexity_min` above that level are **hidden from the graph**.

### What the Actual Workflow Does

Per `.claude/rules/complexity-gating.md`:

> "ALL workflow steps run at every complexity level. Complexity no longer gates step activation — it controls **model tier** only."

The correct behavior:

- All agents run at all complexity levels
- Complexity determines which **model** each agent uses (haiku/sonnet/opus)
- The model routing table in `src/complexity/__helpers/model-routing.ts` is the source of truth
- 7 named routing presets map agent → tier per complexity level

### What Should Change

The complexity filter should:

1. **Never hide agents** — all are always present
2. **Change model tier badges** on agent cards to reflect what tier they'd run at for the selected complexity
3. Show the model routing preset (ALWAYS_FAST, FAST_PROMOTED, ORCHESTRATOR, DEEP_ANALYSIS, etc.) as metadata

## Edge/Connection Gaps

### Present in Topology

| Edge                                                                       | Type                                    |
| -------------------------------------------------------------------------- | --------------------------------------- |
| Spine: group-classify → group-discuss → ... → group-learn → group-classify | data-flow                               |
| lu-executor → lu-test-writer                                               | spawns                                  |
| lu-router → lu-router-fast                                                 | spawns (wrongly conditional on TRIVIAL) |
| lu-verifier → lu-verifier-fast                                             | spawns (wrongly conditional on TRIVIAL) |
| complexity-gate → agents with complexity_min                               | gates (should be removed)               |

### Missing from Topology

| Edge                                             | Type                                  | Source |
| ------------------------------------------------ | ------------------------------------- | ------ |
| phase-execute → lu-executor                      | skill invokes agent                   |
| phase-execute → code reviewers (5 agents)        | skill spawns parallel reviewers       |
| phase-plan → lu-phase-researcher                 | skill invokes agent                   |
| lu-executor → lu-planner (fix loop)              | agent spawns agent on harness failure |
| autopilot → roadmap agents (4 agents)            | skill spawns swarm                    |
| /lu → phase-discuss → phase-plan → phase-execute | skill chain                           |

## Recommendations

1. **Remove complexity_min gating** — replace with model-tier visualization
2. **Add all 19 missing agents** with correct stage assignments
3. **Add skill nodes** for the core pipeline (lu, phase-discuss, phase-plan, phase-execute, verify)
4. **Add skill→agent edges** to show orchestration relationships
5. **Source topology from a shared config** instead of hardcoding in the observer
