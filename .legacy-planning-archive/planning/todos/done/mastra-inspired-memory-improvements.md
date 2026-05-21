---
title: Mastra-inspired memory compression, structured working memory, and quality scoring
area: workflow
created: 2026-02-12
source: conversation (competitive analysis of mastra.ai)
---

## Context

Competitive analysis of Mastra.ai (https://mastra.ai/docs) identified several architectural patterns in their 4-layer memory system that would improve Luca's cognitive memory, context management, and quality tracking. These are not about copying Mastra's application-framework features — they're about adopting the _patterns_ that solve real problems in Luca's dev workflow context.

## Task

### Priority 1 — Do First

1. **Token-aware memory compression**
   - Add MEMORY.md reflection pass (consolidate 58 patterns → ~30-35 dense entries via lu-learner/lu-reflector)
   - Auto-summarize WORKING.md sections when size exceeds threshold mid-session
   - Tie compression to existing context monitor thresholds (100KB → summarize WORKING, 200KB → trim recalled MEMORY to summaries)
   - Inspired by: Mastra Observational Memory (Observer/Reflector agents, 5-40x compression)

2. **Structured WORKING.md schemas**
   - Define Zod schemas for WORKING.md sections (Session Info, Execution Context, Session Status)
   - Validate sections on write to prevent inter-agent drift
   - Use merge semantics for updates (agents update specific fields, not overwrite sections)
   - Inspired by: Mastra Working Memory schema mode with Zod validation

3. **Async context monitoring during execution**
   - Extend context-monitor hook to run periodically (PostToolUse with throttling), not just on Stop events
   - Catch context growth before quality degrades rather than discovering at session end
   - Inspired by: Mastra async buffering (pre-compute at intervals, safety blockAfter threshold)

### Priority 2 — Do Second

4. **Suspend/resume with persistent state**
   - Step-level checkpoints within phases (finer git tags: `iter/17/harness/1/step-3`)
   - Auto-persist WORKING.md on context HIGH warning
   - Explicit suspend semantics in lu-execute-phase (mark phase `suspended` in STATE.md with resume metadata)
   - Inspired by: Mastra suspend()/resume() with state persistence across restarts

5. **Phase quality scoring and trend tracking**
   - Compute composite quality score after each phase: tests, type errors, lint, verifier confidence
   - Track scores in STATE.md progress table
   - Add Quality Trends section to MEMORY.md for cross-phase regression detection
   - Expose harness iteration error-reduction trends (12 → 4 → 0)
   - Inspired by: Mastra @mastra/evals with live + trace-based quantitative scoring

### Priority 3 — Do Third

6. **Milestone-scoped memory recall**
   - Weight MEMORY.md entries from current milestone higher during recall
   - Add milestone tags to entries (v1.0, v1.1, v1.2, v1.3) for temporal relevance scoring
   - No structural changes needed — scoring adjustment in recall algorithm
   - Inspired by: Mastra thread-scope vs resource-scope memory

### Design Now, Implement Later

7. **Model-aware task routing**
   - Design complexity-to-model mapping in agent frontmatter (preferred_model_tier field)
   - TRIVIAL/SIMPLE → faster model, COMPLEX/CRITICAL → strongest model
   - Platform-dependent — requires Claude Code/Cursor model switching support
   - Inspired by: Mastra dynamic model selection per request context

## Notes

- These complement (not replace) the existing procedural memory todo
- Items 1-3 are low-medium effort with high impact on context rot prevention
- Item 7 is a design-only task until IDE platforms support model switching
- Mastra patterns NOT to adopt: class-based architecture, database-backed storage, vector/semantic search (Luca's file-based approach is correct for dev workflow context), 4th memory layer (3 tiers is right for Luca)
