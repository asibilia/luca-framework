# LangChain Open SWE: Open-Source Framework for Internal Coding Agents

## Source

- **URL**: https://blog.langchain.com/open-swe-an-open-source-framework-for-internal-coding-agents/
- **Fetched**: 2026-03-22
- **Relevance**: HIGH

## Summary

Open SWE is an open-source framework that captures converging architectural patterns observed across production internal coding agents at companies like Stripe, Ramp, and Coinbase. Rather than building from scratch, it composes on the Deep Agents framework to provide battle-tested components: isolated cloud sandboxes, curated toolsets (~15 tools vs. Stripe's 500), subagent orchestration, and integration with developer workflows (Slack, Linear, GitHub).

The framework emphasizes composition over forking -- building on Deep Agents provides an automatic upgrade path for improvements in context compression and planning efficiency. It implements a two-layer context approach: repository-level knowledge via `AGENTS.md` injected into system prompts, and task-specific context (full Linear issue details or Slack thread history) provided before execution begins.

A key architectural insight is the separation of agentic (model-driven) and deterministic (middleware-driven) orchestration. Critical operations like PR creation use deterministic safety nets (`open_pr_if_needed` middleware), while the agent retains flexibility for complex reasoning tasks. This mirrors Luca's own hook/skill boundary.

## Key Patterns Relevant to Luca v2

### Curated Toolset Philosophy

- **What**: ~15 carefully selected tools instead of accumulating hundreds. Stripe maintains ~500 tools but curates per-agent selections.
- **How it applies to v2**: Research agents should have focused tool access -- web search, file read, memory recall -- not the full executor toolkit. Constraining tools per agent role improves reasoning quality.
- **Confidence**: HIGH

### Agentic vs. Deterministic Orchestration Split

- **What**: Model-driven decisions for complex reasoning; deterministic middleware for critical reliability operations (PR creation, message injection).
- **How it applies to v2**: Review loops should use deterministic convergence criteria (max iterations, score thresholds) while the review content itself is agentic. Memory graduation should be deterministic (file exists + quality score > threshold = graduate).
- **Confidence**: HIGH

### File-Based Context Management

- **What**: Large intermediate results are offloaded to files rather than kept in conversation history, preventing context overflow.
- **How it applies to v2**: Multi-file research output is already planned for v2. This validates the approach -- research agents write to files, executors read from files, conversation history stays clean.
- **Confidence**: HIGH

### Rich Context at Startup

- **What**: Agents receive full context (issues, thread history, PR details) before execution begins, reducing tool call overhead for discovery.
- **How it applies to v2**: Per-task context recall from MuninnDB should be injected into the dispatch prompt, not discovered via tool calls during execution. Pre-load relevant engrams, research files, and plan context.
- **Confidence**: HIGH

### Subagent Isolation

- **What**: Complex tasks decompose into child agents, each with isolated context, separate middleware stacks, and individual todo lists.
- **How it applies to v2**: Parallel research agents should be fully isolated -- separate context windows, separate output files. This prevents cross-contamination of research findings.
- **Confidence**: HIGH

## Specific Techniques to Adopt

- **Safety net middleware**: Deterministic backstops for critical workflow steps (e.g., if research agent completes without writing output file, middleware forces it)
- **Message injection during execution**: Allow steering/feedback to be injected mid-run at safe boundaries (between tasks, between review iterations)
- **Persistent sandbox sessions**: Reuse research context across follow-up questions within a session
- **AGENTS.md as repository-level knowledge**: Validates Luca's existing CLAUDE.md/AGENTS.md approach for encoding conventions
- **Composition over forking**: Build v2 features as composable layers on v1 infrastructure rather than rewriting

## Specific Techniques to Avoid

- **Slack-first as primary interface**: Open SWE optimizes for Slack/Linear triggers. Luca is CLI-first -- don't introduce chat-based orchestration complexity
- **Cloud sandbox per task**: Luca runs locally with git worktrees. Cloud sandbox isolation is overkill for our use case
- **Multi-channel trigger surfaces**: Keep Luca's single entry point (`/lu`) rather than adding Slack/Linear/GitHub triggers

## Quotes / Key Excerpts

> "While these systems were developed independently, they've converged on similar architectural patterns: isolated cloud sandboxes, curated toolsets, subagent orchestration, and integration with developer workflows."

> "A smaller, curated toolset can be easier to test, maintain, and reason about."

> "Deep Agents handles this through file-based memory, offloading large results instead of keeping everything in the conversation history."

> "This follows a pattern we've observed: isolate first, then grant full permissions inside the boundary."

> "Composition provides [an] upgrade path... When Deep Agents improves... you can incorporate those improvements without rebuilding your customizations."
