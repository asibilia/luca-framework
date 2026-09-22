---
"@alecsibilia/luca-cli": patch
---

fix: register `budget` noun in the bash-command classifier so `luca budget check` clears the stage-gate in read-gated pipeline steps (#319)

`luca budget check` (the #319 /lu-loop guard) was unclassified, so the stage-gate hook fell back to conservative `bash-mutate` and blocked the guard exactly where it runs (PLANNING/REVIEWING). Registers `budget: {check}` as `luca-write` (check lazily stamps `runStartedAt` into state.json — a genuine write, mirroring the `snapshot` precedent) and closes the surrounding registry drift.

- `confidence` expanded to its real 5 verbs `{log, read, summary, render, gate}`; `graph`/`status` classified `TOPLEVEL_READ`.
- Closes a `--version` shortcut bypass: the bare-flag readonly shortcut now applies only when `--version` is the sole argument, so `luca <unregistered-noun> --version` no longer skates through as readonly.
- New `classify-bash-command-registry.test.ts` (71 tests): four invariants binding `CLI_SUBCOMMANDS` (newly exported from cli.ts, pure hoist) to the three exported classifier registries — completeness, verb-set equality per noun, no dead registry entries, pairwise disjointness. `DELIBERATELY_UNCLASSIFIED` pinned to exactly `{hook, statusline, start, stop}` (statusline/start/stop deliberately unregistered on security grounds — they lack phase self-enforcement; documented in-code and in verify.json notes).
- Registry exports typed `ReadonlySet<string>` / `Readonly<Record<string, ReadonlySet<string>>>`.
