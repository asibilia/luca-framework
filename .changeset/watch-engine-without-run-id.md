---
"@luca/engine": patch
---

`/luca-watch` and `/luca-unstick` now see the live engine of a run started with `luca-run --spec <n>` and no `--run-id`. The engine makes the run id itself, so no command line names it, and the watcher reported `engine_gone` for a running run. Both helpers now also count a run's engine as live while its live file (`live.json`) was written in the last minute, as the board already does (#727).
