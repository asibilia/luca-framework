---
"@alecsibilia/luca": patch
---

/lu Triage: pass scope signals to `luca classify` and treat the heuristic as a floor.

The Triage step called `luca classify --task ... --json` with no scope signals, starving the heuristic (estimatedFileCount=0, no domains/concerns) so it scored on description keywords alone and systematically under-rated work — deep single-file design/tuning tasks scored TRIVIAL. The orchestrator instructions now pass `--files/--domains/--concerns/--breaking` and frame the heuristic baseline as a floor, not a ceiling: take the higher of heuristic vs judgment, and always re-judge a TRIVIAL result. Instruction-wording change only; no heuristic code or keyword list changed.
