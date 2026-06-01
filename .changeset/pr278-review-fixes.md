---
"@alecsibilia/luca": patch
---

Address PR #278 review: stage-gate `-v` bypass, state-mutation strictness/bootstrap, and reviewer-perspective directives.

- **Stage gate (`classify-bash-command`)**: `-v` is the `--verbose` alias, not `--version`. Treating it as a version probe let mutating commands like `luca doctor --fix -v` classify as read-only and bypass the gate. The read-only shortcut now matches only `--help`/`-h`/`--version`.
- **`mutateState` (`acquireLock`)**: ensure `.luca/` exists before the exclusive lock create, so `luca workflow reset` (and any bootstrap path) no longer throws `ENOENT` on an uninitialized workflow.
- **`mutateState` strictness**: "strict" is now enforced before schema defaults apply — the raw JSON must contain the required `pipelineStep` key, so a truncated-but-valid `{}` is rejected instead of silently defaulting to `idle`/`currentPhase: 0` and clobbering an active workflow.
- **`mutateState` bootstrap**: a new `bootstrapIfMissing` option distinguishes an ABSENT file (legitimate initialize/reset → seed from a supplied base) from a present-but-incomplete one (corruption → throw). `luca_state_advance` opts in, preserving the missing→defaults first-advance contract while staying strict on malformed reads.
- **Reviewer spawns**: every `reviewer` Task in `phase-execute` and `milestone-audit` now declares an explicit `PERSPECTIVE:` (dx / simplification / architecture / security). The dead Tailwind/UI review (no such perspective on the consolidated reviewer, and this is a CLI repo) is repurposed to `test-quality`.
- **Grammar**: "spawn a executor" → "an executor" in `quick`.

Regression tests added for the `-v` non-bypass, the incomplete-`{}` rejection, `bootstrapIfMissing` semantics, and lock-dir creation.
