---
title: "Git rollback (batch-commit-on-publish with [studio-edit] prefix)"
area: tooling
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: []
phase: studio-w8
estimated_size: M
priority: P3
---

## Context

Users need a way to undo Studio edits at the git level. Rather than committing on every save (which pollutes git history), the Studio batches changes and commits on "publish" with a `[studio-edit]` prefix. This enables a Config History view and per-file rollback.

## Task

Implement git rollback support:

- **Batch commit on publish:** When the user clicks "Publish" (triggers compilation), create a git commit with all changed files using `[studio-edit] <description>` prefix. Uses `Bun.$` shell commands -- no new dependencies.
- **Config History view:** `git log --grep="[studio-edit]"` to list all Studio-originated commits. Display as a timeline with commit message, date, and file count.
- **Revert to version:** `git checkout <sha> -- <file>` for per-file rollback. Show confirmation dialog with diff preview before reverting.
- Handle edge cases: uncommitted changes in working tree, merge conflicts, detached HEAD.

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (Rollback via Git section) and `docs/brainstorm/observer-studio-rework/9.research-frontend-tech.md` (R13) for the batch-commit-on-publish design.

## Key Files

- New: `packages/luca-studio/lib/git-rollback.ts`
- New: `packages/luca-studio/app/api/git/history/route.ts`
- New: `packages/luca-studio/app/api/git/revert/route.ts`
- New: `packages/luca-studio/components/settings/config-history.tsx`

## Verification

- Publishing creates a git commit with `[studio-edit]` prefix
- Config History lists only Studio-originated commits
- Revert to version restores the selected file version
- Confirmation dialog shows diff before reverting
- Working tree state is handled gracefully
