# AGENTS.md

> Universal instructions for AI coding agents working on this repository.

## This repo

- **Old Luca is gone.** The `luca` CLI and its packages (`packages/luca`, `luca-cli`, `luca-core`, `luca-tools`, `luca-code`) have been deleted, along with the npm release workflow and changesets, so old Luca no longer publishes to npm. The last old-Luca code is at the tag `old-luca-final`. To read or copy from it, run `git show old-luca-final:<path>`, or check the tag out in a separate worktree.
- **New work goes in `packages/engine`.**
- **Read these before you build.** `CONTEXT.md` has the domain words. The plan is the wayfinder map, issue #325, "Map: Luca v1 on Paseo + Claude Code".
- `.luca/config.json` is the engine's config: check commands, test file patterns, test setup files, rule files, and `muninn.vault` (the project's memory vault; memory tooling reads it at that path). Old Luca's data that used to live in `.luca/` is at the tag `old-luca-final`.

## Setup

- Bun is required. The repo uses `bun.lock` and `bunfig.toml`. If Bun is missing, install it with `curl -fsSL https://bun.sh/install | bash`.
- Use Bun instead of Node.js, npm, yarn, or pnpm: `bun <file>`, `bun install`, `bun run <script>`. Bun loads `.env` by itself, so don't use dotenv.
- No `.env` is needed.

| Action | Command |
| ------ | ------- |
| Install deps | `bun install` |
| Type check | `bunx --bun tsc --noEmit` |
| Lint | `bun run lint` |
| Interactive conventional commit | `bun run commit` |

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

1. Run `bunx --bun tsc --noEmit` before committing
2. Use `bun run commit` for interactive conventional commits
3. Format: `type(scope): #issue description` (lowercase, present tense verb)
4. Branch naming: `{issue_number}--{dash-cased-description}`
