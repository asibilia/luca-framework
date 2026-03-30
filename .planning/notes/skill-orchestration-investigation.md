# Skill Orchestration Investigation: Why /lu Gets Stuck

## Executive Summary

**Root cause**: This is a **confirmed, open bug in Claude Code** ([#17351](https://github.com/anthropics/claude-code/issues/17351), filed 2026-02-09, labels: `bug`, `has repro`, `area:core`). A second reproduction exists at [#29191](https://github.com/anthropics/claude-code/issues/29191). Nested `Skill()` calls do not return control to the parent skill -- they return to the main session context, ending the orchestrator's turn. No Anthropic fix has been shipped.

**Impact**: All 5 Luca orchestrators (lu, phase-execute, pr-address, milestone-complete, verify) are affected. The deepest nesting chain is 4 levels: `lu -> lu-phase-loop -> phase-execute -> phase-execute-waves`. Every `Skill()` boundary is a potential "stuck" point where the pipeline halts and waits for user input.

**Key constraint**: We need to preserve anti-skip enforcement (the orchestrator must not do work inline) while also making the pipeline work end-to-end.

---

## How the Skill Tool Actually Works

The Skill tool is a **prompt injection mechanism**, not a sub-process spawner:

1. When the LLM calls `Skill(skill: "lu-route", args: "...")`, Claude Code injects 2 messages into the conversation:
   - A visible metadata message: "The 'lu-route' skill is loading"
   - A hidden message containing the full SKILL.md body
2. The LLM reads the injected SKILL.md instructions and follows them
3. When the sub-skill's instructions say "return to the lu orchestrator," the LLM is **supposed to** stop following the sub-skill and resume the parent

**The bug**: After the nested skill completes, Claude's turn-completion heuristic fires because it sees a completed task. It does not have the parent skill's execution state to resume from. The remaining orchestrator steps are silently dropped.

**Quote from #29191**: "After /git-commit completed successfully, the workflow stopped and returned to the main session instead of continuing with the PR creation."

**Quote from #17351**: "I can't get a prompt calling a list of N skills to complete. After skill 1 is run, it ends the turn."

---

## How the Agent Tool Differs

The Agent tool (formerly Task tool) spawns a **separate Claude instance**:

1. Each sub-agent has its own context window, system prompt, and tool access
2. The sub-agent runs independently and returns a summary to the parent
3. **The parent conversation continues after the agent completes** -- this is the critical difference
4. Multiple Agent() calls can be chained sequentially

**Hard constraint**: Sub-agents cannot spawn other sub-agents. This means Agent()-based delegation is flat (1 level deep), not nested.

---

## Why `context: fork` Doesn't Help

Skills support a `context: fork` frontmatter option that would theoretically spawn a sub-agent. However, [#17283](https://github.com/anthropics/claude-code/issues/17283) documents that `context: fork` is **ignored** when skills are invoked via the Skill tool. This workaround is unreliable.

---

## Current Architecture (What's Breaking)

```
User invokes /lu
  LLM calls Skill("lu-route")           <- SKILL.md injected, LLM follows it
    lu-route completes, says "return"    <- LLM turn ends here (BUG)
                                         <- orchestrator steps 3-7 never run
  [user must manually prod]
  LLM calls Skill("lu-configure")       <- SKILL.md injected, LLM follows it
    lu-configure completes               <- LLM turn ends here (BUG)
  [user must manually prod]
  ... repeat for every sub-skill boundary
```

The same problem affects every orchestrator:

- **phase-execute**: Gets stuck between waves/verify/review
- **pr-address**: Gets stuck between fetch/validate/debate/fix/learn/respond
- **milestone-complete**: Gets stuck between learn/prune/shadow-gate/archive/finalize
- **verify**: Gets stuck between extract/test/diagnose/review

---

## Candidate Solutions

### Option A: Inline Sub-Skill Logic Into Parent Orchestrators

**Approach**: Merge each orchestrator's sub-skill instructions directly into the parent SKILL.md. Instead of `Skill("lu-route")`, the lu skill contains lu-route's full instructions as a section. No nested Skill() calls needed.

**Pros**:

- Eliminates the bug entirely (no nested Skill() calls)
- State machine + hooks still enforce ordering
- Agent() calls for heavy work (lu-cognition, lu-router, lu-planner, lu-executor) still work within the merged skill

**Cons**:

- Larger SKILL.md files (more context consumed per invocation)
- Sub-skills lose their independent identity (can't be invoked standalone)
- Risk of the LLM skipping inline sections (though hooks mitigate this)

**Effort**: MODERATE -- merge 4-6 sub-skill SKILL.md files into each parent, update build pipeline

### Option B: Replace Skill() With Agent() for Sub-Skill Delegation

**Approach**: The orchestrator skill calls `Agent()` instead of `Skill()` for each sub-task. Each sub-skill runs as a sub-agent with its own context window and returns results.

**Pros**:

- Agent() explicitly returns control to the parent
- Sub-skills run in isolation (can't interfere with parent context)
- Clean separation of concerns preserved

**Cons**:

- **Sub-agents cannot spawn other sub-agents** -- breaks nesting (lu-phase-loop can't Agent() into phase-execute which can't Agent() into phase-execute-waves)
- Sub-agents don't inherit conversation history (need explicit context passing)
- Sub-agents have their own token budgets (parallel cost)
- Would need to flatten the 4-level nesting to 1 level

**Effort**: HIGH -- fundamental architecture change, nesting constraint requires redesign

### Option C: Hybrid -- Inline Orchestration + Agent() for Heavy Work

**Approach**: The orchestrator skill contains ALL sequential orchestration logic inline (no sub-skill Skill() calls). Heavy, isolated work units are delegated via Agent() calls (which already work for lu-cognition, lu-router, lu-planner, lu-executor, lu-verifier, etc.).

**Pros**:

- Eliminates the nested Skill() bug
- Preserves isolation for heavy work via Agent()
- Anti-skip enforcement via hooks + state machine still works
- Agent() calls for heavy work are already proven in the codebase
- The orchestrator remains "thin" -- it coordinates but doesn't do substantive work itself
- Sub-agent nesting constraint is irrelevant because heavy work agents don't need to spawn further agents

**Cons**:

- Larger SKILL.md for orchestrators (but manageable -- orchestrator logic is mostly coordination, not content)
- Need to restructure 5 orchestrator + ~23 sub-skill source files

**Effort**: MODERATE-HIGH -- restructure orchestrators, preserve sub-skill logic as inline sections

### Option D: Deterministic Script Orchestrator (Non-LLM)

**Approach**: A TypeScript/bash script drives the pipeline deterministically. Each step invokes Claude Code (or an Agent) as a bounded sub-task. The script controls flow, not the LLM.

**Pros**:

- Fully deterministic -- impossible for LLM to skip steps
- Matches the research consensus ("make orchestration deterministic; keep judgment in the agent")
- Immune to Claude Code Skill tool bugs
- Proven pattern (LangGraph, Temporal, etc.)

**Cons**:

- Requires a runner outside Claude Code (can't be a skill)
- Loses the interactive conversation context
- Each step would be a separate Claude Code invocation (expensive, slow)
- Major architectural departure from current system

**Effort**: VERY HIGH -- fundamentally different execution model

### Option E: State Machine-Gated Tool Availability

**Approach**: Instead of the orchestrator calling sub-skills, the state machine controls which skills are available at each state. Only the current-state skill is invocable. The LLM can only call what's available.

**Pros**:

- Strongest anti-skip enforcement (StateFlow pattern from Microsoft Research)
- LLM cannot skip because skip-target tools aren't in its action space
- No nesting needed -- each skill is invoked independently at the top level

**Cons**:

- Requires modifying Claude Code's tool availability per state (may not be possible with current hook system)
- Skills would need to be invoked from the main conversation, not from within other skills
- The "orchestrator" becomes the state machine + hooks, not a skill

**Effort**: HIGH -- requires hook system changes and possibly Claude Code platform integration

---

## Recommended Approach: Option C (Hybrid)

**Option C is the best balance** of fixing the bug, preserving anti-skip enforcement, and minimizing architectural disruption.

### How It Would Work

1. **Each orchestrator SKILL.md contains all its sequential steps inline** -- no Skill() calls to sub-skills
2. **Heavy work is delegated via Agent()** which already works:
   - lu-cognition (cognitive pre-flight)
   - lu-router (complexity classification)
   - lu-planner (plan generation)
   - lu-executor (code execution)
   - lu-verifier (verification)
   - lu-learner (learning extraction)
   - All code review agents (dx-advocate, code-architect, etc.)
3. **State machine + pre-step hooks still enforce ordering** -- hooks validate state transitions before each Agent() spawn
4. **Context files still track progress** -- each inline step writes to the context file via the CLI
5. **Gap detection still runs at the end** -- the audit checks that all required sections were populated

### What Changes

| Current                                              | Proposed                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `lu` calls `Skill("lu-route")`                       | `lu` contains lu-route's logic inline as "Step 2: Route"           |
| `lu` calls `Skill("lu-configure")`                   | `lu` contains lu-configure's logic inline as "Step 3: Configure"   |
| `lu` calls `Skill("lu-phase-loop")`                  | `lu` contains lu-phase-loop's logic inline as "Step 5: Phase Loop" |
| `phase-execute` calls `Skill("phase-execute-waves")` | `phase-execute` contains waves logic inline                        |
| Sub-skills are separate SKILL.md files               | Sub-skill logic is inlined into parent orchestrator sections       |
| 5 orchestrators + 23 sub-skills = 28 skill files     | 5 orchestrators (larger) + 0 sub-skills = 5 skill files            |

### What Stays The Same

- Agent() calls for heavy work (already working)
- State machines (still enforce ordering)
- Pre-step hooks (still validate transitions -- adapt to validate Agent() calls instead of Skill() calls)
- Context files (still track progress)
- Gap detection audits (still verify coverage)
- The orchestrator remains "thin" -- it coordinates, delegates heavy work to agents, and doesn't write code itself

### Anti-Skip Enforcement Under Option C

The anti-skip stack from the research maps cleanly:

| Layer                 | Current                                        | Under Option C                                  |
| --------------------- | ---------------------------------------------- | ----------------------------------------------- |
| L0: State Machine     | XState v5 definitions                          | Same (unchanged)                                |
| L1: Fail-Closed Flags | Gate flags (--run/--skip)                      | Same (unchanged)                                |
| L2: Tool Gating       | Pre-step hooks block wrong-order Skill() calls | Pre-step hooks block wrong-order Agent() spawns |
| L3: Checkpoints       | Context files track current_state              | Same (unchanged)                                |
| L4: Gap Detection     | Post-execution audit                           | Same (unchanged)                                |

The only change is L2: hooks validate Agent() spawns instead of Skill() calls. The enforcement mechanism is identical -- read context file, check current_state, block if precondition not met.

---

## Open Questions for Discussion

1. **Standalone sub-skill invocation**: Some sub-skills (like `verify-test`, `pr-fetch`) are useful standalone. If inlined, they lose independent invocability. Should we keep them as standalone skills AND inline their logic? (Duplication concern)

2. **SKILL.md size**: The merged lu SKILL.md would be ~500-800 lines. Is this too large for reliable LLM execution? The research on context degradation suggests quality drops at 50%+ context usage.

3. **Migration scope**: Do we fix all 5 orchestrators at once, or start with `lu` as proof-of-concept?

4. **Hook adaptation**: Pre-step hooks currently match on Skill tool invocations. They'd need to match on Agent tool invocations instead. Is the hook event structure compatible?

5. **Build pipeline**: The skill compiler currently generates separate SKILL.md files per skill. It would need a "merge" mode for orchestrator skills that inline their sub-skills.

---

## Research Sources

### Confirmed Bug Reports

- [#17351: Nested skills don't return to invoking skill context](https://github.com/anthropics/claude-code/issues/17351) (OPEN, `bug`, `has repro`, `area:core`)
- [#29191: Parent skill cannot resume after nested skill completes](https://github.com/anthropics/claude-code/issues/29191) (OPEN)
- [#17283: Skill tool should honor context: fork](https://github.com/anthropics/claude-code/issues/17283) (context: fork ignored)

### Claude Code Documentation

- [Skills documentation](https://code.claude.com/docs/en/skills) -- inline injection model
- [Sub-agents documentation](https://code.claude.com/docs/en/sub-agents) -- isolated execution, no nesting

### Anti-Skip Research

- [StateFlow (Microsoft Research)](https://arxiv.org/html/2403.11322v1) -- per-state tool binding
- [MASFT: Multi-Agent System Failure Taxonomy (NeurIPS 2025)](https://arxiv.org/html/2503.13657v1) -- 14 failure modes
- [AWS Agent Guardrails](https://dev.to/aws/ai-agent-guardrails-rules-that-llms-cannot-bypass-596d) -- hook-based enforcement
- [AgentSpec (ICSE 2026)](https://cposkitt.github.io/files/publications/agentspec_llm_enforcement_icse26.pdf) -- runtime policy enforcement
- [Formal Verification for Agent Orchestration](https://understandingdata.com/posts/formal-verification-for-agent-orchestration/) -- TLA+/Z3 state machine proofs
