# Research: Fresh Context Per Unit of Work

> **Learning:** GSD2 Learning 1 — Every task gets a clean context window with only what it needs pre-inlined.
> **Date:** 2026-03-31
> **Status:** Research complete
> **Cross-references:** [02-task-sizing-constraint.md](./02-task-sizing-constraint.md), [03-per-phase-reassessment.md](./03-per-phase-reassessment.md)

## Summary

GSD2's most fundamental design decision is that every unit of work receives a fresh context window. The orchestrator is TypeScript code (not an LLM) that reads disk state, builds a dispatch prompt with only the relevant artifacts inlined, creates a fresh agent session, and captures output. Luca operates under different runtime constraints — the `/lu` orchestrator IS an LLM session in Claude Code — but each `Agent()` call within that session IS a fresh context window. The agent-prompts.ts templates are our dispatch prompts. This learning is directly applicable; what we need to change is HOW those dispatch prompts are assembled.

---

## 1. What Specifically Needs to Change in the Proposed Pipeline

### Step 1 (Cognitive Pre-Flight) Must Become a Context Assembly Step

Currently, the `COGNITION_PROMPT` (line 670 of agent-prompts.ts) fires MuninnDB recalls and returns a summary of intuition flags. The orchestrator receives that summary as text output — but critically, the orchestrator does NOT use that output to build downstream agent prompts. The recalled patterns, project identity, and session context are consumed and then lost in the orchestrator's growing context window.

**Change:** Step 1 should produce a structured context payload (JSON in the context file at `/tmp/lu-context.json`) that downstream prompt templates consume. The cognition agent's job changes from "recall and summarize" to "recall, filter, and serialize a context payload for this specific task."

### Step 5h (Execution), 5j (Verification), 5k (Code Review) Need Scoped Context Inlining

Each Agent() call's prompt template currently includes:

- The `memoryProtocol` block (which instructs the agent to recall from MuninnDB itself)
- The `AGENT_CONSTRAINT` block
- A task description referencing phase number

What's missing is **pre-inlined task-specific context** — the actual plan content, the phase goal, the files that need modification, the research findings. Each agent has to discover this by reading files, which burns context tokens on navigation rather than work.

**Change:** The orchestrator (lu.skill.ts) should read the relevant artifacts BEFORE spawning each agent and inline the critical content directly into the prompt. The agent should receive what it needs, not instructions to go find it.

### Steps 5l-5m (Learning, Process Data) Should Get Minimal Context

These are lightweight agents that don't need full project context. Currently, `LEARNING_CAPTURE_PROMPT` uses `memoryProtocol(vault, "none", ...)` — isolation "none" means FULL recall (brain tree + session + cross-project patterns). A learning capture agent doesn't need cross-project patterns recalled; it needs the phase's execution summary and the session candidate engrams.

**Change:** Adjust memory isolation levels per agent type to match actual context needs.

---

## 2. Constraints Claude Code Imposes vs GSD2's Pi SDK Runtime

### What GSD2 Can Do That We Cannot

| Capability                             | GSD2 (Pi SDK)                                            | Luca (Claude Code)                                                               |
| -------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Create fresh sessions programmatically | Yes — `createSession()` in code                          | No — Agent() is the mechanism                                                    |
| Control context window size            | Yes — explicit 200K allocation                           | No — Agent() gets what Claude Code gives                                         |
| Pre-inline file contents into prompts  | Yes — read file in TypeScript, inject into prompt string | Partial — orchestrator can read and pass, but adds to orchestrator's own context |
| Track token usage per agent            | Yes — Pi SDK reports usage                               | No — Claude Code does not expose this                                            |
| Kill a runaway agent mid-execution     | Yes — timeout + abort                                    | No — Agent() runs to completion or Claude Code timeout                           |

### The Orchestrator Context Accumulation Problem

In GSD2, the orchestrator is TypeScript code with zero LLM context. It reads files, builds prompts, and spawns agents — it never accumulates context itself.

In Luca, the orchestrator IS an LLM session. Every Agent() call's output flows back into the orchestrator's context. By Phase 3 of a multi-phase execution, the orchestrator has accumulated the outputs of 30+ agent calls in its context window. This is the exact context pollution that GSD2 designed to avoid.

**Mitigation strategies:**

