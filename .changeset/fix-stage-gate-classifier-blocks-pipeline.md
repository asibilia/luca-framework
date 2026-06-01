---
"@alecsibilia/luca": patch
---

Fix the stage-gate hook blocking the pipeline's own legal operations — a live `/lu` run stalled in the research step because read-only commands and the legal artifact write were misclassified as mutations.

- **`classifyWritePath` now normalizes absolute paths.** Claude Code's `Write`/`Edit` pass an ABSOLUTE `file_path` (e.g. `/repo/.luca/phases/01-x/research.md`), but the classifier only matched repo-relative `.luca/` paths — so the legal `research.md` write classified as `code` and the matrix blocked it. It now takes an optional `cwd` and normalizes absolute paths to the repo-relative `.luca/` form for the contract check (always-denied system/home checks still run on the original absolute path). The stage-gate hook passes `cwd` and feeds the relative path to the artifact gate.
- **`cd` (and `pushd`/`popd`) are now read-only.** They mutate shell state, not files. Agents prefix nearly every command with `cd <dir> && …`, so omitting `cd` made every compound command classify as `bash-mutate` and get blocked in read-only phases.
- **`sed`/`awk` are read-only unless editing in place.** `sed -n '1,60p'` (print) and `awk '{…}'` (filter) read; only `sed -i…` / gawk `-i inplace` mutate. They were unconditionally treated as mutations.
- **`luca --help` / `luca --version` are read-only.** `luca` with only flags (no noun) fell through to the unknown-command → `bash-mutate` path.

Regression tests added for all four cases.
