# Project Project Brain

> Auto-generated from brain.json. Do not edit directly — use the memory bridge.

## Project Identity


## Stack

- **Language**: TypeScript (CLI installer), Markdown (agents, skills, workflows)
- **Framework**: Cursor IDE agent framework (MCP integration)
- **Testing**: bun:test

## Architecture

- **Pattern**: Orchestrator/sub-agent model with memory system
- **Source of Truth**: `src/` directory contains all agent, skill, rule, and hook source files
- **Build Pipeline**: `src/` → `bun run build:all` → `.claude/` + `.cursor/` (generated outputs, NEVER edit directly)
- **Drift Prevention**: Pre-commit hook + `bun run check:drift` + CI test suite detect output/source divergence
- **Structure**:
  - `src/agents/` — Agent source (.agent.ts) → compiled to `.claude/agents/` + `.cursor/agents/`
  - `src/skills/` — Skill source (.skill.ts) → compiled to `.claude/skills/` + `.cursor/skills/`
  - `src/rules/` — Rule source (.rule.ts) → compiled to `.claude/rules/` + `.cursor/rules/`
  - `src/hooks/` — Hook registry + shell scripts → compiled to `.claude/hooks/` + `.cursor/hooks/`
  - `src/compilers/` — Compilation logic and plugin manifest schemas
  - `src/complexity/` — Complexity gating system (five levels, three tiers)
  - `src/context/` — Context tier management (T0-T3)
  - `src/harness/` — Verification harness (test/typecheck/lint/build runners)
  - `src/iteration/` — Iteration engine (budget, classifier, convergence, checkpoint)
  - `src/*/__schemas/` — Shared Zod schemas per domain (internal infrastructure, `__` prefix)
  - `src/*/__helpers/` — Shared utilities per domain (internal infrastructure, `__` prefix)
  - `src/*/index.ts` — Registries mapping entity names to classes/metadata
  - `.planning/` — Runtime artifacts (BRAIN, MEMORY, WORKING, STATE)
  - `packages/luca-framework/templates/` — Scaffolding templates for `luca init`
- **Import Conventions**: `~/` alias for cross-domain imports (resolves to `src/`), `./` for same-domain
- **Key Modules**:
  - Memory system (BRAIN.md → MEMORY.md → WORKING.md)
  - Workflow engine (skills → agents → verification → learning)
  - Git integration (Jira → GitHub Issue → Branch → PR)
  - Iteration engine (src/iteration/ — budget, classifier, convergence, checkpoint)

---

_Last updated: 2026-03-03T15:27:29.000Z_
