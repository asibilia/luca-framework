# AGENTS.md

> Universal instructions for AI coding agents working on this repository.

## Project Overview

- **Luca is a developer tooling monorepo**, not a web app. It produces a CLI tool (`luca`) and a custom Mastra Code harness (`luca-mastracode`) for AI-powered development workflows.
- **Primary goal**: orchestrate structured AI coding workflows (pipeline modes, subagents, tools) on top of existing repos.
- **Runtime & language**: Bun + TypeScript across a multi-package monorepo.
- **Documentation for humans**: see `README.md` and the docs under `docs/`.

## Quickstart for agents

- **Install dependencies**: `bun install`
- **Type check**: `bunx --bun tsc --noEmit`
- **Build luca-framework**: `bun run build`
- **Run mastracode harness**: `bun run mastracode`

## Packages

| Package | Description |
| ------- | ----------- |
| `packages/luca-framework` | CLI tool (`luca`) — init, vault setup, MuninnDB management, doctor diagnostics |
| `packages/luca-mastracode` | Custom Mastra Code distribution with pipeline modes, subagents, and tools |
| `packages/luca-studio` | Next.js UI for project visualization and configuration |

## Intent-First Response

Before responding to a request, consider what the user **actually needs**, not just what they literally asked. Then provide the best possible answer for that underlying need.

**When to surface follow-up questions:** Not every response needs them. Use this checklist:

| Signal                                                                                       | Action                                                                                         |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Request is ambiguous or underspecified                                                       | Ask clarifying questions **before** acting                                                     |
| Multiple valid approaches exist with meaningful trade-offs                                   | Present the chosen approach, note alternatives, suggest questions that would refine the choice |
| The request hints at a deeper problem (e.g., asking for a workaround when a root fix exists) | Address both the literal ask and the underlying issue; suggest follow-ups to confirm direction |
| Request is clear and straightforward                                                         | Just answer it — no follow-up questions needed                                                 |

**Format when follow-ups apply:** Append a short "Questions to go deeper" section (2-4 questions max) at the end of the response. These should help the user explore dimensions they may not have considered — architectural implications, edge cases, alternative approaches, or scope decisions.

**Do not** pad every response with follow-up questions. The goal is signal, not noise.

## Development Setup

**Prerequisite:** Bun (v1.0+). Node.js 20+ is useful but not required for core workflows.

No `.env` is required for core development.

## Commands

| Action | Command |
| ------ | ------- |
| Install deps | `bun install` |
| Type check | `bunx --bun tsc --noEmit` |
| Build luca-framework | `bun run build` |
| Run mastracode harness | `bun run mastracode` |
| Luca CLI | `bun run packages/luca-framework/bin/luca.js <command>` |
| Release locally | `bun run release:local` |

## Coding Standards

**IMPORTANT**: Read [docs/guides/coding-standards.md](docs/guides/coding-standards.md) for complete rules.

Key patterns:

- Single object argument with destructuring for functions
- `snake_case` for database/API object keys (matches Convex schema)
- `camelCase` for React component props (convert at data boundary)
- Zod schemas with `z.infer<>` for types (never separate interface + schema)
- No `any` type, no `as` type casting, no `!` assertions
- File names: `kebab-case.ts`

## PR Guidelines

1. Run `bun run build` and `bunx --bun tsc --noEmit` before committing
2. Use `bun commit` for interactive conventional commits
3. Format: `type(scope): #issue description` (lowercase, present tense verb)
4. Branch naming: `{issue_number}--{dash-cased-description}`

## `.planning/` Artifact Layout

Luca's pipeline writes artifacts under `.planning/`. As of #220 the directory follows a **two-tier contract**:

- **Root `.planning/` — cross-phase state** (one set per project, mutated across every phase):
  - `luca-state.json`, `.luca-lock.json`
  - `ROADMAP.md`, `config.json`
  - `todos/{pending,backlog,done}/`
  - JSONL audit logs: `session-ledger.jsonl`, `routing-history.jsonl`, `verification-history.jsonl`, `confidence-journal.jsonl`

- **`.planning/phases/<currentPhaseSlug>/` — session-scoped artifacts** (one directory per pipeline run; slug derived by triage from the work intent and persisted in `luca-state.json`):
  - `PLAN.md`, `RESEARCH.md`, `CONTEXT.md`
  - `POSTMORTEM.md`, `REVIEW-{n}.md`, `SESSION-ARCHIVE.md`, `SUGGESTED-RULES.md`
  - `CONFIDENCE-JOURNAL.md`, `verification-result.json`, `checks-convergence.json`
  - `*-capture-*.md` (plan-review captures, research captures)
  - `runs/<runId>/` (archived prior runs)

Pipeline tools (`writePlanningFile`, `manageRoadmap`, state modules) auto-route by reading `currentPhaseSlug` from state — pass a bare basename (e.g. `"PLAN.md"`) and the writer resolves the correct directory. `scope:"root"` is only needed when bypassing auto-routing.

**Migrating a legacy `.planning/` layout** (loose root artifacts from before #220): run `workflowState({action:"archive-loose"})` from inside an active pipeline session. The action moves stragglers into `phases/<currentPhaseSlug>/`. It refuses if the lock is held by another live PID or if `currentPhaseSlug` is unset. See `docs/troubleshooting.md` for details.

## Related Files

- [docs/guides/coding-standards.md](docs/guides/coding-standards.md) - Complete coding standards
- `.github/copilot-instructions.md` - GitHub Copilot instructions
- `.github/agents/` - Agent persona configs
- `.github/prompts/` - Reusable prompt templates

## Non-obvious caveats

- **No ESLint**: The project has no ESLint configuration. Linting is limited to TypeScript type checking.
- **Bun is required**: The project uses `bun.lock` and `bunfig.toml`. Bun may not be pre-installed on Cloud Agent VMs — install via `curl -fsSL https://bun.sh/install | bash` if missing.
- **No `.env` required**: No environment variables are needed for core development.
