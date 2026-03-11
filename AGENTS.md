# AGENTS.md

> Universal instructions for AI coding agents working on this repository.

## Project Overview

- **Luca is a developer tooling monorepo**, not a web app. It produces CLI tools and build artifacts for AI-powered IDE workflows (Cursor, Claude Code, etc.).
- **Primary goal**: orchestrate structured AI coding workflows (plans, phases, harness, agents/skills/rules) on top of existing repos.
- **Runtime & language**: Bun + TypeScript across a multi-package monorepo.
- **Documentation for humans**: see `README.md` and the docs under `docs/`.

## Quickstart for agents

- **Install dependencies**: `bun install`
- **Run tests**: `bun test`
- **Type check**: `bunx --bun tsc --noEmit`
- **Build core packages**: `bun run build`
- **Build full pipeline (agents/skills/rules/hooks/plugin)**: `bun run build:all`

These cover 90% of what agents need; see “Cursor Cloud specific instructions” below for more detail.

## Intent-First Response

Before responding to a request, consider what the user **actually needs**, not just what they literally asked. Then provide the best possible answer for that underlying need.

**When to surface follow-up questions:** Not every response needs them. Use this checklist:

| Signal                                                                                       | Action                                                                                         |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Request is ambiguous or underspecified                                                       | Ask clarifying questions **before** acting                                                     |
| Multiple valid approaches exist with meaningful trade-offs                                   | Present the chosen approach, note alternatives, suggest questions that would refine the choice |
| The request hints at a deeper problem (e.g., asking for a workaround when a root fix exists) | Address both the literal ask and the underlying issue; suggest follow-ups to confirm direction |
| Request is clear and straightforward                                                         | Just answer it — no follow-up questions needed                                                 |

**Format when follow-ups apply:** Append a short “Questions to go deeper” section (2-4 questions max) at the end of the response. These should help the user explore dimensions they may not have considered — architectural implications, edge cases, alternative approaches, or scope decisions.

**Do not** pad every response with follow-up questions. The goal is signal, not noise.

## Development Setup

**Prerequisite:** Bun (v1.0+). Node.js 20+ is useful but not required for core workflows.

No `.env` is required for core development; Jira-related env vars are optional and only used by the Jira adapter.

## Commands

| Command | Description |
| ------- | ----------- |
|         |             |

## Generated Files — Never Edit Directly

**CRITICAL**: The `.claude/`, `.cursor/`, and `.pi/` directories contain **generated files**. Never edit them directly — they are overwritten by `bun run build:all`.

| Generated directory | Source                                          |
| ------------------- | ----------------------------------------------- |
| `.claude/agents/`   | `src/agents/` (compiled by `src/compilers/`)    |
| `.cursor/agents/`   | `src/agents/` (compiled by `src/compilers/`)    |
| `.pi/agents/`       | `src/agents/` (compiled by `src/compilers/`)    |
| `.claude/skills/`   | `src/skills/` (compiled by `src/compilers/`)    |
| `.cursor/skills/`   | `src/skills/` (compiled by `src/compilers/`)    |
| `.pi/skills/`       | `src/skills/` (compiled by `src/compilers/`)    |
| `.claude/rules/`    | `src/rules/` (compiled by `src/compilers/`)     |
| `.cursor/rules/`    | `src/rules/` (compiled by `src/compilers/`)     |
| `.claude/hooks/`    | `src/hooks/scripts/` (copied by build pipeline) |
| `.cursor/hooks/`    | `src/hooks/scripts/` (copied by build pipeline) |

**Always edit source files in `src/`**, then run `bun run build:all` to regenerate outputs. Use `bun run check:drift` to verify built outputs match sources.

## Coding Standards

**IMPORTANT**: Read [docs/style-guide/coding-standards.md](docs/style-guide/coding-standards.md) for complete rules.

Key patterns:

