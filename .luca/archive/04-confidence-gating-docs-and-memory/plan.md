---
phase: 4
slug: 04-confidence-gating-docs-and-memory
wave: 1
tdd: false
complexity: MODERATE
---

# Plan — Phase 4: confidence-gating-docs-and-memory (+ carry-forward hardening)

## Objective
Close the feature: (A) apply the Phase-3 gate-controller review fixes that the v13 pipeline could not loop back to fix (review→execute is illegal), (B) apply the small Phase-2 cleanup carry-forwards, (C) write the design decision doc + a follow-up backlog item so the work isn't lost. This is the last phase before finalize.

## Context
- Phase-3 review carry-forward: `.luca/phases/03-confidence-gate-controller-in-lu/learn.md` (M1, M2, S1–S5).
- Phase-2 cleanup carry-forward: `.luca/phases/02-planning-time-confidence-emission/learn.md`.
- Whole-feature design lives in the approved plan (`~/.claude/plans/dynamic-launching-steele.md` Part B) + the per-phase context/decisions.

## Tasks (atomic — `bunx --bun tsc --noEmit` + `bun run build` after each)

### Task 1 — Gate-controller hardening (Phase-3 must-fix + should-fix)
Files: `packages/luca-tools/src/artifacts/skills/lu/index.ts` + `packages/luca-tools/src/artifacts/commands/lu.ts`.
- **M1 (must):** in the lu SKILL, move the orphaned `finalize` step row back INTO the step table immediately after the `learn` row; delete the orphan below the gate sections. Confirm the table reads research…learn,finalize contiguously.
- **M2 (must):** gate `ask` handling (skill + command) — specify the **AskUserQuestion** tool to surface each `ask` item (entry `decision` as question, `alternatives` as options) and "block until the user answers; do NOT proceed unanswered."
- **S1:** idempotency — before appending `## Confidence Gate Resolutions` to `plan-review.md`, check it isn't already present (a `plan-review→plan→plan-review` re-run must not double-append).
- **S2:** on the `plan-review` row, note that a resuming orchestrator should check `plan-review.md` for the resolutions section before re-running the gate.
- **S3:** all-auto case — if every bucket is empty (`counts` all 0), proceed straight to execute (don't stall).
- **S4:** give the `research`-bucket researcher spawn a concrete prompt template (what to pass, what to return).
- **S5:** command parity — add `luca phase current` + "use `Edit` not `Write`" to the `/lu` command gate section.
- **Verify:** tsc + build (skills:41, commands:17). Grep: lu skill table contains a `finalize` row contiguous with `learn` (no orphan); `AskUserQuestion` present in both gate `ask` handlers; idempotency + all-auto notes present.

### Task 2 — Phase-2 cleanup carry-forwards
File: `packages/luca-cli/src/commands/write-surface/confidence.ts` (+ `.../handlers/luca-confidence-log.ts`).
- `--resolution` invalid-value error message cites `luca confidence log --help`.
- `lucaConfidenceLogTool.description` prose lists `researchable?`/`resolution?` (was truncated at `reviewHint?`).
- Remove the redundant manual `--resolution` enum check in the CLI (the handler `inputSchema` z.enum already validates) — only if removal keeps a clear error; otherwise leave + note.
- **Verify:** tsc + build. `luca confidence log --resolution=bogus` errors helpfully; `--help`/description show the fields.

### Task 3 — Decision doc + follow-up backlog
- Write `docs/decisions/confidence-gated-lu.md` (freeform; NOT under `.luca/`): the design — full-auto redefined as confidence-gated; planning-time confidence signal (researchable/resolution); deterministic `luca confidence gate` bucketing (auto/research/ask, medium→auto, fail-toward-ask); gate placement (tail of plan-review, persists to plan-review.md, injects to executor); the 4 phases delivered; and the named follow-ups.
- Record follow-ups as backlog items (best-effort `luca todo add` for each; if unavailable, list them in the decision doc): (1) `luca confidence resolve` to mark journal entries resolved → enables a true re-emit/re-gate loop; (2) fix the v13 `review→execute` transition gap (or reroute must-fix handling).
- **Verify:** `docs/decisions/confidence-gated-lu.md` exists and covers the 4 phases + follow-ups; tsc still passes (no code change in this task).

## Success criteria
- [ ] lu skill step table includes a contiguous `finalize` row (no orphan); both gate `ask` handlers use AskUserQuestion + block; idempotency/all-auto/resume notes present; command parity done.
- [ ] Phase-2 cleanups applied (error→help, tool description, redundant check).
- [ ] `docs/decisions/confidence-gated-lu.md` written; follow-ups captured (backlog or doc).
- [ ] `bunx --bun tsc --noEmit` passes; `bun run build` compiles (skills:41, commands:17); no luca-core state-machine change.
- [ ] Not committed (finalize commits).
