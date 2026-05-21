---
title: Dogfood build stability — consume own plugin during development without mid-session breakage
area: build
created: 2026-02-13
source: conversation
---

## Context

This project develops a framework (Luca) AND uses that framework to do the development itself. This creates a bootstrapping problem: changes to the framework's source code can break the active development workflow mid-session if the plugin gets rebuilt while in use.

## Task

Set up a stable dogfooding build workflow with two guarantees:

### 1. Project consumes its own Claude Code plugin

- The repo should install/link its own compiled plugin output so that Luca skills, hooks, and rules are available during development
- This means the `.claude/` directory (or plugin mount) is populated from the framework's own build output
- Equivalent to `bun link` or a workspace self-reference so changes flow through after an intentional rebuild

### 2. Plugin code is NOT rebuilt mid-development session

- While actively working (running skills, hooks, etc.), the compiled plugin artifacts should be frozen
- A rebuild should only happen when explicitly triggered (e.g., `bun run build:plugin` or a dedicated script)
- This prevents the scenario where editing framework source files triggers a watch/auto-rebuild that corrupts the active session's skill definitions, hooks, or rules
- Consider: a `dev` vs `build` mode distinction, or a lockfile/snapshot approach

### Potential Approach

- **Workspace self-consumption**: Add the plugin output as a workspace dependency or symlink
- **Explicit rebuild script**: `bun run rebuild-plugin` that compiles and installs into `.claude/`
- **Guard against auto-rebuild**: Ensure no file watchers or hooks trigger plugin recompilation during active development
- **Snapshot on session start**: Copy compiled artifacts to a stable location at session start; live source changes don't affect the running session

## Notes

- Related to "Package Luca as a Claude Code plugin" todo (distribution side) — this is the development-time consumption side
- Related to "v1.3.0 audit tech debt" todo (build cleanup) — stable dogfooding depends on clean build pipeline
- The current build system already has `build-all.ts`, `check-drift.ts` — need to understand what triggers rebuilds today
- This is a prerequisite for comfortable iteration on the framework itself
