# @luca/engine: test limits and slow tests

This page goes on from [The prepare command](prepare-and-tests.md).

**The test time limit (#542).** Each test command gets 5 minutes
(`DEFAULT_COMMAND_TIMEOUT_MS`), every time the engine runs one: the
baseline, the red check, the already-done check, and the gates. A repo with
slower tests raises it with `test_timeout_ms` (a positive whole number of
milliseconds) in `.luca/config.json`:

```json
{ "checks": { "test": "bun test" }, "test_timeout_ms": 900000 }
```

It holds for every kind of test command (`bun`, `junit` and `pass_fail`). Types and
lint keep 5 minutes. A test command that runs out of time fails, and its
output starts with "Timed out after 5 minutes" and says to raise
`test_timeout_ms`.

**Test slots (#544).** Tickets run their tests at the same time on one
machine, so tests that share ports, files, or a database can collide. A
repo caps how many test runs go at once across the run with
`test_concurrency` (a positive whole number) in `.luca/config.json`:

```json
{ "checks": { "test": "bun test" }, "test_concurrency": 1 }
```

- It covers every test command the engine runs: the baseline, the red check
  (its own-files run too), the already-done check, and every gate's `test`
  and `slow_test` commands (a ticket's, a join's, and the final review's,
  with the final review's slow tests). Each command takes one slot, in call
  order; prepare keeps its own slots (`prepare_concurrency`).
- Waiting for a slot never counts toward `test_timeout_ms`: the time limit
  and `duration_ms` start once the command does. The wait is journaled as
  `wait_ms`, on the test run (`baseline_tests`, `red_check`) or on the gate
  check. With a cap, every run records it, `0` when it didn't wait.
- The slots also have an exclusive take: it waits until no test run holds a
  slot, then holds them all, so nothing else starts until it ends. It works
  with or without a cap: every test run holds a slot either way.
- A resume reloads it (see [Crash recovery](crash-recovery.md)), so a
  running run's cap can be lowered.
- Left out, there is no cap: nothing waits (except behind an exclusive
  take), and no run or check has `wait_ms`.

**Shared failures and lone reruns (#544).** Ticket and join `gates_run`
records journal the test cases that failed in any bun or junit run, as
`failed_cases: [{ file, full_name }]` (failures only; left out with none, and
in old journals). Red checks already journal their whole run. Replay keeps a
run-wide list of old-test failures: a failed test that passed at that
ticket's baseline.

- When a ticket's red check or own gates fail, and every old test they failed
  also failed in another ticket within 10 minutes, by record time and
  journaled earlier, the next step is a **lone rerun**: the same check, with
  `exclusive: true`, before any fix round. Each of its test commands waits
  until no other test run is going and holds every test slot (with or
  without `test_concurrency`). Its record says `exclusive: true`.
- A passing lone rerun goes on; a failing one starts the usual fix round.
  Each check (the red check, the gates) gets one lone rerun per ticket.
- A check that failed no old test, only new ones, or whose old tests failed
  elsewhere more than 10 minutes apart, goes to the usual fix round. A join's
  gates add to the list but get no lone rerun.

**Slow tests (#563).** A repo with a long end-to-end suite names it in
`checks.slow_test`, and leaves it out of `checks.test`. It has the same shape
as `checks.test`: one command, or a list of commands and `{ run, results }`
entries. This repo splits its suite in two:

```json
{
    "checks": {
        "test": "bun test packages --path-ignore-patterns='**/*.e2e.test.ts'",
        "slow_test": "bun test .e2e.test"
    }
}
```

The engine runs the slow tests only at the final review: once round 1's
lenses are in (the `run_final_slow_tests` step, after the prepare command,
journaled as `gates_run` with `target: final_slow`), and in the final
review's gates (the `run_final_gates` step, and so its fix rounds' gates),
as `slow_test` checks after the `test` checks and before `types`. A ticket's gates, a
join's gates, the baseline, and the red check never run the slow suite. Failed slow
tests open a final review fix round, and in it they go into the gate fix
loop like any failed gate (see "The final review"). Slow
commands get the same time limit as the others, `test_timeout_ms`, and a
slow command that runs out of time says so. Agents may run each slow
command, like the test commands (a `bun` one may take extra arguments), and
the implementer's instructions say they run at the final review, and that the
ticket's gates also run the slow test files it added or changed (see the next
paragraph). Left out, nothing changes: no `slow_test` check, no extra command.

**A ticket's own slow tests (#564).** The fast command leaves out every slow
test file, so a ticket that adds or changes one would never run it. With a
slow command, three steps also run the test files a ticket touches that the
fast run gave no results for, on their own, with plain `bun test` and each
file as a quoted `./` path (never the fast command plus the files: Bun's
`--path-ignore-patterns` leaves out even files named on the command line):

- The **red check** runs the files the test map names or the ticket changed,
  after `checks.test`. When that run gives results, it is joined to the fast
  run's: a new slow test that fails counts as failing, one that passes
  already is refused, and the journaled `red_check` run's `command` shows
  both commands. When it gives no results at all (every file still doesn't
  load, as a new fast test file usually doesn't before its code exists), the
  fast run stands as it is: its command and output are what they were before
  #564, and a slow file that doesn't load still counts its named tests as
  failing. The comparison with the baseline's old tests is unchanged. A file
  a `run_files` entry owns (see below) isn't in this run.
- A **ticket's gates** run the test files it changed since its base, after
  `checks.test`, as one more `test` check. A failure is a failed test gate
  with its output, and goes into the gate fix loop. A run that gives no
  results adds no check after a failed fast run (the gate fails anyway, and
  the load error shows on the next run, once that is fixed); with every fast
  run passing, a changed slow file that can't load is a failure. A join's
  gates don't.
- The **already-done check** runs the named test files with plain `bun test`,
  so a named slow test really runs.

Each of these runs gets `test_timeout_ms`. A repo with no `checks.slow_test`
runs the same commands as before.

**A ticket's own slow tests through `run_files` (#683).** A `pass_fail` slow
command, such as an XCUITest suite, can't be given files the way `bun test`
can. A `checks.slow_test` entry can say how to run some of its files with two
fields that come together: `file_patterns`, the globs of the test files it
owns (a file must match `test_file_patterns` too), and `run_files`, the
command that runs some of them, with the literal text `{files}`:

```json
{
    "test_file_patterns": ["src/**/*.test.ts", "ui/**/*.test.ts"],
    "checks": {
        "test": "bun test src",
        "slow_test": [
            {
                "run": "bun run test:ui",
                "results": "pass_fail",
                "file_patterns": ["ui/**/*.test.ts"],
                "run_files": "bun run test:ui:files {files}"
            }
        ]
    }
}
```

A ticket's gates (`target: ticket`) run the test files the ticket changed
since its base, still in the worktree, that match an entry's `file_patterns`,
once through each such entry, in config order, after the test checks and
before types and lint. Every `{files}` becomes the files: repo-relative
paths, each in single quotes, separated by one space. Each run is a
`pass_fail` check named `own_slow_test`, in a test slot, with
`test_timeout_ms`, and its recorded `command` is the filled-in one. Those
files leave the own-files `bun test` run above. An entry that owns none of
the ticket's files adds no check. A join's gates, the already-done check,
and the final review's whole slow suite don't change. The config is refused
when it loads if `run_files` has no `{files}`, if an entry has only one of
the two fields, or if a `checks.test` entry has either.

The **red check** runs those files too, before any code exists. Of the
ticket's changed files an entry owns, the ones that hold a test the test map
names run once through that entry's `run_files`, with `test_timeout_ms`; a
file with no mapped test isn't run. A `pass_fail` run gives no per-test
results, so each mapped test there is judged by the run's exit code, after
the usual check that its name is in its file's text (a name that isn't is the
"not found in the file" problem). A non-zero exit means those tests are red,
as they should be. An exit of 0 fails the red check with one problem per
entry, `These slow tests passed before any code was written: ` and the files,
comma-separated. A run stopped by `test_timeout_ms` fails it with
`These slow tests timed out in the red check: ` and the files. So a repo's
`run_files` script must exit non-zero when the tests fail, and finish within
`test_timeout_ms`.

**The fast test speed limit (#580).** A fast test should be fast. A repo says
how fast with `test_case_timeout_ms` (a positive whole number of
milliseconds) in `.luca/config.json`; this repo's is 2000:

```json
{ "checks": { "test": "bun test" }, "test_case_timeout_ms": 2000 }
```

- It goes to every `bun` command of `checks.test` as `--timeout=<n>`, in every
  run of it: the baseline, the red check, the already-done check, and the
  gates (`caseTestCommands` and the gates' fast test call). The one exception
  is the already-done check when `checks.slow_test` is set: it runs the named
  files with plain `bun test` (so a named slow test really runs), which gets no
  `--timeout`. `scripts/run-checks.ts` does the same, so the PR check and the
  gates agree. Agents' own `bun test` runs stay as they wrote them.
- It applies to every fast test with no timeout of its own, old ones too, in
  the baseline, red check, join, and final runs. A test that was always
  close to the limit can time out on a busy machine; if one does, raise
  `test_case_timeout_ms`.
- A test's own timeout option (`test(name, fn, 30_000)`) overrides
  `--timeout`, so the flag alone does not hold a test that sets its own. In a
  ticket's gates, the tests in the files the ticket changed are also checked
  by their measured time (`duration_ms`): a test that passed but took longer
  than the limit fails the `test` check. Tests in files the ticket did not
  change are not measured (a flaky old test must not fail an unrelated
  ticket), and neither are a join's or the final review's gates.
- A test that fails the limit, by `--timeout` or by its measured time, gets
  this line at the top of the check's output: "A fast test may take at most
  2000 ms (`test_case_timeout_ms`). Make it faster, or move it to the slow
  tests." A measured-time failure also lists each slow test with its time
  (`- src/a.test.ts > a > b: 2300 ms`), under "Too slow for a fast test:".
  The implementer's instructions name the limit, and say that a ticket test
  that can't meet it is a `bad_test`.
- `checks.slow_test`, a ticket's own slow files (#564), and `pass_fail`
  commands never get the flag: they are not fast tests. Left out, every
  command runs exactly as written.
- A `junit` command (#668) never gets the flag either: `swift test` doesn't
  take it, and Swift Testing's `.timeLimit` and XCTest's
  `executionTimeAllowance` only work in whole minutes. Its tests in the files
  a ticket changed are held to the limit by their measured time alone (from
  their JUnit `time`), with the same lines.

**junit commands everywhere (#668).** The baseline, the red check and the
already-done check run `caseTestCommands`: every `bun` and `junit` command of
`checks.test`, in config order, joined into one run (`runCaseTests`, see
`joinRuns`), so `baseline_tests` and `red_check` hold the Swift cases too.
The already-done check runs each `junit` command whole, with no files after
it (when a named file is one bun can't run), and finds the named cases among
its results. In the gates, a `junit` command's failed run fails its `test`
check with its output, and its cases join the gates' `cases` and
`failed_cases`, so the empty-test check, lone reruns and shared failures read
them like bun's. With a `junit` command in the config, the own-files run
(#564) takes only files bun can run. All of this reads only the `.swift`
files `test_file_patterns` matches, so a Swift repo lists its tests there,
such as `"packages/ios/**/Tests/**/*.swift"`: with the default,
`**/*.test.ts`, each Swift case's `file` is its classname with no
`assertions`, the speed limit never measures it, and the test-writer may not
write a `.swift` test.
