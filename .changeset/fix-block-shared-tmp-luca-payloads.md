---
"@alecsibilia/luca": patch
---

Block legacy shared-tmp `/tmp/luca-*` handoff payloads and document the canonical `.luca/tmp/` staging path.

`/lu` sessions occasionally staged CLI handoff payloads (e.g. the `luca checks run` commands array) at the pre-v13 shared location `/tmp/luca-checks-NN.json`, where concurrently-running repos overwrite each other's files. Two-layer fix:

- **Enforcement** (`luca-core`): `classifyWritePath` now always-denies `/tmp/luca-*` and `/private/tmp/luca-*` with a reason that redirects to `.luca/tmp/<kebab-name>.json`. Covers both native `Write`/`Edit` targets and Bash redirects via the stage-gate hook.
- **Instructions** (`luca-tools`): the `luca-write-surface` skill now documents the `.luca/tmp/` staging convention for all `--file` payloads, and the `lu` skill/command tables plus the execute/review/finalize modes spell out `--file .luca/tmp/checks.json` instead of leaving the path to the model.

Also updates classifier tests (new deny cases; fixes a stale assertion that pre-dated the `toLucaRelative` segment fallback).
