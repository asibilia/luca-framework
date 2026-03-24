# Luca Workflow v2 -- Design Principles

> The foundational principles that drive every architectural decision in Luca Workflow v2.
> Read this first, then dive into individual principle documents for depth.

---

## The Problem

Luca v1 proved that spec-driven development with AI works. But as tasks grew in complexity, four systemic failure modes emerged -- each compounding the others:

| Failure Mode             | Symptom                                                                                        | Root Cause                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Context rot**          | AI quality degrades mid-session; late-phase output is measurably worse than early-phase output | Single long-running agent accumulates context until quality collapses |
| **Guesswork**            | Executors make plausible-sounding decisions that turn out to be wrong                          | Incomplete context forces the model to fill gaps with interpolation   |
| **Ungrounded decisions** | Code uses deprecated APIs, nonexistent library methods, or wrong patterns                      | No verification that implementation decisions trace to real sources   |
| **Review bias**          | Reviews miss errors the original agent introduced                                              | Same agent (or an agent with the same context) reviews its own work   |

These are not independent problems. Context rot causes guesswork. Guesswork produces ungrounded decisions. Review bias lets all of them through. V2 attacks the root causes, not the symptoms.

---

## The v2 Pipeline

The canonical 10-step pipeline (see [`01-workflow-steps/`](../01-workflow-steps/README.md) for full specifications):

```
v1:  discuss -----> plan -----> execute -----> verify -----> learn
                                   |
                          (guesswork happens here)

v2:  1. Ideate
     2. Research
     3. Discuss + Pre-mortem
     4. Deep Expand
     5. Review Research  ──┐
     6. Graduate to MuninnDB   │ (review loop: cold reviewers)
     7. Plan                   │
     8. Review Plan       ──┘
     9. Execute
    10. Verify + UAT  (includes implementation review)
```

All 10 steps run at every complexity level. Complexity affects model tier and iteration budgets, not which steps execute. See the [complexity-gating rule](../../../.claude/rules/complexity-gating.md) for the full matrix.

The fundamental shift: v1 front-loads planning, v2 front-loads understanding. By the time an executor touches code, every decision it needs has been researched, verified, and stored in a targeted context file.

---

## Four Design Principles

Each principle addresses one of the four failure modes. They are deeply interconnected -- you cannot implement one effectively without the others.

### 1. Context Rot Prevention

**Failure mode**: Quality degrades as conversation grows.

**Principle**: Many small agents with fresh context, each doing one thing well.

Instead of one long-running agent that accumulates context until it degrades, v2 spawns independent agents for each concern. Each agent starts fresh, receives only the context it needs, and produces a focused output file. Research files serve as external memory -- agents load what they need, not the full corpus.

**Key mechanism**: The "one task, one context" principle. An executor working on Task 3 of Wave 2 receives the plan for that specific task, the relevant research file(s), and nothing else. It never sees the full conversation history.

[Read more: context-rot-prevention.md](context-rot-prevention.md)

### 2. Grounded Decisions

**Failure mode**: AI invents plausible approaches that don't work.

**Principle**: Every implementation decision must trace to a verified source.

V2 introduces a research phase that runs before planning. Researchers consult real documentation (Context7 MCP, WebFetch, WebSearch), verify findings against official sources, and assign confidence levels. Only HIGH and MEDIUM confidence findings graduate to MuninnDB. Executors follow researched approaches rather than inventing their own.

**Key mechanism**: Source hierarchy with confidence model. See [`02-research-system/source-confidence-model.md`](../02-research-system/source-confidence-model.md) for the canonical specification.

[Read more: grounded-decisions.md](grounded-decisions.md)

### 3. Agent Isolation

**Failure mode**: Reviews don't catch errors introduced by the original agent.

**Principle**: Fresh agents with cold isolation for all review steps.

When an agent writes something, it develops blind spots -- assumptions it made, shortcuts it took, context it loaded. A reviewer who shares that context inherits those blind spots. V2 enforces isolation: review agents never see the original agent's reasoning, only its output. They start with a clean context and evaluate the work on its own merits.

**Key mechanism**: Three isolation levels (cold, warm, none) applied deliberately at each pipeline step. Review loops use cold isolation by default.

[Read more: agent-isolation-patterns.md](agent-isolation-patterns.md)

### 4. Multi-File Architecture

**Failure mode**: Large monolithic documents become unmanageable for both humans and agents.

**Principle**: Many small files, each independently verifiable by a focused agent.

