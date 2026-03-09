---
title: "P2: Add automatic stale session lock cleanup to build system"
area: dx
created: 2026-03-04
source: repo-review audit (dx-reviewer)
priority: P2
---

## Context

The `bun run build:all` script uses a session lock at `.claude/.session-lock`. If a session crashes, the lock remains and blocks rebuilds indefinitely. The only workaround is `--force`.

## Task

1. Review `scripts/build-all.ts:29-61`
2. Add automatic cleanup for locks older than 12 hours
3. Improve error message to explain recovery options
4. Add `--cleanup-stale-locks` flag option
5. Document in troubleshooting guide

## Notes

- Lock detection code checks age (line 39-43) but only warns, doesn't auto-cleanup
- Developers can get permanently stuck if they don't know about `--force`
- Quick fix — add age check + auto-remove
