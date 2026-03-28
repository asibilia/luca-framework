# Novel Approaches to LLM Orchestrator Step-Skipping

Techniques from adjacent fields -- distributed systems, formal methods, robotics, game design, and programming language theory -- that go beyond decomposition and state machines.

## 1. Compiler-Enforced Workflows (Typestate + DAG Compilation)

**Core idea:** Use the type system or a DSL compiler to make it _structurally impossible_ to reach step N+1 without completing step N.

**The Typestate Pattern (from Rust/PL theory):** Encode an object's state in its type. Operations are only valid in specific states. The compiler rejects invalid transitions. Each step transforms the workflow from `State<StepN_Complete>` to `State<StepN1_Ready>`.

**The Bazel Analogy:** Build systems enforce task ordering via DAG topological sort. A target cannot build until all dependencies have produced outputs. Luca already has this in `dag-sorter.ts` and `dag-executor.ts`.

**Key application:** Never give the LLM the full workflow. Compile the spec into individual prompts, each generated dynamically after the previous step completes.

**Feasibility:** HIGH (Luca has DAG infrastructure). 2-3 days.
**Effectiveness:** HIGH for preventing skipping.
**Downside:** Removes LLM's ability to plan ahead.

**Source:** [Typestate Pattern in Rust](https://softwarepatternslexicon.com/rust/idiomatic-rust-patterns/the-typestate-pattern/)

## 2. Progressive Disclosure / Tool-Gated Execution

**Core idea:** Only reveal the _next_ step after the current step is completed via a mandatory tool call.

**Anthropic's own guidance:** "Design systems where agents cannot accidentally skip steps because the environment itself makes each step mandatory." Advocates progressive disclosure -- "agents incrementally discover relevant context through exploration."

**Game Design Quest Gating:** Quest stages are "pending activation" until prerequisites are met. The player cannot even _see_ the next objective until the current stage completes. State transitions: `pending -> unlocked -> in_progress -> completed`.

**How it works:**

1. The orchestrator holds the full workflow DAG
2. It sends the LLM only step N's instructions plus a mandatory tool call (`report_step_complete(step_id, output)`)
3. The LLM cannot proceed until it makes this tool call
4. The orchestrator validates the output, then generates step N+1's prompt
5. The LLM never sees the full plan -- only its current assignment

**Feasibility:** HIGH. Orchestration pattern change, not new system. 1-2 days.
**Effectiveness:** VERY HIGH. The LLM physically cannot skip steps it cannot see.
**Downside:** Higher latency. LLM loses global context.

**Sources:** [Anthropic: Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents); [Anthropic: Effective Harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents); [Examining Gating in Game Design](https://www.gamedeveloper.com/design/examining-gating-in-game-design)

## 3. Framework-Level Hook Enforcement

**Core idea:** Enforce step ordering _outside_ the LLM's decision loop using deterministic hooks the LLM cannot negotiate with.

**AWS Strands `BeforeToolCallEvent`:** `event.cancel_tool` blocks execution before the LLM sees any result. Rules are deterministic code, not prompt instructions. The LLM receives "BLOCKED: prerequisite not met" and cannot argue past it.

**Google ADK `before_tool_callback`:** Same pattern -- callbacks intercept tool calls, validate against state, block if prerequisites missing.

**AgentSpec (ICSE 2026):** Formalizes this as trigger-predicate-enforcement rules. Parsed with ANTLR4 and hooked into the agent loop. >90% unsafe execution prevention with millisecond overhead.

**Application to Luca:** Extend hooks with `before_step_execution` that checks DAG prerequisites. If not met, block and return error.

**Feasibility:** HIGH (Luca has hooks infrastructure). 1-2 days.
**Effectiveness:** HIGH. Rules execute in framework code, not LLM context.

**Sources:** [AWS AI Agent Guardrails](https://dev.to/aws/ai-agent-guardrails-rules-that-llms-cannot-bypass-596d); [Google ADK Callbacks](https://google.github.io/adk-docs/callbacks/); [AgentSpec (ICSE 2026)](https://arxiv.org/abs/2503.18666)

## 4. Agent Behavioral Contracts (ABC Framework)

**Core idea:** Formal contracts (preconditions, invariants, governance rules) with runtime enforcement and recovery.

**ABC Framework (Feb 2026):** Contracts as 6-tuple: `C = (P, I_hard, I_soft, G_hard, G_soft, R)`. Hard invariants must hold at every step. Soft invariants allow transient violations with bounded recovery.

**Critical metric:** Without contracts, multi-step compliance drops to **36.6% over 100 steps** (at 99% per-step). With contracts + recovery (r=0.95): **95% compliance**.

**Feasibility:** MEDIUM. 1-2 weeks for full implementation.
**Effectiveness:** VERY HIGH. Mathematical compliance guarantees.

**Source:** [Agent Behavioral Contracts](https://arxiv.org/abs/2602.22302)

## 5. Verification-Driven Execution

**Core idea:** After each step, an independent verifier checks that the step actually ran and produced valid output.

**Process Reward Models (PRMs):** Step-level supervision dramatically outperforms outcome-level supervision. PRMs detect skipped steps at step boundaries rather than discovering it only when the final result is wrong.

**AgentGuard:** Creates a "digital twin" MDP of agent behavior, using probabilistic model checking to verify temporal logic properties like "what is the probability of reaching step N without completing step N-1?"

**Chain of Verification (CoVe):** LLM drafts response, generates verification questions, answers them independently, then revises.

**Feasibility:** MEDIUM for deterministic verification (1-2 days), HIGH EFFORT for PRM-based (weeks+).
**Effectiveness:** HIGH for detection, but reactive (catches after the fact).

**Sources:** [Process Reward Models Survey](https://arxiv.org/abs/2510.08049); [AgentGuard](https://arxiv.org/html/2509.23864v1); [Chain of Verification](https://learnprompting.org/docs/advanced/self_criticism/chain_of_verification)

## 6. Event-Sourced Workflow

**Core idea:** Every step emits an event to an append-only log. The log is the source of truth. Recovery = replay events.

57% of microservices organizations use event sourcing + CQRS. The pattern provides: natural audit trail, deterministic replay, time-travel debugging, and the ability to detect missing events (= skipped steps).

Anthropic's long-running agent harness uses git commits as immutable checkpoints -- each commit is an "event" in execution history.

Luca already has `session-ledger.jsonl` and `DAGCheckpointSchema`. The missing piece: make the event log the _authority_ on step completion rather than relying on the LLM's context window.

**Feasibility:** HIGH. Luca has 80% of this. 1 day for gap detection.
**Effectiveness:** HIGH for detection, MEDIUM for prevention (reactive).

**Source:** [Event Sourcing Adoption](https://event-driven.io/en/audit_log_event_sourcing/)

## 7. Durable Execution (Temporal/Inngest Pattern)

**Core idea:** Durable execution engine guarantees every step runs to completion with automatic retry, checkpointing, and exactly-once semantics.

**Temporal:** Workflow (deterministic) is separate from Activities (non-deterministic LLM calls). If a worker crashes, Temporal replays from execution history. Steps physically cannot be skipped.

**Inngest:** Durable step primitives in TypeScript: each `step.run()` is persisted. If the function crashes, it resumes from the last completed step.

**Feasibility:** MEDIUM-HIGH. 3-5 days for lightweight durable executor on Luca's DAG engine.
**Effectiveness:** VERY HIGH. Steps cannot be skipped by design.

**Sources:** [Temporal for AI Agents](https://temporal.io/blog/of-course-you-can-build-dynamic-ai-agents-with-temporal); [Inngest Steps](https://www.inngest.com/docs/features/inngest-functions/steps-workflows)

## 8. Formal Methods (Model Checking + Policies on Paths)

**Core idea:** Formally specify workflow properties and verify them statically or dynamically.

**"Policies on Paths" (March 2026):** Governance as deterministic functions over execution paths: `pi(Agent, Path, ProposedAction, State) -> [0,1]`. Violations are "properties of sequences of actions, not individual actions." Skipping step 3 is only detectable by examining the path [1, 2, _, 4].

**LTL/Kripke Verification:** Convert natural language plans to Kripke structures and Linear Temporal Logic. GPT-5 achieves F1=96.3% on generating correct formal specifications. Property example: `G(step_N_started -> (step_N-1_completed U step_N_started))`.

**Feasibility:** LOW-MEDIUM. 1-2 weeks. Requires PL expertise.
**Effectiveness:** VERY HIGH. Mathematical guarantees.

**Sources:** [Policies on Paths](https://arxiv.org/abs/2603.16586); [LLM Planning and Formal Methods](https://arxiv.org/abs/2510.03469)

## Recommended Layered Approach

Based on feasibility, effectiveness, and composition with Luca's existing architecture:

| Layer | Technique                   | Effort    | Catches                          |
| ----- | --------------------------- | --------- | -------------------------------- |
| **0** | Decomposition               | 1-2 weeks | Reduces cognitive load per skill |
| **1** | Progressive Disclosure      | 1-2 days  | Prevents seeing skippable steps  |
| **2** | State Machine               | 3-5 days  | Blocks invalid transitions       |
| **3** | Hook Enforcement            | 1-2 days  | Framework-level guardrails       |
| **4** | Event-Sourced Gap Detection | 1 day     | Catch-all safety net             |

Each layer operates at a different level and catches what the previous one misses.

## The Key Insight

From AWS Strands guardrails: **"The hook runs outside the LLM. The decision is not the LLM's to make."** Every approach that tries to prevent step-skipping _within_ the LLM's context is fundamentally a suggestion the LLM can ignore. The approaches that work move enforcement _outside_ the LLM's decision loop into deterministic framework code.

## Sources

- [AgentSpec (ICSE 2026)](https://arxiv.org/abs/2503.18666)
- [AgentGuard](https://arxiv.org/html/2509.23864v1)
- [Agent Behavioral Contracts](https://arxiv.org/abs/2602.22302)
- [Policies on Paths](https://arxiv.org/abs/2603.16586)
- [Process Reward Models Survey](https://arxiv.org/abs/2510.08049)
- [Anthropic: Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic: Effective Harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [AWS AI Agent Guardrails](https://dev.to/aws/ai-agent-guardrails-rules-that-llms-cannot-bypass-596d)
- [Google ADK Callbacks](https://google.github.io/adk-docs/callbacks/)
- [Temporal for AI Agents](https://temporal.io/blog/of-course-you-can-build-dynamic-ai-agents-with-temporal)
- [Inngest Steps](https://www.inngest.com/docs/features/inngest-functions/steps-workflows)
- [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [Typestate Pattern](https://softwarepatternslexicon.com/rust/idiomatic-rust-patterns/the-typestate-pattern/)
- [Examining Gating in Game Design](https://www.gamedeveloper.com/design/examining-gating-in-game-design)
- [Semantic Kernel Planners](https://devblogs.microsoft.com/semantic-kernel/the-future-of-planners-in-semantic-kernel/)
