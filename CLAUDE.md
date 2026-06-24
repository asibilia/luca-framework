---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## Repo-specific guidance for agents

- **This repo is a developer tooling monorepo**, not a web app. It builds the `luca` CLI (`@alecsibilia/luca`) plus the skills, agents, and slash commands that install into a coding harness (Claude Code and Antigravity).
- **Core commands** (same as `AGENTS.md`, surfaced here for convenience):
  - Install deps: `bun install`
  - Type check: `bunx --bun tsc --noEmit`
  - Build the luca CLI: `bun run build`
- The local `.claude/` in this repo contains only `settings.local.json` and `plans/` — not generated artifacts.
- The `.luca/` directory (new) is the workflow data dir; the `.planning/` directory (legacy) still exists during the migration window — see the section below.
- **High-leverage gotchas**:
  - There is **no ESLint configuration**; linting is effectively TypeScript type checking.
  - Bun is required (repo uses `bun.lock` and `bunfig.toml`). If Bun is missing, install it before running any commands.
  - No `.env` is required for core development.

## `.luca/` Artifact Layout

Luca's pipeline writes artifacts under `.luca/` (replaces the legacy `.planning/` layout). The canonical contract lives in `@alecsibilia/luca-core` (`packages/luca-core/src/luca-dir/configs.ts`):

- **Root files**: `state.json`, `config.json`, `lock.json`, `roadmap.md` (generated), `ledger.jsonl`.
- **`phases/<NN-slug>/`** — one directory per work phase, slug is zero-padded NN plus kebab-case description. Allowed files: `research.md`, `context.md`, `plan.md`, `plan-review.md`, `verify.json`, `learn.md`, `execute/summary.md`, `execute/progress.jsonl`, `execute/waves/NN.md`, `audits/<reviewer>.md`.
- **`milestones/`** — versioned files: `v<SEMVER>-roadmap.md`, `v<SEMVER>-audit.md`, `v<SEMVER>-backlog-snapshot.{json,md}`.
- **`telemetry/<runId>.jsonl`** — per-run event logs.
- **`archive/<NN-slug>/`** — phase directories closed at milestone.
- **`tmp/<kebab-name>.json`** — ephemeral, repo-scoped CLI-handoff payloads (LLM orchestrator → `luca <cmd> --file`). Gitignored, writable in any pipelineStep, NOT a pipeline artifact. Replaces the old shared `/tmp/luca-*.json` paths that collided across repos.

**Strict allowlist**: anything outside this contract is a violation. Filenames are derived (NN order, fixed reviewer names, zero-padded waves) — the LLM never picks a path. The write surface is two tracks: freeform artifact files are written with the native `Write` tool to the canonical path, and structured/operational mutations go through the `luca` CLI. The stage-gate hook gates both — for an artifact write it allows only the legal path for the current `pipelineStep`, and it blocks direct writes outside the contract.

**Migrating from `.planning/`**: run `luca migrate-planning [--dry-run] [--force]`. It moves root files (state, lock, roadmap, config, ledger), deletes ephemerals (`.context-metrics.json`, `harness-result.json`), preserves git history via `git mv`, and refuses on uncommitted `.planning/` changes unless `--force`. Phase directories under `.planning/phases/` are intentionally left in place by the initial migration — a follow-up command handles slug normalization once the collision strategy is set.

## Response approach

See "Intent-First Response" in `AGENTS.md`. In short: think about what the user actually needs, not just what they asked. Suggest follow-up questions only when the request is ambiguous, has meaningful trade-offs, or hints at a deeper problem — not on every response.

For anything more detailed than this, prefer the main `README.md`, `AGENTS.md`, and the docs under `docs/` rather than expanding this file.

## Compact Instructions

When compacting, preserve:

- Current phase, task position, and complexity level
- Key decisions made this session with rationale
- The current approach and next planned action
- Any blockers or open questions
- File paths recently modified and why
- The MuninnDB vault name (luca-framework)
