# Context Compaction, Token Budgeting, and Memory Management in AI Coding Agents

**Research Date:** 2026-04-13
**Status:** Complete
**Scope:** How AI coding agents handle long conversations, summarize history, persist knowledge, and manage context degradation — with focus on Claude Code's architecture and implications for luca-mastracode

---

## Executive Summary

Context management is the defining constraint of long-running AI coding agents. Every agent — Claude Code, Cursor, Cline, Aider — solves the same fundamental problem: finite token windows degrade output quality as conversations grow. Claude Code's approach is the most sophisticated publicly documented system, implementing a 5-level compression pipeline with progressive cost escalation, a three-layer persistent memory architecture, and a background consolidation process ("autoDream") that mirrors biological sleep. This document catalogs every technique identified through source analysis, publicly documented behavior, and published research — then maps each to implementation recommendations for luca-mastracode.

---

## 1. Claude Code's 5-Level Compression Pipeline

Claude Code manages context pressure through a progressive pipeline where each level is more expensive than the last. The system applies cheap local operations first and escalates to API calls only when necessary.

### Level 1: Tool Result Budgeting (Zero Cost)

Tool results exceeding 50,000 characters (`DEFAULT_MAX_RESULT_SIZE_CHARS`) are persisted to disk. Only a 2KB preview remains in context. The model can retrieve the full content later via the `Read` tool if needed.

This is the first line of defense and the cheapest — zero API calls, trading disk storage for context space.

### Level 2: History Snip (Zero Cost)

Garbage collection for stale conversation scaffolding. Removes repetitive assistant message wrappers and obsolete message spans. Critically, it feeds `snipTokensFreed` data into autocompact threshold calculations, allowing the system to make informed decisions about whether heavier compaction is needed.

### Level 3: Micro-Compaction (Zero Cost, Cache-Aware)

This level bifurcates based on prompt cache state — the key innovation that distinguishes Claude Code's approach from competitors.

**Path A — Cache Cold (time-based):** When the prompt cache TTL (default 5 minutes) expires, the system directly modifies message content, replacing old tool results with `[Old tool result cleared]` placeholders. It retains only the N most recent compactable tool results.

**Path B — Cache Hot (cache-editing):** During active sessions with warm cache (100K+ tokens preserved), the system uses `cache_edits` API blocks with `cache_reference: tool_use_id` tags. The server performs deletion transparently, preserving the cached prefix without invalidation. Messages are returned unchanged; edits occur at the API layer.

Implementation lives in `src/services/compact/microCompact.ts`. The dual-path architecture ensures compaction never unnecessarily invalidates expensive prompt caches — a concern that most competing agents ignore entirely.

### Level 4: Context Collapse (Zero Cost, Non-Destructive)

Triggered at approximately 90% token utilization. Functions like a database "view" — original messages persist unchanged while a projected, filtered view is presented to the model. Fully rollback-capable because summaries are stored separately from source messages.

Context collapse **suppresses autocompact** when active, preserving fine-grained context as long as possible before resorting to irreversible summarization.

### Level 5: Autocompact (Expensive, Irreversible)

The last resort, triggered at approximately 87% utilization when previous levels are insufficient. Forks a child agent to summarize the entire conversation using a two-phase chain-of-thought approach:

1. **`<analysis>` block:** Chronological walkthrough of intent, approaches, decisions, files touched, errors encountered, and fixes applied.
2. **`<summary>` block:** Structured output with 9 standardized sections.

The critical optimization: **chain-of-thought is stripped after summary generation.** The `formatCompactSummary()` function discards the `<analysis>` block and keeps only the `<summary>`. Reasoning improves summary quality dramatically, but the reasoning tokens would be wasted if kept in context. Discard the work, keep the conclusion.

### The 9-Section Summary Structure

The autocompact prompt produces a summary covering:

