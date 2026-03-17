# Phase 188 Context — GitHub Actions Publish Workflow

## Gray Area 1: Workflow Trigger [researched]

**Decision:** Trigger on `release` event with type `published`. This is the standard GitHub pattern for npm publish workflows.

## Gray Area 2: Package Scope and Access [researched]

**Decision:** Publish `@alecsibilia/luca-framework` from `packages/luca-framework/` with `--access restricted`. Use `NPM_TOKEN` repository secret.

## Gray Area 3: Pre-publish Checks [researched]

**Decision:** Run `bun install` and `bunx --bun tsc --noEmit` before publishing. No test step (tests are currently disabled).

---

_Context created: 2026-03-17 — auto mode, full-auto oversight_
