---
'@alecsibilia/luca-framework': minor
'@alecsibilia/luca-mastracode': minor
---

Close the silent-skip hole in full-auto pipeline runs (the incident where execute mode didn't fire but finalize moved every todo to `done`).

**Hard gates** — bad state transitions are now blocked at the tool layer, not just by LLM instructions:

- `workflowState(complete-phase)` rejects with `EMPTY_PHASE_BLOCKED` when a phase has zero file changes and zero commits and no `phase-empty-justification` ledger entry exists. New `justify-empty-phase` action lets the agent declare an intentional no-op (e.g. docs-only-in-MuninnDB).
- `workflowState(advance-wave)` rejects with `WAVE_ADVANCE_NO_VERIFICATION` when no `verification-result.json` exists for the current wave.
- `manageTodos(move|move-batch → done)` requires a `verificationRef` pointing to a passing criterion in `verification-history.jsonl`; rejects with `TODO_DONE_UNVERIFIED` otherwise.

**Diff-based phase proof** (`phase-diff.ts`) snapshots the working tree at `start-phase` and computes the diff at `complete-phase`, surfacing it via the new `phase-diff-summary` ledger event.

**Run identity & archiving** (`session-ledger.ts`) — every ledger entry is now stamped with a per-run `runId`. Pipeline reset archives prior `session-ledger.jsonl`, `verification-history.jsonl`, `confidence-journal.jsonl`, and `routing-history.jsonl` to `.planning/runs/<priorRunId>/`.

**Postmortem analyzer & gate** (`postmortem.ts`, `tools/run-postmortem.ts`) — new `runPostmortem` Mastra tool with `analyze | render | gate | list-runs` actions. Reads the four append-only JSONL artifacts and produces a structured report covering empty phases, unverified todo completions, forced transitions, low-confidence decisions, missing wave verifications, pipeline re-entries, and idle-bypass anomalies. Returns pre-formatted MuninnDB pitfall payloads for the agent to forward to the `default` vault so future runs can recall recurring failure modes.

**Finalize wiring** — new Step 4.5 "Postmortem Gate" calls `runPostmortem(action: "gate")` before PR creation; critical violations block the PR and re-enter the pipeline. Step 6 calls `runPostmortem(action: "render")` to write `.planning/POSTMORTEM.md` for the PR body.

**Pipeline guard idle-bypass logging** (`pipeline-guard.ts`) — when the guard bypasses enforcement because `pipelineStep === 'idle'` or is missing, it now emits a one-time-per-turn `pipeline-guard-idle-bypass` ledger event so postmortem can surface stale-state contamination. Previously this bypass was silent.

**`luca retro` CLI** — new command prints `.planning/POSTMORTEM.md` (or lists archived runs under `.planning/runs/` with `--list`) so users can inspect retrospective reports without launching the harness.
