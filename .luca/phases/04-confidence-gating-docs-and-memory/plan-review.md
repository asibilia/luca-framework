# Plan Review — Phase 4: confidence-gating-docs-and-memory

**VERDICT: APPROVED** (orchestrator-confirmed). Tasks 1–2 are a faithful checklist of findings already surfaced and validated by the Phase-2/Phase-3 reviewers (M1, M2, S1–S5, and the Phase-2 cleanups) — re-reviewing them adds no signal. Task 3 is a docs deliverable.

## Traceability
- Task 1 ← Phase-3 `learn.md` carry-forward (DX must-fix M1 orphaned finalize row + M2 ask-tool; architect/DX should-fix S1–S5). Each is atomic and grep-verifiable.
- Task 2 ← Phase-2 `learn.md` carry-forward (error→help, tool description, redundant enum check).
- Task 3 ← approved plan Part B "capture the design so it isn't lost".

## Executor directives
- **M1 is the critical one:** the lu skill step table must end up with `finalize` contiguous after `learn`, and NO orphaned `finalize` row left below the gate sections. Verify by reading the rendered table top-to-bottom.
- **M2:** name the **AskUserQuestion** tool explicitly in BOTH the lu skill and command gate `ask` handlers; "block until answered."
- Prose-only for the lu/command/mode bodies; do NOT touch `packages/luca-core/**` state machine. Task 2 touches the confidence CLI/handler (allowed — that's the CLI write path, not a state-machine change).
- `docs/decisions/confidence-gated-lu.md` is freeform (outside `.luca/`) — write with the Write tool; legal in execute.
- Do NOT commit (finalize commits).

Proceeding to execute.
