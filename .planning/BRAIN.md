# Project Brain

> This file captures the project's identity, conventions, and personality. It's loaded at session start to provide cognitive context.

## Identity

- **Project**: Luca Framework
- **Domain**: Developer tooling / AI-assisted development
- **Purpose**: Package the Luca workflow system into a distributable agent framework that any team can install and customize
- **Vision**: Become the standard way teams adopt structured AI-assisted development workflows

## Stack

- **Language**: TypeScript (CLI installer), Markdown (agents, skills, workflows)
- **Framework**: Cursor IDE agent framework (MCP integration)
- **Database**: File-based (.planning/ artifacts, JSON config)
- **Key Dependencies**: Node.js 18+, Cursor IDE, Git, GitHub CLI (optional)

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

## Conventions

### Code Style

- TypeScript with strict mode
- Functional patterns (no classes) — see `no-classes.mdc`
- Single object argument with destructuring for functions
- Zod schemas for all data parsing — see `schema-first-parsing.mdc`
- Lodash over native array methods

### File Naming

- `kebab-case.ts` for all files — see `file-naming.mdc`
- `UPPERCASE.md` for planning artifacts (BRAIN, MEMORY, WORKING, STATE)
- `lu-*.md` prefix for framework agents

### Commit Format

- Conventional commits: `type(scope): description`
- Types: feat, fix, docs, refactor, test, chore
- Scope: cli, agents, skills, workflows, config

### Testing

- Verification-based (lu-verifier agent)
- EXISTS → SUBSTANTIVE → WIRED verification levels
- Learning capture after verification

## Personality

### Communication Style

- Concise, direct, no filler
- Technical accuracy over validation
- Show progress with visual banners
- Use structured output (tables, code blocks)

### Development Preferences

- Ship fast, learn, iterate
- Plans are prompts (PLAN.md IS the prompt)
- Stop before quality degrades (50% context limit)
- Always verify, always capture learnings

## Team Context

- **Team Size**: Solo developer + AI
- **Workflow**: Unified `/lu` entry point → routing → execution → verification → learning
- **Review Process**: Configurable approval gates (plans, destructive, external)

---

_Last updated: 2026-02-11_
_Updated by: drift-prevention (Phase 17)_
