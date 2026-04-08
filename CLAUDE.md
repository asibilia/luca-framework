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
