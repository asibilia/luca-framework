---
title: Audit & fix cognition features (BRAIN/MEMORY/WORKING) per sub-agent type
area: workflow
created: 2026-02-10
source: conversation
---

## Context

User wants to verify that the three-tier cognition system (BRAIN.md static identity, MEMORY.md long-term learning, WORKING.md session state) is correctly implemented and properly served to each individual sub-agent type. Different agent types may need different slices of cognitive context.

## Task

1. **Audit BRAIN.md loading** — Is project identity correctly loaded for all agent types? Is it loaded at the right time?
2. **Audit MEMORY.md selective recall** — Are patterns, decisions, and pitfalls being selectively recalled based on task relevance?
3. **Audit WORKING.md session state** — Is session memory correctly initialized, updated, and cleared?
4. **Define per-agent cognition profiles** — Which agents need full BRAIN context vs. minimal? Which need MEMORY recall?
5. **Implement cognition slicing** — Each sub-agent type gets the appropriate cognitive context (not everything)
6. **Verify learning extraction** — After execution, are learnings properly extracted from WORKING.md into MEMORY.md?

## Notes

- Static cognition (BRAIN.md) = project identity, conventions, stack — loaded once per session
- Long-term cognition (MEMORY.md) = patterns, decisions, pitfalls — selectively recalled
- Working cognition (WORKING.md) = session state, findings, hypotheses — active during workflow
- Different agent types need different cognition slices (e.g., a file editor doesn't need full architectural patterns)
- This connects to the context modularity todo — cognition is part of the context each agent receives