1. **Minimize Agent() output verbosity.** The output contract should be structured and terse — status, counts, paths. The orchestrator doesn't need prose summaries; it needs routing signals.
2. **Write results to disk, not to output.** Agents should write their findings to files (SUMMARY.md, VERIFICATION.md, etc.) and return only a status line. The next agent reads from disk, not from the orchestrator's context.
3. **Keep the orchestrator's inline reads minimal.** When the orchestrator reads a PLAN.md to build a prompt, it should extract only the relevant section, not cat the entire file.

### Agent() IS Fresh Context — But the Prompt Determines Quality

Each `Agent()` call starts with a clean context window. The prompt template is the ONLY input. This means:

- What we inline into the prompt IS the agent's entire world
- Recalling from MuninnDB inside the agent burns agent tokens on recall rather than work
- Pre-inlining the RIGHT context into the prompt is the highest-leverage optimization

---

## 3. Concrete Implementation Approach

### 3a. Context Payload Schema

Add a structured context payload to the context file that downstream prompts consume:

```typescript
interface PhaseContextPayload {
  // From ROADMAP.md — the phase's goal and success criteria
  phase_goal: string;
  success_criteria: string[];

  // From PLAN.md — task list for this wave
  tasks: Array<{ id: string; description: string; files: string[] }>;

  // From cognition agent — filtered patterns relevant to this phase
  relevant_patterns: Array<{ concept: string; content: string }>;

  // From previous phases — what changed that affects this phase
  upstream_changes: Array<{ phase: number; files_modified: string[] }>;

  // From research (v2) — synthesized findings
  research_summary?: string;
}
```

### 3b. Prompt Template Tiers

Not all agents need the same context depth. Define three tiers:

| Tier        | Context Inlined                               | Memory Protocol        | Agents                                           |
| ----------- | --------------------------------------------- | ---------------------- | ------------------------------------------------ |
| **Full**    | Phase goal + plan tasks + patterns + research | Warm (session + brain) | lu-executor, lu-planner, lu-discuss-researcher   |
| **Scoped**  | Phase goal + specific task scope              | Cold (brain only)      | lu-verifier, code reviewers, lu-phase-researcher |
| **Minimal** | Phase number + status flags                   | None (skip recall)     | lu-learner, lu-process-data, harness checker     |

### 3c. Changes to `memoryProtocol()`

The current `memoryProtocol()` function has three isolation levels (none/warm/cold) and a `recallDepth` parameter. This is close to what we need but the mapping is wrong:

**Current mapping (incorrect):**

