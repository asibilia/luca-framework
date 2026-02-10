---
title: Design structured complexity-gated workflow architecture
area: workflow
created: 2026-02-10
source: conversation
---

## Context

User wants a systematic architecture where workflow complexity scales with task scope. There should be a core set of steps that always run regardless of complexity, and additional steps that activate or become required based on the complexity level. This replaces ad-hoc complexity handling with a structured, principled system.

## Task

1. **Define complexity levels** — Establish clear levels (e.g., trivial, simple, moderate, complex, critical) with criteria for each
2. **Identify always-on workflow steps** — Which steps must run for every task regardless of complexity? (e.g., verification always runs)
3. **Identify complexity-gated steps** — Which steps are optional/required based on complexity? (e.g., architecture review only for complex+)
4. **Design the gating mechanism** — How does the system determine complexity? Manual override + automatic inference
5. **Build the complexity matrix** — A clear table/schema mapping: complexity level -> required steps -> optional steps -> skipped steps
6. **Implement in workflow rules** — Update skill definitions and rules to enforce the gating
7. **Document the architecture** — Clear reference for which complexity triggers which workflow

## Notes

- Core principle: every task gets verification, but not every task needs architecture review
- Complexity determination should support both manual override and dynamic inference
- The Ralph Wiggum iteration count could be tied to complexity level
- Sub-agent count/types could also scale with complexity
- Consider these as the gating dimensions:
  - Number of files affected
  - Architectural impact
  - Risk level
  - Cross-cutting concerns
  - Novelty (has this pattern been done before in MEMORY.md?)
- This is a foundational architectural decision — get it right and everything else scales cleanly
