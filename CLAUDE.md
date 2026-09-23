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

## This repo

- **Old Luca is gone.** The `luca` CLI and its packages (`packages/luca`, `luca-cli`, `luca-core`, `luca-tools`, `luca-code`) have been deleted, along with the npm release workflow and changesets. The last old-Luca code is at the tag `old-luca-final`. To read or copy from it, run `git show old-luca-final:<path>`, or check the tag out in a separate worktree.
- **New work goes in `packages/engine`.**
- **Read these before you build.** `CONTEXT.md` has the domain words. The plan is the wayfinder map, issue #325, "Map: Luca v1 on Paseo + Claude Code".
- `.luca/config.json` is the engine's config: check commands, test file patterns, test setup files, rule files, and `muninn.vault` (the project's memory vault; memory tooling reads it at that path). Old Luca's data that used to live in `.luca/` is at the tag `old-luca-final`.
- Install deps: `bun install`. Type check: `bunx --bun tsc --noEmit`.

## Response approach

See "Intent-First Response" in `AGENTS.md`. In short, think about what the user actually needs, not just what they asked. Suggest follow-up questions only when the request is ambiguous, has meaningful trade-offs, or hints at a deeper problem. Don't add them to every response.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