- `LEARNING_CAPTURE_PROMPT` uses isolation "none" (full recall) — wasteful
- `HARNESS_CHECK_PROMPT` has no memoryProtocol at all — correct (it doesn't need memory)
- `CODE_REVIEW_PROMPT` uses isolation "cold" — correct
- `EXECUTE_WAVES_PROMPT` uses isolation "none" — should use "warm" with pre-inlined context

**Proposed mapping:**

| Agent           | Current Isolation | Proposed Isolation | Rationale                                  |
| --------------- | ----------------- | ------------------ | ------------------------------------------ |
| lu-executor     | none              | warm + inline      | Needs plan, not cross-project patterns     |
| lu-planner      | (not shown)       | warm + inline      | Needs goal + research, not old patterns    |
| lu-verifier     | warm              | cold + inline      | Needs goal + criteria, not session context |
| Code reviewers  | cold              | cold (keep)        | Brain tree is enough                       |
| lu-learner      | none              | minimal (depth=0)  | Gets session candidates from orchestrator  |
| lu-process-data | (none)            | minimal (depth=0)  | Only needs phase metrics                   |
| Harness checker | (none)            | (none, keep)       | Correct — pure mechanical check            |

### 3d. Orchestrator Context Assembly Pattern

Before each Agent() call in Step 5, the orchestrator should:

```
1. Read the relevant artifact (PLAN.md, ROADMAP.md phase section, RESEARCH.md)
2. Extract ONLY the relevant section (not the full file)
3. Build the prompt using the template function with the extracted content
4. Spawn Agent() with the assembled prompt
5. Capture ONLY the structured output contract fields
6. Write detailed results to disk (the agent does this, not the orchestrator)
```

This requires the prompt template functions in agent-prompts.ts to accept an optional `inlinedContext` parameter:

```typescript
export interface AgentPromptParams {
  phase: string;
  complexity: string;
  vault: string;
  currentState: string;
  recallDepth?: number | null;
  // NEW: pre-assembled context to inline
  inlinedContext?: {
    phaseGoal?: string;
    planTasks?: string;
    researchSummary?: string;
    relevantPatterns?: string;
    upstreamChanges?: string;
  };
}
```

Templates would then include the inlined context in a `<context>` block:

```typescript
const inlinedContextBlock = (
  ctx?: AgentPromptParams["inlinedContext"],
): string => {
  if (!ctx) return "";
  const sections: string[] = ["<inlined_context>"];
  if (ctx.phaseGoal) sections.push(`<phase_goal>${ctx.phaseGoal}</phase_goal>`);
  if (ctx.planTasks) sections.push(`<plan_tasks>${ctx.planTasks}</plan_tasks>`);
  if (ctx.researchSummary)
    sections.push(`<research>${ctx.researchSummary}</research>`);
  if (ctx.relevantPatterns)
    sections.push(`<patterns>${ctx.relevantPatterns}</patterns>`);
  sections.push("</inlined_context>");
  return sections.length > 2 ? sections.join("\n") : "";
};
```

---

## 4. Risks and Tradeoffs

### Risks of Adopting

1. **Orchestrator token consumption increases.** The orchestrator must read artifacts to build prompts, which adds to its own context. However, this is offset by agents returning terse output contracts instead of verbose summaries.

2. **Prompt template complexity increases.** Templates go from simple string interpolation to conditional context assembly. More moving parts means more maintenance surface.

3. **Context payload staleness.** If the orchestrator assembles context at the start of a phase loop iteration and the agent modifies files during execution, the context for the next agent (e.g., verifier) may be stale. Mitigation: re-read critical artifacts before verification agents.

4. **Over-inlining risk.** Inlining too much context into a prompt is as bad as inlining too little. A 50K-token prompt leaves less room for the agent's actual work. This interacts directly with Learning 2 (task sizing) — see [02-task-sizing-constraint.md](./02-task-sizing-constraint.md).

### Risks of NOT Adopting

1. **Agents waste tokens on navigation.** Every agent that starts by reading ROADMAP.md, then PLAN.md, then the phase directory, then relevant source files is spending 20-30% of its context on discovery rather than work.

2. **Context pollution across phases.** Without scoped context, agents recall and consume information from previous phases that may be irrelevant or misleading.

3. **Non-deterministic context.** When agents recall from MuninnDB, what they get depends on the recall query quality and the database state. Pre-inlining gives deterministic context.

### Tradeoff Summary

| Dimension               | Adopt                              | Don't Adopt                        |
| ----------------------- | ---------------------------------- | ---------------------------------- |
| Agent output quality    | Higher (focused context)           | Lower (navigational overhead)      |
| Orchestrator complexity | Higher (context assembly logic)    | Lower (simple template dispatch)   |
| Token efficiency        | Better (agents work, not navigate) | Worse (agents discover, then work) |
| Determinism             | Higher (pre-inlined)               | Lower (recall-dependent)           |
| Maintenance surface     | Larger (context schemas, tiers)    | Smaller (current templates)        |

---

## 5. Interaction with Other Learnings

### With Learning 2 (Task Sizing)

Fresh context per unit and task sizing are deeply coupled. If a task is properly sized to fit in one context window (Learning 2), then the fresh context for that task can be assembled precisely — we know exactly what the agent needs because the task scope is bounded. If tasks are oversized, we can't assemble a focused context payload because the scope is too broad.

**Implication:** The context payload schema should include a `estimated_tokens` field that the planner populates. If the inlined context + task scope exceeds a threshold (e.g., 80K tokens for an opus agent), the task should be split.

### With Learning 3 (Per-Phase Reassessment)

Reassessment after each phase (Learning 3) produces information about drift — which remaining phases are still valid, which need modification. This drift information should flow INTO the context payload for the next phase. If Phase 3 discovers that Phase 5's assumptions are invalid, the Phase 4 executor should know this (it may affect how Phase 4 is implemented).

**Implication:** The context payload should include an `upstream_drift` field populated by the reassessment step (Step 5q). This keeps drift information in the structured context rather than buried in MuninnDB recall results.

### With Learning 5 (Structured Verification Data)

If verification output is structured JSON (Learning 5), it can be mechanically included in the context payload for downstream agents (e.g., the gap-closure planner). No LLM interpretation needed — the orchestrator reads JSON and inlines the relevant fields.

### With Learning 7 (Pipeline Ceremony Overhead)

Reducing ceremony (Learning 7) means fewer agents, which means fewer dispatch prompts to assemble. If we merge learning capture into mechanical post-processing and make classification deterministic, the number of prompts that need context assembly drops from ~14 to ~8 per phase.
