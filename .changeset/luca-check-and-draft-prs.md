---
"@luca/engine": patch
---

New `luca check` command: it runs the checks in the current repo's `.luca/config.json` (test, slow_test, types, lint), the same code as Luca's PR check, with `--only <names>` (for example `--only lint,types`) and `--skip-slow`. It exits 1 if any check failed and prints a short summary. Use it from a repo's `.githooks/pre-push`. Inside a Luca run, `LUCA_SKIP_HOOKS=1` is set for every process the run starts, so hooks that check it skip the checks the run's gates already ran, and the engine's pushes pass `--no-verify` like its commits. Luca now opens a run's pull request as a draft and marks it ready for review once the final review passed, so a repo's PR check that skips drafts runs once per run. A shipped final review's PR stays a draft for you to mark ready.
