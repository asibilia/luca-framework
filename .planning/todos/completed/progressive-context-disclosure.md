---
title: Implement progressive context disclosure system
area: workflow
created: 2026-02-10
source: research (context engineering)
---

## Context

Current cognitive pre-flight loads BRAIN.md fully and does "selective recall" from MEMORY.md. But research from Anthropic, Manus, and LangChain shows the state-of-the-art is **just-in-time context loading**: maintain lightweight identifiers, load full data only when needed via tools.

The BRAIN.md file (86 lines) is reasonable, but as MEMORY.md grows (currently 95 lines, will grow significantly), loading everything upfront wastes context window. The key insight from Anthropic: "Find the smallest set of high-signal tokens that maximize desired outcome."

## Task

1. **Implement indexed memory** — Add metadata tags/categories to MEMORY.md entries so recall can be keyword-based rather than loading everything
2. **Design context budget system** — Each sub-agent gets a context budget; orchestrator allocates based on task needs
3. **Implement lazy loading for cognition** — BRAIN.md summary (not full) loaded by default; full sections loaded on demand
4. **Add compaction triggers** — When context usage hits thresholds (30%, 50%, 70%), automatically compact or offload to WORKING.md
5. **Design skill-based progressive disclosure** — Skills load domain knowledge on demand rather than embedding everything upfront
6. **Implement context metrics** — Track actual context usage per agent, per skill, per phase. Use data to optimize loading.

## Notes

- Anthropic's recommendation: "Maintain lightweight identifiers, load data at runtime via tools"
- Manus (1M+ users) found context engineering to be the single most important design dimension
- LangChain identifies four strategies: Write (persist outside), Select (retrieve relevant), Compress (summarize), Isolate (multi-agent)
- Luca already does Write (WORKING.md), Isolate (sub-agents) — needs better Select and Compress
- The quality degradation curve (0-30% peak, 50%+ degrading) is well-documented but not actively managed
- This directly improves the sub-agent architecture todo — each agent gets precisely the context it needs
