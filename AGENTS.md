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
| Run tests (on-demand only — not in pre-commit) | `bun run --filter '*' test` |
| Build luca-framework | `bun run build` |
| Run mastracode harness | `bun run mastracode` |
| Luca CLI | `bun run packages/luca-framework/bin/luca.js <command>` |
| Migrate `.planning/` → `.luca/` | `luca migrate-planning [--dry-run] [--force]` |
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

## `.luca/` Artifact Layout

Luca's pipeline writes artifacts under `.luca/`. The canonical contract is defined in `@alecsibilia/luca-core` (`packages/luca-core/src/luca-dir/configs.ts`):

- **Root files** (cross-phase state):
  - `state.json` — workflow state (pipelineStep, currentPhase, iteration counters)
  - `config.json` — project config (vault, oversight defaults)
  - `lock.json` — pipeline lock (PID + acquired_at)
  - `roadmap.md` — **generated** from MuninnDB-backed roadmap
  - `ledger.jsonl` — append-only session events

- **`phases/<NN-slug>/`** — one directory per work phase. Slug is zero-padded NN plus kebab-case description (derived from roadmap order, **not** LLM-named). Allowed files:
  - `research.md`, `context.md`, `plan.md`, `plan-review.md`
  - `verify.json`, `learn.md`
  - `execute/summary.md`, `execute/progress.jsonl`, `execute/waves/NN.md`
  - `audits/<reviewer>.md` (reviewer = `code-review`, `security`, `architect`, `ux`, etc.)

- **`milestones/`** — versioned snapshot files: `v<SEMVER>-roadmap.md`, `v<SEMVER>-audit.md`, `v<SEMVER>-backlog-snapshot.{json,md}`.

- **`telemetry/<runId>.jsonl`** — per-run event logs.

- **`archive/<NN-slug>/`** — phase directories closed at milestone (frozen, never resurfaces).

**Strict allowlist.** Anything not in the contract is a violation. Backlog/todos no longer live on disk — they're in MuninnDB (per-milestone snapshots are exported to `milestones/v<SEMVER>-backlog-snapshot.{json,md}`). Path validation is exposed via `isValidLucaPath` in `@alecsibilia/luca-core/luca-dir`.

**Migrating from `.planning/`** (legacy layout): run `luca migrate-planning [--dry-run] [--force]`. Moves root files, deletes ephemeral files (`.context-metrics.json`, `harness-result.json`), preserves git history via `git mv`. Phase directories under `.planning/phases/` are intentionally left in place by the initial migration.

## Claude Code-first Architecture (v13+)

`luca init` wires three layers into the project. The write surface is a two-track
design — both tracks share one deterministic core and one enforcing hook:

1. **`.luca/` directory** — the workflow state, schema-validated by `@alecsibilia/luca-core`.
2. **Stage-gate hook** (`.claude/hooks/stage-gate.sh` + `.claude/settings.json` PreToolUse registration) — `luca hook stage-gate` enforces a coarse-phase × tool-category matrix on every Edit/Write/Bash. Always-denied paths (.git/, ~/.claude/, /etc/, …) are blocked regardless of phase. Bash commands are tokenized via shell-quote AST so output redirects + cp/mv targets are checked against the path matrix — defeating the temp-file exfiltration pattern. For an Edit/Write under `.luca/phases/`, the hook computes the legal artifact path for the current `pipelineStep` and allows **only** an exact match — making the native `Write` tool the safe channel for freeform artifact files (plan, research, context, plan-review, summary, wave, audit, learn, verify.json). Writes to `.luca/` root files are blocked.
3. **`luca` CLI** — a typed Bash-invoked CLI (`src/commands/write-surface/`, registered in `src/cli.ts`) handles structured/operational mutations: `luca state advance`, `luca roadmap create`, `luca todo add`, `luca preferences write`, `luca checks run`, etc. Each leaf self-checks its phase precondition against `.luca/state.json`. The CLI never writes freeform artifact files — those go through the `Write` tool above.

**Two tracks, one guard.** Freeform artifact files → native `Write` tool, gated by the hook's per-step artifact-path check. Structured mutations → `luca` CLI, which self-enforces per-verb phase rules. The runtime-agnostic handlers live in `src/write-surface/`; the CLI commands front them. Together this makes the workflow discipline impossible to bypass without `--dangerously-skip-permissions`. (v13 replaced the former MCP server — see `docs/v13-write-surface-migration.md` for the historical migration plan.)

### Phase skills + subagents

Bundled with the npm package under `packages/luca-framework/skills/`:

- `commands/phase-{discuss,plan,execute}.md` — slash commands the user invokes; orchestrate state advances (via the `luca` CLI), artifact writes (via the `Write` tool to canonical paths), and subagent delegation.
- `agents/luca-{executor,planner,reviewer}.md` — Claude Code subagent definitions that do the cognitive/code-writing work.

`luca init` copies these into `<project>/.claude/commands/` and `.claude/agents/`. **Re-running `luca init` always overwrites with the bundled versions** — the package is the source of truth; user customizations should be made by adding NEW files (not modifying the bundled ones).

### Adding a new write-surface command

1. Add a runtime-agnostic handler in `packages/luca-framework/src/write-surface/handlers/luca-<name>.ts` (Zod input schema + `(args, ctx) => Promise<WriteResult>` handler).
2. Wire it into the appropriate noun-group command under `packages/luca-framework/src/commands/write-surface/<noun>.ts` as a leaf `defineCommand`, and ensure the noun group is registered in `src/cli.ts`.
3. Give every leaf a strong `meta.description` + `args` — the `--help` text is the discoverability surface.
4. Run `bunx --bun tsc --noEmit` to verify.

Freeform artifact files do **not** get a CLI command — they are written with the native `Write` tool and gated by the stage-gate hook's per-step artifact-path check.

### Adding a new phase skill

1. Write `packages/luca-framework/skills/commands/<name>.md` with frontmatter (name, description) and instructions that name the right `luca` CLI subcommands and/or the `Write`-to-canonical-path convention.
2. Skills are markdown — they're prompts, not code. The discipline is in the `luca` CLI + stage-gate hook they delegate to, not the markdown.
3. `luca init` will pick the new skill up automatically (re-run it in your project to install).

### Mastracode coexistence

`luca-mastracode` is still in the tree and `luca run` still spawns it the old way. The new Claude Code-first path runs through the bundled skills + the `luca` CLI write surface. The two paths are independent; you can use either in a given project. Mastracode-resident skills + subagents will be ported individually in follow-up PRs.

## Related Files

- [docs/guides/coding-standards.md](docs/guides/coding-standards.md) - Complete coding standards
- `.github/copilot-instructions.md` - GitHub Copilot instructions
- `.github/agents/` - Agent persona configs
- `.github/prompts/` - Reusable prompt templates

## Non-obvious caveats

- **No ESLint**: The project has no ESLint configuration. Linting is limited to TypeScript type checking.
- **Bun is required**: The project uses `bun.lock` and `bunfig.toml`. Bun may not be pre-installed on Cloud Agent VMs — install via `curl -fsSL https://bun.sh/install | bash` if missing.
- **No `.env` required**: No environment variables are needed for core development.
