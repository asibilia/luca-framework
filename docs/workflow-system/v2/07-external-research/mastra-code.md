# Mastra Code: Observational Memory for Coding Agents

## Source

- **URL**: https://mastra.ai/blog/announcing-mastra-code
- **Fetched**: 2026-03-22
- **Relevance**: HIGH

## Summary

Mastra Code addresses the critical pain point of context window compaction in AI-assisted coding. When developers work on extended features, the agent accumulates rich contextual knowledge. Upon hitting context limits, traditional systems "compact" memory, causing the agent to lose crucial information. Mastra Code's solution is "observational memory" -- a system that continuously watches conversations, generates observations, reflects on them to compress context, and maintains information without destructive compaction.

The system is built on four technologies: the Mastra Framework (orchestration, memory, storage), pi-tui (terminal interface), ast-grep (structure-aware code edits through AST rules), and LibSQL (local SQLite for threads, messages, token usage, and observational memory). It operates in two modes: Plan Mode (research and map out changes) and Build Mode (execute planned changes with verification). Users report that "after a few days or weeks, you realize you are no longer tracking context windows or restructuring work to avoid compaction."

Key architectural decisions include local-first storage (no data leaves the development environment), subagent support with different models per agent, AST-aware editing (single AST rules replace multiple search-and-replace operations), project-scoped conversations persisting across sessions via git remote or path, and multi-model access across 1,800 models.

## Key Patterns Relevant to Luca v2

### Observational Memory (Watch -> Observe -> Reflect -> Compress)

- **What**: Continuous memory generation that watches conversations, generates observations from interactions, reflects on observations to compress context, and maintains information without destructive compaction.
- **How it applies to v2**: This is directly relevant to MuninnDB graduation. Rather than explicit "remember this" commands, the system should continuously observe research findings, plan decisions, and execution outcomes. The observe -> reflect -> compress cycle maps to: raw research output -> review loop evaluation -> graduated MuninnDB engram.
- **Confidence**: HIGH

### Plan Mode / Build Mode Separation

- **What**: Explicit separation between strategic thinking (research, planning) and tactical execution (building with verification). Two distinct operational modes.
- **How it applies to v2**: Validates Luca v2's research/plan/execute phase separation. The key insight is that these modes require different context, different tools, and potentially different models. A research agent needs web search and docs; an executor needs file edit and shell.
- **Confidence**: HIGH

### AST-Aware Editing

- **What**: Structure-aware code edits through AST rules instead of text search-and-replace. Single AST rules replace multiple search-and-replace operations, reducing tool calls, tokens, and execution time.
- **How it applies to v2**: Not directly applicable to Luca's workflow orchestration, but suggests that execution agents could benefit from AST-aware tools. Reducing tool calls per edit improves token efficiency.
- **Confidence**: LOW

### Session Persistence Across Restarts

- **What**: Project-scoped conversations persist across terminal restarts via git remote or path. Users can resume where they left off.
- **How it applies to v2**: MuninnDB session engrams already provide this. The key addition is that research output files should also persist and be recallable across sessions. A research file from session N should be available to session N+1 without re-doing the research.
- **Confidence**: MEDIUM

### Subagents with Model Routing

- **What**: Subagents can use different models from the main agent, enabling specialized task handling while maintaining unified oversight.
- **How it applies to v2**: Validates Luca's existing model routing (fast models for simple tasks, capable models for complex). Research agents could use capable models while review agents use fast models for initial screening.
- **Confidence**: MEDIUM

## Specific Techniques to Adopt

- **Non-destructive context compression**: Instead of discarding context when approaching limits, compress it into structured observations. MuninnDB graduation is the analog -- research files are compressed into engrams, not discarded
- **Continuous observation rather than explicit capture**: Don't wait for explicit "remember this" signals. Observe what's happening and extract patterns automatically. Luca v2's learning capture phase could be more proactive
- **Local-first data storage**: All memory and session data stays on the developer's machine. MuninnDB already follows this pattern
- **Project-scoped conversation persistence**: Tie sessions to projects (via git remote or path) for automatic context association

## Specific Techniques to Avoid

- **Context window as primary memory**: Mastra Code's approach of observational memory acknowledges that conversation context is ephemeral. Don't rely on it. MuninnDB is the durable store; research files are the medium-term store; conversation context is disposable
- **Destructive compaction**: Never throw away context without first extracting what's valuable. The observe-reflect-compress cycle should always run before context is discarded
- **Single-model approach**: Using the same model for all tasks is wasteful. Route by complexity and task type

## Quotes / Key Excerpts

> "Compresses context without compacting and losing important information."

> "After a few days or weeks, you realize you are no longer tracking context windows or restructuring work to avoid compaction."

> "No compaction! Even with 1M context window compaction took like 3 minutes. With Mastra Code I don't notice any degradation, I don't curse into the air."

> "I don't worry about the conversation length or multiple threads for anything. I just keep rolling and it keeps going."

> "It is hard to go back" [to traditional context management approaches].