1. Primary Request (the user's original intent)
2. Technical Concepts (frameworks, patterns, APIs involved)
3. Files and Code (every file path mentioned or modified)
4. Errors and Fixes (what broke and how it was resolved)
5. Problem Solving (approaches tried, including failed ones)
6. All User Messages (verbatim preservation of user directives — not tool results)
7. Pending Tasks (incomplete work)
8. Current Work (what the agent was doing when compaction triggered)
9. Optional Next Step (suggested continuation)

The compaction prompt specifically instructs: "pay special attention to specific user feedback" and preserve "all user messages that are not tool results." Post-compaction, the model is told to "continue without asking the user any further questions."

### Post-Compaction Recovery

`runPostCompactCleanup()` restores critical context that would otherwise be lost:
- Last 5 recently-read files (capped at 5K tokens)
- Activated skills (capped at 25K tokens)
- Deferred tool definitions
- Agent lists and MCP server directives

---

## 2. Token Budgeting and Thresholds

### Claude Code's Buffer Architecture

The compaction buffer was reduced from 45K to 33K tokens in early 2026, providing approximately 12K additional usable tokens. For a 200K context window:

| Component | Token Allocation |
|---|---|
| System prompt | ~2.7K |
| Tool definitions | ~16.8K |
| Custom agents | ~1.3K |
| Memory files | ~7.4K |
| Skills | ~1.0K |
| Conversation history | Variable |
| **Autocompact buffer reserve** | **33K (16.5%)** |

Current compaction trigger: ~83.5% usage (~167K usable tokens). The `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` environment variable allows operators to shift this threshold.

### Threshold Hierarchy

Claude Code uses a "soft landing" approach with four distinct thresholds:

| Threshold | Remaining Tokens | Action |
|---|---|---|
| Warning | ~20,000 | Alert user of approaching limits |
| Auto-compact | ~13,000 | Proactive summarization triggers |
| Error evaluation | ~20,000 | Different evaluation path for errors |
| Manual compact blocking | ~3,000 | Block new requests, require intervention |

An additional 20,000 tokens are reserved for compaction summary generation — ensuring the summarizer itself has room to produce output.

### Token Estimation Strategy

Three approaches in order of precision:
1. **API-based:** Anchors to server-side `usage` data from prior API responses, estimating only the delta (new messages). Achieves <5% error.
2. **Haiku fallback:** Faster model call if primary estimation fails.
3. **Rough heuristic:** ~1 token per 4 characters for immediate UI feedback.

---

## 3. Circuit Breaker: Compaction Failure Protection

A source comment in `autoCompact.ts` documents the incident that motivated the circuit breaker: 1,279 sessions experienced 50 or more consecutive auto-compaction failures, with a peak of 3,272 failures per session, wasting approximately 250,000 API calls per day globally.

The fix: `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`. After three consecutive failures, compaction is disabled for the remainder of the session. The reasoning: irrecoverably over-limit context will not resolve through additional API calls.

---

## 4. Memory System Architecture

### Claude Code's Three-Layer Memory

Claude Code implements a persistent memory system with three tiers of storage:

1. **Index layer (MEMORY.md):** Always loaded at session start. Contains ~150-character pointers per entry. Strictly capped at 200 lines — the cutoff for what loads into the system prompt. Each entry links to a topic file with a one-line description.

2. **Topic files:** Dedicated markdown files storing consolidated knowledge by subject. Loaded on-demand when referenced or when the model determines they are relevant. This is where actual knowledge lives.

3. **Session transcripts:** JSONL files containing raw conversation data. Never loaded into context directly — only searched narrowly via grep when specific information is needed. This is the "cold storage" tier.

### Write Discipline

The system enforces strict rules about what gets stored:
- If a fact can be re-derived from the codebase, it is NOT stored
- Topic files are updated BEFORE index modifications (preventing dangling pointers)
- Memory is treated as **hints requiring verification**, not authoritative truth

This last principle is critical. Claude Code's system prompt frames recalled memories as suggestions that must be verified against the current state of the codebase. This prevents stale memories from overriding reality — a failure mode that plagues agents with authoritative memory systems.

### autoDream Consolidation

autoDream is Claude Code's background memory consolidation process — a forked subagent with limited tool access that periodically reorganizes knowledge.

**Triple-gating mechanism:**
1. **Time gate:** 24+ hours since last consolidation
2. **Session gate:** 5+ sessions accumulated since last consolidation
3. **Lock gate:** File-based advisory lock prevents concurrent runs across multiple Claude Code instances

All three gates must be satisfied before consolidation runs.

**Four-phase process:**
1. **Orientation:** Reads the memory directory and MEMORY.md, builds a map of current memory state.
2. **Gather Signal:** Performs targeted searches of session transcripts for user corrections, explicit save commands, recurring patterns, and architecture decisions. Does NOT exhaustively read all transcripts.
3. **Consolidation:** Converts relative dates to absolute dates ("yesterday" becomes "2026-03-15"), removes contradicted facts, prunes stale debugging notes about deleted files, merges overlapping entries from multiple sessions.
4. **Prune and Index:** Updates MEMORY.md to stay under the 200-line limit, removes stale pointers, adds new file links, resolves contradictions, reorders by relevance.

Average consolidation time: 8-9 minutes for 913 sessions. Runs in background without blocking user sessions. Manual trigger available via `/dream` command.

---

## 5. Cross-Agent Comparison

### Cursor

Cursor summarizes older messages when conversations exceed the model's context window limit. It uses the chat history as reference files to improve summarization quality — after summarization, the agent receives a reference to the history file rather than the full conversation.

For large files added to context, Cursor applies "smart condensation" — automatically condensing files or folders that are too large, based on their size and available context space. Beyond this, Cursor's summarization internals are not publicly documented.

### Cline

Cline implements several context management strategies:

- **Auto-compact at ~80% usage:** Creates a comprehensive summary preserving decisions and code changes.
- **Duplicate file read detection:** When the same file is read multiple times, older reads are replaced with `[DUPLICATE FILE READ]` notices, retaining only the latest version. This directly addresses the problem of multiple outdated file versions causing editing errors.
- **`new_task` tool:** Cleanly ends the current session and starts a new one with preloaded structured context (summaries, file states, next steps). Users can define rules in `.clinerules` for when to trigger handoffs (e.g., "if context usage > 50%").
- **`/smol` command:** Frees context space by generating a comprehensive summary on demand.
- **System prompt optimization:** MCP server instructions (previously 30% of the system prompt at ~8,000 tokens) were replaced with a `load_mcp_documentation` tool that loads them on demand.
- **Conservative truncation:** Balances efficiency with prompt caching — aggressive truncation can break the cache, increasing costs.

Cline's **Memory Bank** system provides cross-session persistence via a folder of markdown files (`projectbrief.md`, `activeContext.md`, `systemPatterns.md`, `techContext.md`, `progress.md`). This is a simpler but effective alternative to Claude Code's three-layer architecture.

### Aider

Aider takes a fundamentally different approach centered on **repository maps**:

- **Repo map:** A compressed representation of the entire codebase (file names, function signatures, class definitions) generated via tree-sitter parsing. Fits within the context window to give the model a bird's-eye view without consuming the full token budget.
- **Graph-based ranking:** Files are ranked using NetworkX's PageRank algorithm with personalization based on chat context. Only the most relevant portions of the repo map are sent.
- **Dynamic token budget:** The `--map-tokens` switch (default 1K tokens) adjusts dynamically. When no files are in chat, the map expands significantly to help the model understand the repository.
- **Conversation summarization:** Aider summarizes chat history after a soft token limit (`max_chat_history_tokens`) is reached.

Aider's strength is in structural understanding of large codebases — its repo map gives context that summarization-based approaches lose.

---

## 6. Research on Summarization Quality

### JetBrains Research (December 2025)

A study comparing context management strategies for LLM-powered coding agents found:

- **Observation masking** (replacing older environment observations with placeholders while preserving reasoning/action history) outperformed LLM summarization in 4 of 5 configurations.
- With Qwen3-Coder 480B, masking increased solve rates by 2.6% while reducing costs by 52%.
- **Trajectory elongation problem:** LLM summarization caused agents to run 13-15% longer than masking approaches. Summaries appear to obscure stopping signals, causing agents to continue attempting solutions beyond natural stopping points.
- Summary generation API calls consumed over 7% of total costs per instance for the largest models, with minimal cache reuse benefits.
- Optimal masking window: 10 turns for SWE-agent; larger windows needed for OpenHands.
- **Recommended hybrid:** Observation masking as primary, with selective summarization for older contexts.

### Mem0 Production Data

- Token reduction via intelligent summarization: 80-90% cost decrease while improving response quality by 26%.
- Retrieval latency: sub-50ms even with extensive stored context.
- Real-world case studies: 40% token cost reduction in educational applications.

### The Quality Degradation Curve

Empirical observation from multiple sources confirms a consistent pattern:

| Context Usage | Quality | Agent State |
|---|---|---|
| 0-30% | PEAK | Thorough, comprehensive, follows all instructions |
| 30-50% | GOOD | Confident, solid work, minor instruction drift |
| 50-70% | DEGRADING | Efficiency mode begins, shortcuts appear |
| 70%+ | POOR | Rushed, minimal effort, significant instruction drift |

Claude Opus 4.6 with 1M tokens achieves 76% accuracy on MRCR v2 (Multi-needle Retrieval) at full context — a fourfold improvement over Sonnet 4.5's 18.5% — but the degradation curve still applies. Larger windows delay the onset but do not eliminate the phenomenon.

### Security Concern

Claude Code's summarizer treats all content equivalently: malicious instructions inside a project file can become part of the summary, indistinguishable from legitimate context. No classification distinguishes user directives from file-embedded content. This is an unsolved problem across all agents.

---

## 7. Memory as Hints vs. Authoritative Recall

A fundamental design tension exists between two memory philosophies:

**Authoritative recall:** Memory is treated as truth. When the system recalls a fact, it acts on it without verification. This is faster but vulnerable to stale or corrupted memories overriding current reality.

**Hints requiring verification:** Memory provides suggestions that must be checked against the current state. Claude Code explicitly adopts this philosophy. The system prompt frames recalled memories as starting points, not conclusions.

The "hints" approach is more robust for coding agents specifically because:
1. Code changes faster than memory can track
2. Other developers (or other AI agents) may modify files between sessions
3. Memory consolidation can introduce errors (merging, summarization artifacts)
4. The cost of verification (reading a file) is low compared to the cost of acting on stale information

For semantic memory systems like MuninnDB, the same principle applies: recalled engrams should be treated as "likely still true" context that the agent should verify before depending on.

---

## 8. Prompt Caching Interactions

Memory loading interacts with prompt caching in non-obvious ways:

- **Loading memory invalidates cache:** Any change to the system prompt (including updated MEMORY.md content) invalidates the cached prefix. Claude Code mitigates this with the `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` — memory lives in the dynamic suffix, so the static prefix remains cached.
- **Compaction invalidates cache:** Full autocompact replaces the conversation history, breaking prompt cache continuity. Micro-compaction (Level 3) was specifically designed to avoid this — cache-hot path uses server-side edits that preserve the cached prefix.
- **Cline's conservative truncation:** Cline explicitly avoids aggressive message truncation because it can break the cache, increasing costs even when it frees tokens.
- **Beta header latching:** Claude Code's `sticky-on` latching for beta headers persists for session duration to protect cache stability.

The general principle: any context management strategy must account for the cost of cache invalidation. A compaction that saves 50K tokens but invalidates a 150K token cache prefix is a net negative.

---

## 9. Implementation Recommendations for luca-mastracode

### Priority 1: Adopt the Progressive Pipeline Model

Implement a simplified version of Claude Code's 5-level pipeline:

1. **Tool result budgeting** (immediate): Cap tool results at a configurable character limit, persist full output to disk, keep only a summary/preview in context. This is zero-cost and high-impact.
2. **Observation masking** (near-term): Replace older tool results with placeholders while preserving the agent's reasoning and action history. JetBrains research shows this outperforms LLM summarization in most configurations.
3. **LLM summarization** (when needed): Use chain-of-thought then strip it. Adopt Claude Code's 9-section summary structure adapted for Luca's workflow context (phase, task position, approach, decisions, files).

### Priority 2: Implement a Circuit Breaker

Add `MAX_CONSECUTIVE_COMPACTION_FAILURES` (start with 3). If compaction fails repeatedly, stop trying. This prevents the runaway API call waste that Claude Code discovered the hard way.

### Priority 3: Frame Memory as Hints

Add explicit framing to any instructions that reference MuninnDB recalls:

> "Recalled memories are hints, not truth. Verify critical facts against the current state of the codebase before depending on them."

This is a one-line instruction change with outsized impact on agent reliability.

### Priority 4: Consider autoDream-Style Consolidation

MuninnDB already supports semantic deduplication, but a periodic consolidation step could:
- Identify and merge overlapping engrams across sessions
- Prune engrams that reference deleted files or completed milestones
- Convert relative temporal references to absolute dates
- Resolve contradictions between older and newer engrams

Triple-gate it: time threshold (24h), session count (5+), advisory lock. Run as a background subagent with read-only access to project code.

### Priority 5: Token Budget Monitoring

Track token usage per mode and implement threshold-based interventions:

| Threshold | Action |
|---|---|
| 50% | Log warning, consider proactive summarization |
| 70% | Trigger observation masking for older tool results |
| 83% | Trigger LLM summarization if masking is insufficient |
| 90% | Block new requests, require mode switch or session restart |

### Priority 6: Preserve Cache Boundaries

When implementing any compaction strategy, ensure it respects the cache boundary pattern from `00-overview.md`. Compaction should modify the dynamic suffix only — never touch the static instruction prefix.

---

## Sources

### Claude Code Architecture (Primary)

- [Claude Code's Compaction Engine: What the Source Code Actually Reveals](https://barazany.dev/blog/claude-codes-compaction-engine) — Detailed analysis of the 5-level pipeline from source
- [Claude Code Deep Dive Part 3: The 5-Level Compression Pipeline Behind 1M Tokens](https://harrisonsec.com/blog/claude-code-context-engineering-compression-pipeline/) — HarrisonSec technical breakdown with function names and thresholds
- [Claude Code Context Buffer: The 33K-45K Token Problem](https://claudefa.st/blog/guide/mechanics/context-buffer-management) — Buffer architecture and token allocation breakdown
- [Conversation Compaction | DeepWiki](https://deepwiki.com/chatgptprojects/claude-code/8.4-conversation-compaction) — Implementation details with file paths and function signatures
- [Claude Code Pattern 6: Context Management at Scale](https://kenhuangus.substack.com/p/claude-code-pattern-6-context-management) — Threshold hierarchy and cost-ordered strategies
- [Compaction - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/compaction) — Official API documentation for compact_20260112 strategy
- [Context editing - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/context-editing) — Official cache_edits API documentation

### Claude Code Memory System

- [Claude Code Dreams: Anthropic's New Memory Feature](https://claudefa.st/blog/guide/mechanics/auto-dream) — Triple-gating mechanism and four-phase consolidation
- [What Is Claude Code AutoDream?](https://www.mindstudio.ai/blog/what-is-claude-code-autodream-memory-consolidation-2) — Memory consolidation technical details
- [Claude Code AutoDream: Memory Consolidation for AI Agents](https://zenvanriel.com/ai-engineer-blog/claude-code-autodream-memory-consolidation-guide/) — Implementation guide
- [Claude Memory Guide: Understanding the 3-Layer Architecture](https://www.shareuhack.com/en/posts/claude-memory-feature-guide-2026) — Index, topic files, transcript layers

### Public Source Analysis

- [Comprehensive Analysis of Claude Code Source Leak](https://www.sabrina.dev/p/claude-code-source-leak-analysis) — Architecture analysis including compaction
- [The Claude Code Source Leak](https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/) — Anti-distillation, frustration detection, circuit breakers
- [What Claude Code's Source Leak Actually Reveals](https://medium.com/@marc.bara.iniesta/what-claude-codes-source-leak-actually-reveals-e571188ecb81) — Token drain bug and compaction failures

### Competing Agent Approaches

- [Cursor Summarization](https://cursor.com/docs/agent/chat/summarization) — Cursor's conversation summarization documentation
- [Cline Context Management](https://docs.cline.bot/prompting/understanding-context-management) — Cline's context optimization framework
- [Inside Cline's Framework for Optimizing Context](https://cline.bot/blog/inside-clines-framework-for-optimizing-context-maintaining-narrative-integrity-and-enabling-smarter-ai) — Duplicate detection and cache-aware truncation
- [Cline new_task Tool](https://cline.bot/blog/unlocking-persistent-memory-how-clines-new_task-tool-eliminates-context-window-limitations) — Session handoff with preloaded context
- [Repository Map | Aider](https://aider.chat/docs/repomap.html) — PageRank-based repository mapping
- [Repository Mapping System | DeepWiki](https://deepwiki.com/Aider-AI/aider/4.1-repository-mapping-system) — Aider's graph-based file ranking

### Research

- [Cutting Through the Noise: Smarter Context Management for LLM-Powered Agents](https://blog.jetbrains.com/research/2025/12/efficient-context-management/) — JetBrains empirical study comparing observation masking vs LLM summarization
- [LLM Chat History Summarization: Best Practices](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025) — Production summarization patterns and performance data
- [Claude Opus 4.6 Introduces Adaptive Reasoning and Context Compaction](https://www.infoq.com/news/2026/03/opus-4-6-context-compaction/) — MRCR v2 benchmark results and 1M token performance
- [Architecture and Orchestration of Memory Systems in AI Agents](https://www.analyticsvidhya.com/blog/2026/04/memory-systems-in-ai-agents/) — Memory architecture taxonomy
- [Memory Scaling for AI Agents](https://www.databricks.com/blog/memory-scaling-ai-agents) — Scaling patterns for agent memory systems

### Internal References

- [00-overview.md](./00-overview.md) — Claude Code prompt architecture overview (companion document)
- `.planning/phases/84-context-resilience/84-A-PLAN.md` — Luca's context pruning and auto-compaction design
- `.planning/phases/153-precompact-checkpoint-hook/153-RESEARCH.md` — PreCompact hook implementation research
- `docs/archive/decisions/orchestrator-context-pruning.md` — Orchestrator context pruning decision record
