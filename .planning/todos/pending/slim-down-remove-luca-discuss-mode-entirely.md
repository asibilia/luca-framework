---
title: "Slim-down: remove luca:discuss mode entirely"
area: workflow
created: 2026-05-12
priority: medium
source: workflow-slim-down
---

## Task

Slim-down: remove luca:discuss mode entirely

---
confidence: high
externalResearch: false
priority: 2
---

# Context

User confirmed: never used. Discussion behavior absorbed into `/backlog-groom`
and plan-mode triage interrogation. Removing it shrinks the mode surface.

## Scope

- Delete `src/instructions/discuss.md` (and any subagent variant).
- Remove `luca:discuss` from mode list in `mode-runner.ts` and tool-manifest.
- Remove `discuss` from `pipelineOrder` if present.
- Update any docs/README references.

## Acceptance

- Mode list contains 4 luca:N modes only (plan / execute / verify / finalize).
- `switch-mode` rejects `luca:discuss` with a clear "removed in v12" error.
- Tests updated.

## Depends on

- luca:1-plan mode todo (must land first so grooming substep absorbs the use case).

