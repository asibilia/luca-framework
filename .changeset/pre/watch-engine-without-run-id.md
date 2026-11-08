---
"@luca/engine": patch
---

`/luca-watch` and `/luca-unstick` now see the live engine of a run started with `luca-run --spec <n>` and no `--run-id`. The engine makes the run id itself, so no command line names it, and the watcher reported `engine_gone` for a running run (#727). The engine now writes its pid into the run's live file (`live.json`), and both helpers count the engine as live exactly while that pid runs, so a laptop asleep for minutes doesn't look like a gone engine, and an engine that just stopped doesn't look live. A live file from an older engine, with no pid, still counts while it was written within a minute of now.
