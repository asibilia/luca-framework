---
"@alecsibilia/luca": patch
---

Add `luca phase advance` to close the phase-lifecycle gap for multi-phase roadmaps. Nothing advanced `currentPhase` between phases, so after phase 1 a multi-phase roadmap stalled at the 1→2 boundary (every phase-2 artifact path resolved against the wrong/no slug). The new command bumps `currentPhase → currentPhase+1`, marks the finished phase `complete` and the next `in-progress`, and errors if no phase is active or already at the final phase. It's registered as a `luca-write` verb in the stage-gate bash classifier, and the `/lu` orchestrator now calls it at the `learn` step (when more phases remain) before advancing to `plan` for the next phase.
