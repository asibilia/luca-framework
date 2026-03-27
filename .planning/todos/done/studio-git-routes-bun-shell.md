---
title: "Fix git routes using Bun.$ in Next.js runtime"
area: api
created: 2026-03-27
source: conversation
priority: P1
estimated_size: S
---

## Context

During Phase 208 live testing, `POST /api/git/publish` returned 500 with `"Bun is not defined"`. The git publish route uses `Bun.$` tagged template literals for shell commands, but Next.js API routes run in Node.js runtime, not Bun. The sidecar runs in Bun, but API routes do not.

## Task

Replace `Bun.$` usage in git routes with Node.js-compatible alternatives:

- `packages/luca-studio/app/api/git/publish/route.ts`
- `packages/luca-studio/app/api/git/revert/route.ts`
- `packages/luca-studio/app/api/git/history/route.ts`

Options:

1. Use `child_process.execSync` / `exec` (standard Node.js)
2. Move git operations to the Bun sidecar (keeps Bun.$, adds sidecar routes)
3. Use `execa` or similar cross-runtime shell library

## Notes

- Pre-existing issue, not introduced by Phase 208
- Affects all git-related Studio features (publish, revert, history)
- The sidecar approach (option 2) is cleanest — keeps git shell commands in Bun runtime
