# Execution Summary: 01-todo-cli-priority-area

**Plan:** revision 3 (4 waves, 9 tasks, 25 criteria incl. ac-10b; frontmatter says 24 — off-by-one, see waves/04.md) · **Result:** 9/9 tasks complete, 25/25 criteria pass · **Gate:** `bunx --bun tsc --noEmit` exit 0 (authoritative post-wave-4 run + checks harness)

**Cycle 2 (wave 4, after review):** SEC-01 MUST-FIX fixed — `area` now JSON.stringify'd into the list instruction AND charset-gated by a shared `TodoAreaSchema` (kebab ≤60) exported from luca-core and used by TodoSchema + all 3 handlers. AR-01: `TodoPriority.options` single-sources the enum in todo.ts (×3). Full-replace warning consolidated to one complete statement per surface (now names priority+area); real per-field descriptions restored. Injection probe `--area 'x"y'` → schema rejection exit 1; all 9 stored area values re-parse OK.

## What shipped (staged, uncommitted — commits at finalize per stage-gate)

**Code (luca-core):**
- `TodoSchema` gains optional `priority` (TodoPriority enum: low|medium|high|critical, exported const+type) and `area` (string ≤60). No schemaVersion bump; existing engrams parse unchanged. (`packages/luca-core/src/todos/schemas.ts`, barrel `todos/index.ts`)

**Code (luca-cli):**
- `rejectUnknownFlags<TArgsDef extends ArgsDef>(command, cmd, rawArgs)` in `__helpers/run-handler.ts`: rawArgs token scan; handles `--flag=value`, `--no-` negation, `--` terminator; ignores short flags/positionals; allows declared args + camel/kebab alias variants + declared aliases + citty built-ins help/version. Errors loudly naming flag + command, exit 1.
- Wired as first statement into **all 14 write-surface leaves** across 12 files: todo (add/list/update) + branch, checks, confidence (×5), phase (×3), pr-review (×3), preferences (×2), repo, roadmap (×2), state (×4), verification (×2), workflow.
- `todo add`/`update`: `--priority` as citty `type:'enum'` (first repo use; native CLIError on bad value) + `--area`; update --help carries full-replace warning. `todo list`: same two flags as post-recall filters; list handler schema + filter-description builder extended (`content.priority === "X" && content.area === "Y"`).
- Handlers (add/update) accept and pass through both fields; update field descriptions warn full-replace semantics.

**Prose (luca-tools):** todo-add skill (stale "Todo File Format" block deleted), session-plan (phantom `--format json` removed, real surface described), gh-issue-triage (metadata-file pattern → first-class flags + legacy-coexistence note), todo-check (priority/area in field list + render), note skill + research mode verified already-correct.

**Data:** all 10 `source=pai-framework-review` backlog todos backfilled with top-level priority/area; `[priority|area]` body prefix lines stripped.

## Live probes captured
- `todo add --title x --bogus-flag y` → exit 1 "unknown flag '--bogus-flag'"
- `todo add --title x --priority wrong` → citty CLIError "Expected one of: low, medium, high, critical"
- `state read --bogus` → exit 1 named; `state read` clean; `branch guard --default-branch main` (declared kebab flag) → ok
- `todo list --area x --priority high` → exit 0, instruction names both filters

## Deviations (full detail in waves/01-03.md)
1. Per-task commits blocked by stage-gate (bash-commit denied in EXECUTING) — by design; everything staged for finalize. Suggested commit grouping: schema+barrel / helper+wiring / todo CLI+handlers / prose / phase docs.
2. Task 1.2 helper signature needed generic widening (citty CommandDef invariance) — fixed in 2.3, logged medium/plan-gap, flag to reviewer.
3. Backfill: 10 todos not 9 (plan predates 10th); direct muninn batch instead of per-todo CLI (same emitted instruction; argv/tmp quoting hazards; CLI path already live-probed).
4. gh-issue-triage `--metadata-file` dropped entirely (carried only priority/area).

## Requirements
REQ-01 fully implemented: documented flags real on all three todo verbs, silent-drop killed across the entire write surface, drift sites fixed, backlog backfilled.
