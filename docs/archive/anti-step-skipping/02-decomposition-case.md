# The Case for Decomposition: Breaking Monolithic Skills into Atomic Sub-Skills

## Executive Summary

The evidence strongly supports decomposing large workflow skills (800-19,000+ tokens) into chains of small, atomic sub-skills (~100-150 lines each). This is backed by peer-reviewed research on LLM instruction-following degradation, validated by the architectural choices of every major agent framework (LangGraph, CrewAI, DSPy), and explicitly recommended by both Anthropic and OpenAI.

## Argument 1: LLMs Demonstrably Skip Steps in Long Instruction Sets

### The "Lost in the Middle" Problem

Liu et al.'s "Lost in the Middle" (TACL 2024) found that LLM performance follows a **U-shaped curve**: models attend best to information at the beginning and end of their context, but **significantly degrade when critical information is positioned in the middle**. This is a positional bias hardwired into the transformer attention architecture.

For Luca: steps 4-6 of an 8-step workflow are in the **worst position** for attention.

**Source:** [Lost in the Middle](https://arxiv.org/abs/2307.03172) (Liu et al., Stanford/Meta, ACL 2024)

### Prompt Length Degrades Reasoning at 3,000 Tokens

Research published in 2025 demonstrates that "LLMs quickly degrade in their reasoning capabilities even with input lengths of 3,000 tokens." The larger `phase-execute.skill.ts` is roughly **24,000 tokens** -- 8x beyond the demonstrated degradation threshold.

**Source:** [Effects of Prompt Length on Domain-specific Tasks](https://arxiv.org/html/2502.14255) (arXiv 2025)

### IFScale: Omission Errors Dominate

The IFScale study (2025) measured how many instructions LLMs can follow at once (10 to 500):

- Even top models maintained near-perfect performance only up to ~150 instructions before sharp declines
- As instruction density increased, models overwhelmingly shifted from modification errors (doing things wrong) to **omission errors** (completely abandoning instructions)
- At 500 instructions, the best model achieved only 68.9% accuracy

This is the mechanism behind Luca's step-skipping. The LLM is **saturating** and falling into omission-dominant failure mode.

**Source:** [How Many Instructions Can LLMs Follow at Once?](https://arxiv.org/html/2507.11538) (2025)

## Argument 2: Prompt Chaining Empirically Outperforms Monolithic Prompts

### ACL 2024 Findings

Controlled experiments showed that "prompt chaining consistently outperforms monolithic stepwise prompts." Even more striking: "the initial drafts from chained prompts performed as well as the final drafts from stepwise prompts."

### Self-Consistency and Least-to-Most

The Self-Consistency paper (ICLR 2023) demonstrated "double-digit accuracy improvements" through decomposed reasoning. Least-to-Most achieved "near-perfect compositional generalization on the SCAN benchmark."

### The Mechanism: Focused Attention

Anthropic's guidance: "LLMs generally perform better when each consideration is handled by a separate LLM call, allowing focused attention on each specific aspect."

**Sources:** [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) (Anthropic); [Prompt Chaining Guide](https://www.getmaxim.ai/articles/prompt-chaining-for-ai-engineers-a-practical-guide-to-improving-llm-output-quality/)

## Argument 3: Every Major Agent Framework Chose Decomposition

### LangGraph

"Nodes are small and focused. If a node is doing five things, it should probably be five nodes." Reasons:

1. **Checkpoint granularity**: More frequent checkpoints = less work to repeat on failure
2. **Failure isolation**: Different retry strategies per node
3. **Step-skipping prevention**: The graph structure enforces sequencing
4. **Testability**: Smaller nodes are easier to test in isolation

**Source:** [Thinking in LangGraph](https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph)

### CrewAI

Each Task is "a specific assignment completed by an Agent." In 2025, they added Flows -- a state-machine orchestration layer for conditional branching, parallel execution, and event-driven transitions. Decomposition WITH state machines -- the two are complementary.

**Source:** [CrewAI Tasks](https://docs.crewai.com/en/concepts/tasks)

### DSPy

"DSPy shifts your focus from tinkering with prompt strings to programming with structured and declarative natural-language modules." Each module has a single signature (input/output), and modules compose into bigger programs.

**Source:** [DSPy Paper](https://arxiv.org/abs/2310.03714) (Stanford NLP)

## Argument 4: Anthropic and OpenAI Both Recommend Decomposition

### Anthropic

"Building Effective Agents" recommends prompt chaining for workflows "where the task can be easily and cleanly decomposed into fixed subtasks." Their context engineering guide warns against "stuffing a laundry list of edge cases into a prompt."

**Source:** [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents); [Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### OpenAI

"By decomposing complex tasks into a sequence of smaller, discrete steps, you can drastically improve reliability while optimizing costs."

**Source:** [GPT-4.1 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide); [Practical Guide to Building Agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)

## Argument 5: The Microservices Analogy

"A single agent tasked with too many responsibilities becomes a 'Jack of all trades, master of none' -- as complexity of instructions increases, adherence to specific rules degrades, and error rates compound."

The DDD concept of bounded context maps directly to agent boundaries: each agent should own "a narrowly defined capability and its local state."

**Source:** [Managing Agentic AI with Microservice Principles](https://dkmdebugin.medium.com/managing-agentic-ai-with-microservice-principles-a-theory-first-approach-3a079c57254a)

## Argument 6: The pr-address Decomposition

### Proposed Chain

```
pr-address (orchestrator)
  -> pr-fetch      (Steps 0-1: resolve PR, fetch comments)
  -> pr-validate   (Steps 2-4: categorize, spawn reviewers, collect verdicts)
  -> pr-debate     (Step 4.5: handle split verdicts)
  -> pr-fix        (Steps 5-6: plan and execute fixes)
  -> pr-learn      (Step 7.5: capture learnings)
  -> pr-respond    (Steps 8-9: post responses, push, summarize)
```

### Why These Boundaries

| Sub-skill       | Why it is a natural unit                            | Failure mode                        |
| --------------- | --------------------------------------------------- | ----------------------------------- |
| **pr-fetch**    | Pure data retrieval. No LLM reasoning needed.       | GitHub API errors, rate limits      |
| **pr-validate** | LLM-heavy judgment. Spawns parallel reviewers.      | Agent timeout, conflicting verdicts |
| **pr-debate**   | Conditional. Own resolution logic.                  | Debate deadlock                     |
| **pr-fix**      | Planning + execution. Modifies files. Highest risk. | Type errors, merge conflicts        |
| **pr-learn**    | Memory storage. Independent of fixing.              | MuninnDB connection errors          |
| **pr-respond**  | GitHub API writes. Idempotent.                      | API rate limits                     |

## Honest Assessment of Downsides

### Latency

Multiple LLM invocations add latency. Mitigated by context caching (up to 90% reduction per Anthropic), parallel execution, and model tiering.

### Context Loss Between Steps

Sub-skills lose the full conversation context. Solved through typed state objects passed between sub-skills (same as LangGraph's approach).

### Orchestration Complexity

Managing 6 sub-skills is more complex than 1 monolithic skill. But the complexity is **moved and made explicit, not created**. An orchestrator with typed transitions is easier to debug than hoping an LLM follows step 6 after step 5.

### The "Micro-Agent" Anti-Pattern

Decomposing too aggressively creates latency traps. The proposed decomposition follows **natural task boundaries**, not arbitrary line-count targets.

## Why Decomposition Alone Is Insufficient

A state machine is an excellent **complement** -- it manages transitions between sub-skills, handles error recovery, and ensures the chain executes in the correct order. CrewAI discovered this in 2025 when they added Flows alongside their task decomposition model. The approaches are synergistic, not competing.

## Sources

- [Lost in the Middle](https://arxiv.org/abs/2307.03172) (Liu et al., ACL 2024)
- [How Many Instructions Can LLMs Follow at Once?](https://arxiv.org/html/2507.11538) (2025)
- [Effects of Prompt Length](https://arxiv.org/html/2502.14255) (arXiv 2025)
- [Degradation of Multi-Task Prompting](https://www.mdpi.com/2079-9292/14/21/4349) (MDPI Electronics, 2024)
- [DSPy](https://arxiv.org/abs/2310.03714) (Stanford NLP)
- [Thinking in LangGraph](https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph)
- [CrewAI Tasks](https://docs.crewai.com/en/concepts/tasks)
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [GPT-4.1 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide)
- [Managing Agentic AI with Microservice Principles](https://dkmdebugin.medium.com/managing-agentic-ai-with-microservice-principles-a-theory-first-approach-3a079c57254a)
- [The Art of Fast Agents](https://medium.com/google-cloud/the-art-of-fast-agents-14-strategies-to-fix-latency-07a1e1dfebf9)
