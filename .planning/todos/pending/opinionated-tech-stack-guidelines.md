---
title: Opinionated tech stack code style guidelines structure
area: workflow
created: 2026-02-12
source: conversation
---

## Context

Luca's code style rules (`.claude/rules/`) currently contain TypeScript-specific opinions (lodash preference, no-classes, schema-first parsing, Bun preference, etc.) that originated from a TS project. As Luca targets adoption across different tech stacks, these guidelines need to be organized under named tech stack profiles so they're portable, discoverable, and opt-in.

The `lu-map-codebase` skill already produces `.planning/codebase/STACK.md` (detected technologies) and `CONVENTIONS.md` (observed code patterns) during brownfield initialization. This creates a natural integration point: the detected stack could auto-select the appropriate opinionated guideline set.

## Task

1. **Define tech stack profiles** — Create a structure for common tech stacks:
   - `typescript` (current rules migrate here: lodash-preference, no-classes, schema-first-parsing, bun-preference, import-standards, etc.)
   - `python` (placeholder: PEP 8, typing conventions, etc.)
   - `go` (placeholder: Go idioms, error handling patterns, etc.)
   - `rust` (placeholder)
   - Additional stacks as needed

2. **Restructure existing rules** — Move current opinionated code style rules under a `typescript` tech stack profile while keeping universal rules (file-naming, mandatory-documentation, functional-api-reuse) at the top level

3. **Config toggle** — Add a config setting (e.g., `workflow.opinionated_guidelines: true|false`) that enables/disables the tech stack code style guides entirely. When disabled, only universal project-management rules apply — no language-specific opinions are injected.

4. **Integration with `lu-map-codebase`** — Explore how the codebase mapper's stack detection (`STACK.md`) can auto-select the matching guideline profile:
   - Option A: Mapper detects stack → writes `tech_stack: typescript` to config → build system includes matching guidelines
   - Option B: Mapper produces STACK.md → cognitive pre-flight loads relevant guideline set at session start
   - Option C: User explicitly selects stack profile during `/lu-new-project`, mapper validates the choice

5. **Build system changes** — The compiler that produces `.claude/rules/` and plugin output needs to conditionally include/exclude guidelines based on the selected stack profile and the config toggle

## Notes

- Current opinionated rules that should move under `typescript`: `lodash-preference`, `no-classes`, `schema-first-parsing`, `bun-preference`, `use-bun-instead-of-node-vite-npm-pnpm`, `import-standards`, `api-snake-case`
- Universal rules that stay at top level: `file-naming`, `mandatory-documentation`, `functional-api-reuse`, `cursor_rules`, `self_improve`, `complexity-gating`, `lu-workflow`, `harness-verification`, `hook-skill-boundary`, `atlassian-mcp`, `posthog-integration`
- The `lu-map-codebase` skill spawns 4 parallel agents — one of them already analyzes "tech" (frameworks, languages). This agent's output could drive guideline selection
- Consider whether mixed-stack projects (e.g., TypeScript frontend + Python backend) need multiple profiles active simultaneously
- The config toggle should default to `true` (opinionated on) for new projects but be easily disabled for teams that bring their own style guides
