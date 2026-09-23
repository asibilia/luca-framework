# @luca/engine

The Luca v1 **engine**: plain Bun and TypeScript that drives a **run** of one
**spec** and picks every next step. See `CONTEXT.md` at the repo root for the
domain words, and spec #359 for the plan.

This package so far covers the start of a run (#360): the engine config, the
**journal**, and **intake**. Building tickets starts at the `await_build` seam
(#361).

## Modules

| Module | What it does |
| --- | --- |
| `src/config/engine-config.ts` | Loads the per-repo engine config (`.luca/config.json`). |
| `src/journal/journal-record.ts` | The journal's record kinds and their content, as Zod schemas. |
| `src/journal/journal.ts` | One append-only JSONL journal per run, outside git. |
| `src/journal/replay.ts` | Rebuilds a run's state from its journal. There is no status file. |
| `src/intake/intake-checks.ts` | Intake's pure checks: refused, nothing to do, or a snapshot. |
| `src/core/decide.ts` | **The decision step.** Pure: journal in, next action out. |
| `src/core/execute.ts` | Carries out an action (tracker calls, journal appends) and the `runEngine` loop. |
| `src/tracker/tracker.ts` | The tracker interface: an object of async functions. |
| `src/tracker/in-memory-tracker.ts` | A tracker in memory, for tests. |
| `src/tracker/github-tracker.ts` | The real tracker, through the `gh` CLI. |
| `src/testing/intake-fixtures.ts` | Spec, ticket, and journal builders for tests. |

## How a run moves

```
startRun ──> run_started
  decide ──> read_intake          execute: read spec, sub-tickets, outside blockers ──> intake_read
  decide ──> refuse_intake        execute: comment + needs-info on each bad issue   ──> intake_refused
          or finish_nothing_to_do execute:                                          ──> nothing_to_do
          or snapshot_intake      execute: ──> spec_snapshot, ticket_snapshot × n
  decide ──> done | await_build   (runEngine stops)
```

`runEngine` reads the journal before every step, so it can resume a journal
left by a crashed engine. A snapshot cut short by a crash is taken again; replay
keeps the latest snapshot of each ticket.

## Choices made

- **Config file:** `.luca/config.json` in the repo a run works on. Its
  `muninn.vault` field names the project's memory vault; it stays at that path
  because memory tooling outside the engine reads it there. Unknown keys (such
  as old Luca's) are dropped on read. The test command is optional in the
  schema so a config without it loads and intake refuses the run with a clear
  reason.
- **Runs folder:** `~/.local/state/luca/runs/<run_id>/journal.jsonl`, outside
  git. Set `LUCA_RUNS_DIR` to move it.
- **Refusal beats nothing to do:** config and spec problems refuse even a spec
  with no open tickets. Only a clean spec with no open tickets has nothing to
  do.
- **Refusing a ticket** comments with what is missing, adds `needs-info`, and
  removes `ready-for-agent`. Spec problems land on the spec the same way.
  Config problems (no issue to comment on) are only journaled.
- **Blockers** are native "blocked by" links plus `#N` refs in a ticket's
  "Blocked by" section. A closed blocker is fine anywhere; an open one must be
  an open ticket of the same spec, and those must not form a loop.

## Tests

The tests go through the seams spec #359 sets: the decision step (`decide`
given a journal), the engine with the in-memory tracker, the journal file
(append and replay), and the config loader.

```bash
bun test              # in packages/engine
bun run typecheck
bun run lint
```
