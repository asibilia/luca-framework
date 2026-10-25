# @luca/engine: modules in `src/journal/`

The journal, its record kinds, and replaying a run from it. A module in another
folder is on its folder's page; the [README](../README.md) lists them.

| Module | What it does |
| --- | --- |
| `src/journal/journal-record.ts` | The journal's record kinds and their content, as Zod schemas, from one module per area ([journal entries](#journal-entry-modules)). |
| `src/journal/journal.ts` | One append-only JSONL journal per run, outside git. |
| `src/journal/replay.ts` | Rebuilds a run's state from its journal. There is no status file. Its parts: [replay modules](#replay-modules). |
| `src/journal/step-records.ts` | Pure: the steps a crash cut off (`resumeEntry`, the `run_resumed` a restarted engine appends), each step's crashes in a row, and a redo's first try. |

## Replay modules

`src/journal/replay.ts` rebuilds a run's state from its journal. It keeps the record switch (`applyRecord`) and `replayRun`, and re-exports everything below that it exported before, so importers use `./replay` as ever.

| Module | What it does |
| --- | --- |
| `src/journal/run-state.ts` | `RunState`'s shape and empty value, with small run-wide updates (snapshot phase, run notes, engine comments). |
| `src/journal/ticket-progress.ts` | `TicketProgress`'s shape and empty value. |
| `src/journal/final-review-state.ts` | `FinalReviewState`'s shape and empty value. |
| `src/journal/plan-replay.ts` | Replays the plan: rate limits hit, limit and usage-line waits, billing stops. |
| `src/journal/memory-replay.ts` | Replays memory and the learner's own records. |
| `src/journal/agent-turn-replay.ts` | Reads of an agent turn shared by ticket and final review replay (assumptions, bad test, sessions, declined findings). |
| `src/journal/ticket-replay.ts` | Replays a ticket's own records, a rebase, and a reused baseline. |
| `src/journal/ticket-result-replay.ts` | Where an agent's answer goes in its ticket's progress, including ticket reviews and `already_done` checks. |
| `src/journal/ticket-retry-replay.ts` | Replays a stuck ticket's `retry`: refused, restarted, or resumed. |
| `src/journal/final-review-replay.ts` | Replays the final review's records, its stuck report and reply, and its `retry`. |
| `src/journal/final-review-round.ts` | A final review round: namespaced lens results, settling the round, the fixers' answers, and the findings its PR lists. |
| `src/journal/reply-replay.ts` | Replays owner replies, stuck reports, and a ticket's `retry` at the run level. |
| `src/journal/shared-failure-replay.ts` | Replays shared failures (#544): the run-wide list of old tests that failed, and whether a ticket's failed check gets a lone rerun. |
| `src/journal/cross-ticket-replay.ts` | Replays records that reach across tickets: crashes cut off, closed sessions, undone joins. |

## Journal entry modules

`src/journal/journal-record.ts` re-exports the journal's record kinds, built from one module per area, and what they export. A new kind is added to the three modules at the top of the table: the entry union, the record union, and the list of kinds.

| Module | What it does |
| --- | --- |
| `src/journal/journal-entry-schema.ts` | `JournalEntrySchema` (what a caller hands the journal to append) and `JournalEntry`: every kind's entry schema in one union. |
| `src/journal/journal-record-schema.ts` | `JournalRecordSchema` (one line of a journal, with `seq` and `time`) and `JournalRecord`: the same union, stamped. |
| `src/journal/journal-kinds.ts` | `JournalKindSchema`, `JournalKind`, and `JOURNAL_KINDS`: every record kind's name. |
| `src/journal/entry-fields.ts` | The fields every entry has. |
| `src/journal/run-entries.ts` | Run start, resume, stop, and step entries. |
| `src/journal/intake-entries.ts` | Intake entries. |
| `src/journal/worktree-entries.ts` | Worktree and baseline entries. |
| `src/journal/agent-entries.ts` | Agent turn and session entries. |
| `src/journal/agent-message-entries.ts` | Agent message entries. |
| `src/journal/limit-entries.ts` | Plan limit and usage entries. |
| `src/journal/repo-wait-entries.ts` | The repo wait's entries (#615): started, ended, skipped. |
| `src/journal/gate-entries.ts` | Red check, install, and gates entries. |
| `src/journal/commit-entries.ts` | Leftover scan and commit entries. |
| `src/journal/join-entries.ts` | Join, rebase, and push entries. |
| `src/journal/stuck-entries.ts` | Stuck work and the owner's reply entries. |
| `src/journal/already-done-entries.ts` | Already-done ticket entries. |
| `src/journal/final-review-entries.ts` | Final review entries. |
| `src/journal/pull-request-entries.ts` | Changeset and pull request entries. |
| `src/journal/memory-entries.ts` | Memory entries. |
| `src/journal/decision-model-entries.ts` | Decision model entries. |
