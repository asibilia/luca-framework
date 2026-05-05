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

- **This repo is a developer tooling monorepo**, not a web app. It builds Luca's CLI (`luca-framework`) and custom Mastra Code harness (`luca-mastracode`).
- **Core commands** (same as `AGENTS.md`, surfaced here for convenience):
  - Install deps: `bun install`
  - Type check: `bunx --bun tsc --noEmit`
  - Build luca-framework: `bun run build`
  - Run mastracode: `bun run mastracode`
- The local `.claude/` in this repo contains only `settings.local.json` and `plans/` — not generated artifacts.
- **High-leverage gotchas**:
  - There is **no ESLint configuration**; linting is effectively TypeScript type checking.
  - Bun is required (repo uses `bun.lock` and `bunfig.toml`). If Bun is missing, install it before running any commands.
  - No `.env` is required for core development.

## `.planning/` Artifact Layout

Luca's pipeline uses a two-tier directory contract under `.planning/` (post-#220):

- **Root** = cross-phase state: `luca-state.json`, `.luca-lock.json`, `ROADMAP.md`, `config.json`, `todos/`, JSONL audit logs (`session-ledger.jsonl`, `routing-history.jsonl`, `verification-history.jsonl`, `confidence-journal.jsonl`).
- **`.planning/phases/<currentPhaseSlug>/`** = session-scoped artifacts: `PLAN.md`, `RESEARCH.md`, `CONTEXT.md`, `POSTMORTEM.md`, `REVIEW-{n}.md`, `SESSION-ARCHIVE.md`, `SUGGESTED-RULES.md`, `CONFIDENCE-JOURNAL.md`, `verification-result.json`, `checks-convergence.json`, `*-capture-*.md`, and `runs/<runId>/` (archived prior runs).

Triage derives the slug from the work intent and persists it in state. `writePlanningFile`, `manageRoadmap`, and the state modules auto-route based on `currentPhaseSlug` — pass a bare basename and the writer resolves the directory.

**Migration**: legacy repos with loose root artifacts can run `workflowState({action:"archive-loose"})` to migrate them into `phases/<currentPhaseSlug>/`. The action refuses if the pipeline lock is held by another live PID or if no slug is set. See `docs/troubleshooting.md` → "Migrating a legacy `.planning/` layout".

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
