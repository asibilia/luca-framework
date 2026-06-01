---
"@alecsibilia/luca": patch
---

Address PR #278 review (batch 2): finish the orchestrator-owns-memory-I/O alignment and fix two more bootstrap/tooling gaps.

- **Subagent `muninn-recall` contradiction**: `debater`, `test-writer`, `reviewer`, `researcher`, `plan-reviewer`, `discussion`, and `executor` all declared `pipelineInvocations: ['muninn-recall']`, which the compiler expands into a "Pre-invoke MuninnDB recall" instruction — directly contradicting the shared-prefix rule that subagents have no MCP access. Dropped `muninn-recall` from every subagent (CLI/Bash-based `rule-run`/`confidence-log`/`claim-verify` retained); the orchestrator supplies prior context in the prompt. Stale docstrings updated to match.
- **`reviewer` could not write its artifact**: `allowedTools` omitted `Write`, but the reviewer's one assigned artifact is `audits/<reviewer>.md`. Added `Write`.
- **`luca roadmap create` bootstrap**: it routed through strict `mutateState` and threw on a fresh workflow, even though it's a legitimate first-phase bootstrap. Now opts into `bootstrapIfMissing` (like `luca_state_advance`) — seeds an absent `state.json` from defaults under the lock while still throwing on a present-but-truncated file.
- **`learner` slug discovery**: the body told the learner to run `luca phase current`, but it has no Bash. It now uses the orchestrator-supplied `{phase_slug}`; `phase-execute` resolves and passes it.
- **shared-prefix wording**: clarified that the "write only your one assigned artifact" rule constrains `.luca/` pipeline artifacts only — it does NOT forbid `executor`/`test-writer` from editing production code.
- **Changeset accuracy**: corrected the `-v` claim in the verification-classifier note (it's excluded, not read-only), and refreshed the "Still pending" list in the stale-names note (tribunal/test-writer/roadmap/model-routing are all resolved in this PR).

Regression tests added for roadmap-create bootstrap (absent → seeded, truncated `{}` → throws) and a stale `currentPhase` assertion corrected to match the documented phase-1 activation.
