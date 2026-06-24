---
title: "Scout: Create lu-scout-relevance agent"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, agents, phase-2]
---

## Context

Step 2 of the per-article pipeline. Quick relevance assessment to determine if the article is worth deep research investment. Non-destructive: low-relevance articles are moved to manual-review, not discarded.

## Task

Create `src/agents/general/lu-scout-relevance.agent.ts`:

1. **Tools**: Read, Grep, Glob (codebase awareness), Write
2. **Cognition tier**: T1 (memory reader — recall project identity for relevance assessment)
3. **Input**: Path to digest file
4. **Process**:
   - Read the digest
   - Assess relevance to the Luca framework specifically:
     - Does it relate to agentic development, LLM orchestration, developer tooling?
     - Does it introduce techniques applicable to our architecture?
     - Does it address problems we face (context management, step skipping, memory, verification)?
   - Score: HIGH / MEDIUM / LOW with brief rationale
5. **Output**: Returns relevance score and rationale (inline, not a separate file)
6. **MuninnDB recall**: Query repo vault for `brain:project-identity` to understand what the framework does

## Notes

- LOW relevance does NOT mean "bad article" — it means "not directly applicable to this framework"
- The orchestrator uses the score to route: HIGH/MEDIUM → continue pipeline, LOW → manual-review
- This should be fast — quick assessment, not deep research
- Rationale is appended to the digest file as a "Relevance Assessment" section
