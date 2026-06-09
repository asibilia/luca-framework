---
phase: 2
slug: 02-planning-time-confidence-emission
wave: 1
tdd: false
complexity: MODERATE
---

# Plan — Phase 2: planning-time-confidence-emission

## Objective
Make the planner emit per-decision confidence at plan time, and complete the writer surface + Phase-1 carry-forward polish so those entries can be set. After this phase, producing a plan.md also produces confidence-journal entries (with `researchable`/`resolution`) that the Phase-3 gate will consume. No gate controller yet.

## Context
- Phase 1 delivered the schema fields, `selectConfidenceGateActions()`, and `luca confidence gate` (read-only). See `.luca/phases/01-confidence-gate-substrate/`.
- Locked decisions (Phase 1 `context.md`): planning-time signal; `medium→auto`; fail-toward-`ask`; deterministic.
- Carry-forward from Phase 1 review (should-fix): DX JSDoc on the two fields, `gate --help` wording, resolution-enum exhaustiveness guard, and the deferred `log` writer flags.
- The planner in v13 is the `architect` mode-agent (`packages/luca-tools/src/artifacts/modes/architect.ts`); the `phase-plan` skill (`.../skills/phase-plan/index.ts`) orchestrates it. The confidence "When to Log" pattern already exists in the `execute` mode (`.../modes/execute.ts`) — mirror it for plan time.

## Tasks (atomic, sequential — `bunx --bun tsc --noEmit` after each)

### Task 1 — Carry-forward polish + `log` writer flags
- `packages/luca-core/src/confidence/schemas.ts`: expand JSDoc on `researchable` (set `true` when the ambiguity is factual + resolvable by automated research; absent/false when human judgment is needed) and `resolution` (per-value: `auto`=proceed, `research`=trigger research, `ask`=escalate to human).
- `packages/luca-core/src/confidence/gate.ts`: make the `resolution` switch exhaustive — add a `satisfies never` (or equivalent) guard so adding a future enum value is a compile error; keep the total `else → ask`.
- `packages/luca-cli/src/commands/write-surface/confidence.ts`:
  - `gate --help`: drop any inconsistent parenthetical; state output shape `{auto,research,ask,counts}`; align wording with `summary`.
  - `log` subcommand: add `--researchable` (boolean) and `--resolution` (string enum `auto|research|ask`) flags; thread them into the payload handed to `appendConfidenceEntry` (only set when provided — preserve `.optional()` semantics).
- **Verify:** tsc green. `luca confidence log --help` shows the two new flags. A `log` call with `--researchable --resolution=research` then `luca confidence gate` reflects them (run from source; global bin is stale).
- **Do NOT** touch MCP write-surface handlers (unused).

### Task 2 — Planner emits per-decision confidence
- Edit `packages/luca-tools/src/artifacts/modes/architect.ts` AND `packages/luca-tools/src/artifacts/skills/phase-plan/index.ts`:
  - Add a "Confidence Emission (plan-time)" instruction: while producing `plan.md`, for each non-trivial decision/assumption/ambiguity, log a confidence entry via `luca confidence log` (`phase`, `wave`, `task`, `confidence`, `category`, `decision`, `researchable`, optional `resolution`).
  - Reuse the **When to Log** triggers from `execute` mode (plan gap, multiple valid approaches, ambiguous requirement, unclear convention/dependency, scope creep). The planner sets `researchable: true` when the ambiguity is factual/lookup-resolvable, else leaves it absent (→ gate will `ask`).
  - State explicitly that this is the signal the (future) plan→execute confidence gate consumes; entries are written to the active phase journal.
  - Keep it concise; do not duplicate the full ConfidenceEntry schema — reference the `luca confidence log --help` surface.
- **Verify:** tsc green (skill/mode bodies are string templates). Grep confirms both bodies now reference `luca confidence log` with `researchable`. `luca` build (`bun run build`) still compiles the artifacts (skills count unchanged at 41).

## Success criteria
- [ ] researchable/resolution JSDoc explains when/how to set each; gate.ts resolution branch is exhaustive (`satisfies never`).
- [ ] `luca confidence log` accepts `--researchable`/`--resolution`; `gate` reflects them; `--help` texts consistent.
- [ ] `architect` mode + `phase-plan` skill instruct plan-time confidence emission with the When-to-Log triggers and researchable determination.
- [ ] `bunx --bun tsc --noEmit` passes; `bun run build` compiles artifacts.
- [ ] No MCP handler touched; postmortem/`LOW_CONFIDENCE_THRESHOLD` untouched; not committed (finalize commits).

## Out of scope (Phase 3)
- The plan→execute gate sub-step in `lu` (research/ask routing, context.md persistence) and the `full-auto` prose redefinition.
