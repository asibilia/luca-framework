---
title: "Deferred/lazy recall for memory loading"
area: framework/memory
created: 2026-03-08
source: muninn-memory-audit (context-analyst)
priority: P2
complexity: MODERATE
---

## Context

The Muninn memory audit found that lu-cognition eagerly loads ALL memory at session start: brain tree (1K tokens) + semantic recall (3-6K tokens) + global memory (500-1K tokens). This front-loading costs 5-7K tokens before any work begins, even if the session only needs basic operations.

Many sessions don't reach COMPLEX execution stages. Eager recall wastes tokens on workflows that resolve quickly (TRIVIAL/SIMPLE tasks, quick config changes, single-file edits).

## Task

1. Change lu-cognition default to load ONLY the brain tree at session start (~1K tokens)
2. Defer pattern/pitfall/decision recall to the first agent that actually needs it
3. Add a `requestMemoryContext(agentName, taskContext)` function that:
   - Checks if semantic recall has been performed this session
   - If not: performs recall with agent-specific tags and caches the result
   - If yes: returns cached result (no duplicate MCP call)
4. Update agent frontmatter to declare `eager_recall: true|false` (default: false)
   - lu-executor: eager_recall: false (rarely uses recalled patterns)
   - lu-planner: eager_recall: true (always benefits from decisions/patterns)
   - lu-verifier: eager_recall: false (pitfalls only, can defer)

Estimated savings: **6-8K tokens on sessions that don't reach COMPLEX execution**

## Notes

- Estimated effort: 6-8 hours
- Part of Muninn Memory Audit Tier 2 recommendations
- Trade-off: recall latency moves from session start to first-use (acceptable if < 2s)
- Must preserve the existing lite mode bypass for TRIVIAL/SIMPLE tasks
- Related: #89 (complexity-gated depth), #92 (inject memory context)
