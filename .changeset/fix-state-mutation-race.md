---
"@alecsibilia/luca": patch
---

Fix `.luca/state.json` corruption / step-reversion under concurrent agents. A live `/lu` run saw `pipelineStep` revert (the verifier read `checks` while the orchestrator had advanced to `verify`): state mutations did an unlocked read-modify-write, so a concurrent or stale-state write from a subagent could clobber the orchestrator's update, and `loadCurrentState` silently returns schema defaults (`idle`, `currentPhase: 0`) on any read hiccup.

- New `mutateState` / `withStateLock` helpers serialize every `state.json` write behind an exclusive on-disk lock (with stale-lock stealing so a crashed holder can't deadlock). `state-advance`, `roadmap-create`, `phase-advance`, and `workflow-reset` now go through them — verified: 30 concurrent mutations land 30 updates with zero losses.
- `mutateState` reads strictly: it **refuses to mutate** when `state.json` is missing or malformed rather than overwriting an active workflow with defaults.
- Subagent shared prefix now forbids state-mutating `luca` commands (`state advance`, `roadmap create`, `phase advance`/`archive`, `workflow reset`) — pipeline state is the orchestrator's; subagents read state and write only their one artifact.
- Added `state.json.lock` to the `.luca/` contract so the structural scanner treats the transient lock as legitimate.
