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
- **Structure**:
  - `.cursor/agents/` — Sub-agent definitions
  - `.cursor/skills/` — User-invokable skills (commands)
  - `.cursor/origin/` — Templates, workflows, references
  - `.cursor/rules/` — Cursor rules for consistent behavior
  - `.planning/` — Runtime artifacts (BRAIN, MEMORY, WORKING, STATE)
- **Key Modules**:
  - Memory system (BRAIN.md → MEMORY.md → WORKING.md)
  - Workflow engine (skills → agents → verification → learning)
  - Git integration (Jira → GitHub Issue → Branch → PR)

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

*Last updated: 2026-02-04*
*Updated by: lu-new-project*
