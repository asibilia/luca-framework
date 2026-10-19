# @luca/engine: crash recovery

## Crash recovery (#369)

A **step** is one action the scheduler starts, named by its key (the
ticket, `run`, `replies`, `final`, or `lens:<lens>`) and `step` (the action's
type, plus `:<role>` for an agent's turn). A step is a **checkpoint** once
its records, then its `step_ended`, are in the journal.

- **Step records.** `runEngine` journals `step_started { key, step,
  first_seq }` right before it carries out an action and `step_ended { key,
  step }` right after it settles. Waits (`wait_for_reply`, `wait_for_limit`)
  and stops get none: a crash during a wait is not the step's fault.
- **A cut-off step.** On start, any `step_started` with no later
  `step_ended` for its key was cut off. The engine appends one `run_resumed
  { interrupted: [{ key, step, ticket, role, started_seq, first_seq }] }`
  (`resumeEntry`) before its first step, then decides again: the step is
  taken again. A redo's `step_started` names its first try in `first_seq`.
- **Fresh sessions.** A cut-off agent turn's session is forgotten, so a redo
  never follows up in it. Where a follow-up would have gone (a red check's or
  gate's fix, a review fix, a failed try, a final fixer), a fresh agent of
  that role gets the same message as an extra section, and is told that a
  crash cut off an earlier try and the worktree may hold its partial edits.
  With memory on, that fresh agent gets the run's start memories, its
  ticket's, and the fix round's the follow-up would have carried.
  Fix rounds are counted from record order, so every cap still holds.
- **Crashes in a row.** Replay counts, per key, how many `run_resumed` in a
  row cut off the same step; its `step_ended` clears the count. At
  `MAX_CRASHES` (3), a ticket's step is stuck (`crashed`), the final
  review's is stuck (`crashed`), and a run-level step stops the run for
  good (`run_stopped` with `crashed: true`, then `done` with outcome
  `crashed`). A `retry` gives fresh counts.
- **Side effects made once.** Every engine comment carries an invisible
  marker `<!-- luca:<run_id>:<first_seq>:<n> -->`; a redo adopts a comment
  with its marker instead of posting it again, and a comment with a marker
  is never a reply. Opening the PR adopts an open PR for the run branch.
  Making the run branch or a worktree adopts one already there. A commit
  adopts a HEAD commit with the same message that the journal doesn't know
  yet. A join journals `join_started` (where the run branch stood) before it
  cherry-picks, so a cut-off join is redone from there. The memories'
  comment on the spec (`report_memories`) carries a marker too.
- **Memory writes.** `save_memories` journals each MuninnDB write before it
  (`memory_write_started`) and its outcome after (`memory_write_done`),
  under a key within the step (`save:<op_id>`, `feedback:<vault>:<id>`);
  only records after the step's first try count. A redo reuses a write
  done, repeats a save started but not done as it started (an update of the
  same memory with the same content, or an add with the same `op_id`, which
  MuninnDB adds once), and never sends a feedback in doubt again (it could
  count twice): that one is journaled as not ok, "unknown: a crash cut it
  off...". Then `memories_saved` is journaled once, complete, in order.
  Searches (`recall_memories`) only read, so a cut-off one is made again.
- **Limit waits and replies.** A restarted engine waits until the reset
  time a limit wait named, never less, and doesn't announce it again. It
  reads the spec issue again, so replies sent while it was down count.

**Going on with a run.** `luca-run --resume <run-id>` (`resumeRun`) reads
the spec and base branch from the journal's `run_started`, and the repo
from `--repo`, else the one `run_started` names (`repo`), else the current
folder; it keeps the journal and runs the engine on it. A run id with no
journal, or an empty one, is an error (exit 1). `unfinishedRuns({ runs_dir
})` lists the runs whose next action is not a stop (`done`,
`invalid_journal`).

**A resume re-reads the config (#516).** A run's config is the one in
its `run_started`. On a resume (`--resume`, a run id whose journal exists,
or the board's auto-restart, which runs `--resume`), the engine reads the
repo's `.luca/config.json` again and takes its new **build fields**:
`prepare`, `prepare_timeout_ms`, `prepare_concurrency`, the test slots'
cap `test_concurrency` (#544), the test time
limit `test_timeout_ms` (#542), the fast test speed limit
`test_case_timeout_ms` (#580), and the leftover scan's `leftover_allow`
(#520), including one added or removed. So a repo that swaps a slow `prepare` for a fast cached one
gets it in its runs that are going, without losing their work. Right after
the resume's `engine_resumed`, and before its first step, it journals
`config_reloaded { changes: [{ field, from, to }] }` (`null` for a field
left out), only for fields that changed; replay puts the new values on the
run's config, so the decision step, the prepare runs, and the board use
them. A resume with nothing changed adds no record. Every other field stays
as the run started with it (`FROZEN_FIELDS` in `config/config-reload.ts`
says why for each): `checks` above all, since a ticket's baseline, its red
check, and its gates compare test results across the run, and a baseline
taken with old commands is not comparable with new ones. `feature_map`
(#583) and `test_helper_patterns` (#619) are frozen too, as
`test_file_patterns` is, and so is `generators` (#618), the commands the
prompts named. A config that is
missing, not JSON, not a valid config, or one intake would refuse (no test
command, say; intake's own `configProblems`) is not taken: the engine logs
why, journals `config_reload_refused { reason }`, and the run goes on with
the config it had. A new run with a bad config still stops before its
journal starts.

**Luca's version (#460).** `lucaVersion()` is the version of the installed
`@alecsibilia/luca` package, found by walking up from the engine's own
files, or `DEV_VERSION` when the engine runs from the repo's source. A new
run records it in `run_started` (`luca_version`; `null` in older journals),
and each time the engine starts again on a run's journal it appends an
`engine_resumed` (`{ luca_version }`) before its first step. The decision
step reads neither; the board shows a note when a run resumed on a
different version. Every agent's Agent SDK client tag is
`luca-engine/<version>`.

**Restarting runs from Paseo (#375).** `luca-run --unfinished` prints one
JSON object to stdout, and nothing else, then exits 0:

```json
{ "runs": [{ "run_id": "luca-20260923-141500-ab12", "restart": true, "reason": "resumable", "message": null }] }
```

It lists every unfinished run in the runs folder (`restartableRuns`, built
on `unfinishedRuns`), with whether it may be restarted:

- `resumable` (`restart: true`): the engine was cut off, by a crash or a
  kill, so the run can go on from its journal.
- `launcher_stopped` (`restart: false`): its last record is a launcher stop
  (`run_stopped` without `billing` or `crashed`, such as the wrong login or
  model). A restart would stop the same way, so it waits for you to fix it
  and run `--resume` yourself. `message` is the stop's reason.
- `billing_stopped` (`restart: false`): a billing stop anywhere in the
  journal. It never goes on. `message` is the stop's reason.

A finished run, or a folder with no journal, is not listed. The board
plugin calls it when Paseo starts and every 15 s after that, for its runs
whose engine process is gone. It restarts the ones with `restart: true`
with `--resume <run-id> --repo <repo> --board-plugin luca-board`, and shows
the rest as "engine stopped" (see the board's docs, "Restarts" in
`packages/board/docs/restarts-and-resume.md`).
