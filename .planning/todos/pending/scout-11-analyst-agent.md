---
title: "Scout: Create lu-scout-analyst agent"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, agents, phase-2]
---

## Context

Step 4 of the per-article pipeline. Maps the researched techniques to the Luca framework's architecture and identifies gaps, opportunities, and applicability.

## Task

Create `src/agents/general/lu-scout-analyst.agent.ts`:

1. **Tools**: Read, Grep, Glob, Write
2. **Cognition tier**: T1 (memory reader — recall project identity, architecture patterns, existing decisions)
3. **Input**: Path to enriched digest (with Related Work + Technique Deep-Dive)
4. **Process**:
   - Read the digest thoroughly
   - Scan the Luca codebase for relevant areas:
     - Read key architecture files (domain-architecture rule, module-boundary rule)
     - Search for existing implementations of similar patterns
     - Check existing todos/roadmap for related planned work
   - Produce a framework gap analysis:
     - What does Luca do today in the article's domain?
     - What could be improved based on the article's techniques?
     - What's the estimated effort for each improvement?
   - Assess overall relevance score: HIGH / MEDIUM / LOW
5. **Output**: Writes `docs/scouting/impact/{date}-{slug}-impact.md` using the impact analysis template
6. **MuninnDB recall**: Query repo vault for relevant `pattern:*`, `decision:*`, `pitfall:*` to avoid recommending things already tried or rejected

## Notes

- This agent needs deep codebase context — it's reading source files, rules, architecture docs
- Gap analysis should be specific: "src/workflow/ currently does X, article suggests Y which would improve Z"
- Effort estimates use T-shirt sizes: XS / S / M / L / XL
- The "Applicable Patterns" section maps article patterns to specific Luca domains
- Implementation Approaches section is left empty — filled by Stage 5
