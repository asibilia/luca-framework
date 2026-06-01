---
"@alecsibilia/luca": patch
---

Fix the pipeline deadlocking immediately after `roadmap create` — the first phase never activated, so no phase artifact could be written.

`luca roadmap create` reset `currentPhase` to `0` and a code comment deferred activation to "the orchestrator on the next transition" — but no command, state event, or skill step anywhere ever advances `currentPhase`. With `currentPhase=0`, `resolveActiveSlug` returns "no active phase", so the stage-gate hook can compute no canonical `.luca/phases/<slug>/` path: the researcher's `research.md` write is blocked as `code-write`, and a raw `mkdir` is blocked as `bash-mutate` — a chicken-and-egg with no channel to create the phase.

`roadmap create` now activates phase 1 immediately (`currentPhase=1` when the roadmap is non-empty, else 0). Once a roadmap exists there is always a current phase, so `resolveActiveSlug` resolves and the first artifact write is permitted.

Advancing between phases (N→N+1 as each phase completes) is handled by the companion `luca phase advance` command added in this release and wired into the `/lu` `learn`-step transition — so multi-phase roadmaps now progress end-to-end, not just single-phase ones.