Instead of one RESEARCH.md that grows to thousands of lines, v2 produces one file per concern: `api-authentication.md`, `database-migration-strategy.md`, `error-handling-patterns.md`. Each file is small enough for an agent to fully comprehend in a single context window. Files serve as "context slots" -- an executor loads only the files relevant to its task.

**Key mechanism**: Directory structure as navigation. The file system itself becomes the table of contents, enabling parallel research (different agents write different files simultaneously) and selective loading.

[Read more: multi-file-architecture.md](multi-file-architecture.md)

---

## How the Principles Interconnect

The four principles form a reinforcing system. Remove any one and the others weaken:

| Principle               | Requires                | Because                                                                     |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------- |
| Context Rot Prevention  | Multi-File Architecture | You cannot give agents targeted context if everything lives in one document |
| Multi-File Architecture | Grounded Decisions      | Small files only help if they contain verified, trustworthy information     |
| Grounded Decisions      | Agent Isolation         | A researcher who is also the reviewer will not catch their own errors       |
| Agent Isolation         | Context Rot Prevention  | Isolation is meaningless if agents share a degraded context pool            |

The cycle is complete: each principle both depends on and enables the next.

---

## What v2 Does NOT Change

V2 preserves the strengths that v1 established:

- **Mandatory verification at all complexity levels** -- verification is never skipped, only scaled
- **Complexity-gated model routing** -- efficient resource allocation via the MODEL_ROUTING_TABLE
- **Wave-based parallel execution** -- independent tasks run concurrently
- **MuninnDB memory system** -- semantic graph memory for cross-session learning
- **Recovery loop philosophy** -- never manually patch bad output; diagnose, reset, fix, rerun
- **State machine orchestration** -- typed state transitions with dual-write guarantee

V2 is not a rewrite. It is a structural improvement to the phases that precede execution, and a systematic application of isolation to the phases that follow it.

---

## Cost Model

More agents means more token spend. V2 accepts this trade-off explicitly:

| v1 Cost Center                      | v2 Cost Center                                                                | Change          | Rationale                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| 1 researcher agent (shared context) | 4 specialized researchers (`lu-architecture-researcher`, etc.)                | +200-300%       | Each researcher has fresh context, produces higher quality output |
| 1 plan review (warm)                | Plan review loop with cold reviewers (`code-architect`, `dx-advocate`, etc.)  | +100-200%       | Cold reviewers catch what warm reviewers miss                     |
| 0 research review                   | Research review loop with 3 cold reviewers (`lu-completeness-reviewer`, etc.) | New cost        | Prevents ungrounded findings from reaching executors              |
| 1 executor with full context        | 1 executor with targeted context                                              | -30-50% context | Smaller context = faster execution, fewer hallucinations          |
| 1 post-hoc reviewer (warm)          | Fresh cold reviewer per concern                                               | +50-100%        | Isolation catches more errors                                     |

See [`04-agent-orchestration/`](../04-agent-orchestration/README.md) for the canonical agent specifications and model routing presets.

**Net effect**: Higher upfront cost (research + review loops), lower downstream cost (fewer executor hallucinations, fewer verification failures, less rework). We assume, based on v1 session experience, that catching errors in the research/planning phase is significantly cheaper than catching them in code review or production -- this is a design assumption that motivates the front-loaded cost structure, not a precisely measured quantity.

---

## Documents in This Directory

| Document                                                   | Focus                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [context-rot-prevention.md](context-rot-prevention.md)     | The quality degradation curve, "one task one context", external memory via files            |
| [grounded-decisions.md](grounded-decisions.md)             | Source hierarchy, confidence model, research graduation                                     |
| [agent-isolation-patterns.md](agent-isolation-patterns.md) | Cold/warm/none isolation levels, review loop patterns, why reviewers must not see reasoning |
| [multi-file-architecture.md](multi-file-architecture.md)   | File-per-concern, directory as TOC, parallel research, REVIEW-LOG pattern, file lifecycle   |

---

## Related Documentation

- [Workflow Brainstorm](../../../brainstorm/1.workflow-redesign.md) -- Research foundations and v1 gap analysis
- [Final v4 Workflow](../../../brainstorm/3.final-workflow.md) -- Hardened v1 design with pre-mortem and appetite
- [Agent Design Patterns](../../../research/2.agent-design-patterns.md) -- Sequential, parallel, and single agent patterns
- [Anti-Slop Framework](../../../research/1.anti-slop.md) -- Recovery loops, quality gates, zero-ambiguity specs
- [Target Architecture](../../target-architecture.md) -- Config-driven workflow system proposal
