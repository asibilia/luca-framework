---
"@alecsibilia/luca": patch
---

Fix `luca verification` (and `luca <noun> --help`) being blocked by the stage-gate. The bash classifier's `LUCA_NOUN_VERBS` was missing the real, read-only `verification` command (`read` / `aggregate`), so `luca verification …` classified as `bash-mutate` and was refused in PLANNING/REVIEWING. Added `verification` to the allowlist (read verbs), and `--help`/`-h`/`--version` now classify read-only for ANY noun instead of falling through to `bash-mutate`. Note: `-v` is deliberately NOT treated as a version flag — it's the CLI's `--verbose` alias, so honoring it would let a mutating command (e.g. `luca doctor --fix -v`) bypass the gate.
