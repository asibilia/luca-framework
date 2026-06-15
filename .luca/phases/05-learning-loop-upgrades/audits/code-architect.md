PERSPECTIVE: architecture + dx (combined convergence re-review, cycle-2, COLD ISOLATION)
VERDICT: APPROVE

## Scope
Confirm the cycle-1 fix wave resolved BOTH cycle-1 MUST-FIX (gotchas misstating Luca
mechanics) in phase 05-learning-loop-upgrades, that the 3 replacement gotchas are
factually accurate, and that no new defect was introduced. Staged delta only.
Fixed files: finalize.ts, subagents/researcher.ts, subagents/learner.ts.

## Cycle-1 MUST-FIX resolution

### MUST-FIX #1 (arch) — finalize.ts gotcha named nonexistent `luca todo move-batch`/`move` — RESOLVED
Replacement gotcha (finalize.ts:492):
  "Close each completed todo with `luca todo update --id <id> --status done
   --verification-criterion <ac-id>` — todos are addressed by stable id, so transition
   them one per call (there is no `move`/`move-batch` verb; those are legacy)."
Verified factually accurate:
- `luca todo` exposes ONLY add | list | update — confirmed at
  write-surface/todo.ts:249-253 (subCommands: add, list, update) and corroborated by
  WRITE_COMMAND_PHASES (step-artifacts.ts:90-92: only `todo add`/`todo list`/`todo update`).
  No `move`/`move-batch` verb exists. The gotcha names the real verb (`update`) and
  references `move`/`move-batch` ONLY as an explicit negation ("there is no … those are
  legacy") — a negation, not a run-instruction. Correct.
- `--verification-criterion` is a REAL flag on `todo update` — confirmed at
  todo.ts:208-214 (arg `'verification-criterion'`, type string, "Required when
  --status=done. A criterionId … in the active phase's verify.json that is met=true …
  parent status=PASS"). The run handler maps it to `verificationRef: { criterionId }`
  (todo.ts:227-229), matching the companion gotcha at finalize.ts:491 ("the ref is
  `{ criterionId }` only (no wave field)"). Field name, shape, and done-promotion guard
  are all correct.

### MUST-FIX #2 (dx) — researcher.ts gotcha falsely said "research.md illegal at the plan step" — RESOLVED
The false claim is GONE. Replacement gotcha (researcher.ts:35):
  "You are read-only (no Write tool — only Read/Grep/Glob) and write NO `.luca/`
   artifacts — return your findings in-context for the orchestrator; the parent research
   mode owns the `research.md` write, never create a file yourself."
Verified factually accurate:
- researcher allowedTools = ['Read', 'Grep', 'Glob'] (researcher.ts:30) — no Write tool,
  so "read-only" and "never create a file yourself" are correct.
- `research.md` IS legal at the `research` step — confirmed STEP_ARTIFACTS.research =
  ['research'] (step-artifacts.ts:43). The new gotcha makes NO claim about step-legality
  at all; it re-anchors the constraint to the subagent's tool boundary (no Write) and
  ownership (parent research mode owns the write). The prior "illegal at plan step"
  falsehood is absent. Correct re-anchor.

### SHOULD-FIX (cycle-1) — learner.ts `luca retro postmortem` → bare `luca retro` — CONFIRMED RESOLVED
- Replacement gotcha (learner.ts:36): "do NOT attempt `mcp__muninn__*` calls or
  `luca retro`" — references the bare `luca retro` verb, not a `postmortem` subcommand.
  Body prose (learner.ts:44) likewise now reads bare `luca retro`.
- Confirmed `luca retro` has NO `postmortem` subcommand: retro.ts:29-49 defines the
  command with meta.name 'retro' and args { run, list, json } only — no subCommands. The
  bare-verb reference is correct.
- The header-comment narrative (learner.ts:12-14) still QUOTES the old wrong string
  ("`luca retro postmortem`") but does so descriptively, explaining what the PREVIOUS body
  wrongly told the subagent to do — historical note, not a run-instruction. Not a defect.

## New-defect scan on the 3 replacement gotchas
- finalize.ts:492 — no phantom verb (`update` real), correct flag (`--verification-criterion`
  real), correct id-addressing model, `move`/`move-batch` only negated. PASS.
- researcher.ts:35 — tool-boundary + ownership both verified against allowedTools and
  step-artifacts; no step-legality misstatement, not vague, not self-contradictory. PASS.
- learner.ts:36 — `luca retro` real bare verb; no-MCP/no-Bash claim matches allowedTools
  (Read/Grep/Glob/Write, no Bash) at learner.ts:30. PASS.
No new phantom verb, wrong field, wrong step, vagueness, or self-contradiction introduced.

## Out-of-scope (acknowledged, NOT raised)
The finalize MODE BODY still references legacy `luca todo move-batch`/`move`
(finalize.ts:470, 474, 476) and `luca retro postmortem gate`/`render`
(finalize.ts:228, 244, 378). These are MODE-BODY references, pre-existing, outside the
phase-05 staged gotcha delta, and already filed as a todo for phase-06. Per review scope
these are explicitly out-of-bounds and are NOT counted as MUST-FIX in this cycle.

## Evidence cited (≥3 verified locations)
1. write-surface/todo.ts:208-214 — `--verification-criterion` flag exists on `todo update`.
2. write-surface/todo.ts:249-253 — `luca todo` subCommands = add|list|update only.
3. step-artifacts.ts:43 — STEP_ARTIFACTS.research = ['research'] (research.md legal at research step).
4. researcher.ts:30 — allowedTools = ['Read','Grep','Glob'] (no Write — read-only correct).
5. retro.ts:29-49 — `luca retro` has no `postmortem` subcommand (bare verb correct).

FINDINGS:
- [NOTE] Header-comment narratives in researcher.ts (lines 9-14) and learner.ts (lines 11-14)
  quote the old wrong strings descriptively to explain the fix rationale. Correct as
  historical context, not run-instructions. No action needed.
  Cross-phase: false

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 1
  CROSS_PHASE_COUNT: 0