- Single object argument with destructuring for functions
- `snake_case` for database/API object keys (matches Convex schema)
- `camelCase` for React component props (convert at data boundary)
- Zod schemas with `z.infer<>` for types (never separate interface + schema)
- Lodash over native array methods (import named: `import { map, filter } from 'lodash'`)
- No `any` type, no `as` type casting, no `!` assertions
- `<div>` instead of `<p>` in JSX
- File names: `kebab-case.ts`

## Domain Architecture

Every `src/` domain follows one of three archetypes:

- **Entity (A)**: agents, skills, rules — named instances with registries, entity subdirs, `__schemas/` + `__helpers/` + barrel
- **Core (B)**: memory, planner, iteration, context, shared — internal logic, `__schemas/` + `__helpers/` + barrel
- **Infrastructure (C)**: compilers, complexity, harness, hooks — build/verification, `__schemas/` + `__helpers/` + barrel + optional subdirs

Import direction follows four dependency tiers (downward only):

| Tier          | Domains                                      | May import from                    |
| ------------- | -------------------------------------------- | ---------------------------------- |
| T0 Foundation | shared, complexity                           | Nothing in src/                    |
| T1 Core       | context, planner, harness, iteration, memory | T0 only                            |
| T2 Entity     | agents, skills, rules                        | T0-T1; never cross-import          |
| T3 Build      | compilers, hooks                             | T0-T2; imported by nothing in src/ |

**Invariant**: Every domain's `index.ts` is a pure barrel — only re-export statements, no logic.

See generated rules for full details: `.claude/rules/domain-architecture.md` and `.claude/rules/module-boundary.md`.

## Testing

Use Bun's test framework:

- Location: `__tests__/*.test.ts` adjacent to source files
- Pattern: `describe`, `test`, `expect` from `bun:test`
- Run: `bun test`

## PR Guidelines

1. Run `bun build` and `bun test` before committing
2. Use `bun commit` for interactive conventional commits
3. Format: `type(scope): #issue description` (lowercase, present tense verb)
4. Branch naming: `{issue_number}--{dash-cased-description}`

## Related Files

- [docs/coding-standards.md](docs/coding-standards.md) - Complete coding standards
- [CLAUDE.md](CLAUDE.md) - Claude Code specific guidance
- `.github/copilot-instructions.md` - GitHub Copilot instructions
- `.github/agents/` - Agent persona configs
- `.github/prompts/` - Reusable prompt templates

## Cursor Cloud specific instructions

### Project context

Luca is a **developer tooling monorepo** (not a web app). There is no running web server or database. It produces CLI tools and build artifacts for AI-powered IDE workflows.

### Services & commands

| Action                                                 | Command                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| Install deps                                           | `bun install`                                                   |
| Type check                                             | `bunx --bun tsc --noEmit`                                       |
| Run tests                                              | `bun test`                                                      |
| Build packages (unbuild)                               | `bun run build`                                                 |
| Build full pipeline (agents/skills/rules/hooks/plugin) | `bun run build:all`                                             |
| Drift check (verify outputs match source)              | `bun run check:drift`                                           |
| Luca CLI                                               | `bun run packages/luca-framework/bin/luca.js <command>`         |
| State machine bridge                                   | `bun run packages/luca-framework/src/state/bridge.ts <command>` |

### Non-obvious caveats

- **Build before full test suite**: Some tests in `__tests__/scripts/` (plugin-spec, build-output, check-drift) require `bun run build:all` to have been run first — they validate built artifacts under `dist/plugin/`.
- **No ESLint**: The project has no ESLint configuration. Linting is limited to TypeScript type checking.
- **Bun is required**: The project uses `bun.lock` and `bunfig.toml`. Bun may not be pre-installed on Cloud Agent VMs — install via `curl -fsSL https://bun.sh/install | bash` if missing.
- **No `.env` required**: No environment variables are needed for core development. Jira adapter env vars (`JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`) are optional.
