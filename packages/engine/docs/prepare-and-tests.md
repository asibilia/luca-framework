# @luca/engine: prepare, tests, and commits

This page goes on from [How a run moves](how-a-run-moves.md).

**A prepare command (#481).** Some repos' tests need files only a build
makes, and a fresh worktree doesn't have them when they're gitignored. Such a
repo names the build as `prepare` in `.luca/config.json`, as HeartGold does:

```json
{ "checks": { "test": "bun test" }, "prepare": "bun run build:rom" }
```

The engine (never an agent) runs it in a checkout before every test run
there: the baseline, the red check, every gate run and fix-loop re-check, the
run branch's gates after a join, and the final review's gates. It runs every
time, not once, because a ticket's code changes what the build makes;
incremental builds keep later runs quick. In the gates it is the `prepare`
check, after any `install`; a failed one fails the gates without running the
rest and goes through the gate fix loop, and a failed one at the red check is
one more red check problem for the test-writer. A failed one at the baseline,
before any agent worked, leaves the tests unrun and is stuck at once as
`prepare_failed`, with its output: only a person can fix a build that can't
run (a missing toolchain, say). The baseline's prepare is journaled as its
own `baseline_prepared { check }`, before the `baseline_tests` it lets run;
a `retry` runs it again. The prompts of fresh
test-writers and implementers name the command, so they know tests needing
its outputs may fail when they run them and pass at the engine's checks.
Without `prepare`, nothing changes.

**The prepare time limit (#485).** A first build in a fresh worktree can be
slow: HeartGold's takes about 8 minutes. So `prepare` gets 30 minutes, not
the 5 minutes other commands get. A repo with a slower build raises it with
`prepare_timeout_ms` (a positive whole number of milliseconds) in
`.luca/config.json`:

```json
{ "checks": { "test": "bun test" }, "prepare": "bun run build:rom", "prepare_timeout_ms": 3600000 }
```

A prepare that runs out of time fails like any other. Its output starts with
"Timed out after 30 minutes" and says to raise `prepare_timeout_ms`.

**The test time limit (#542).** Each test command gets 5 minutes
(`DEFAULT_COMMAND_TIMEOUT_MS`), every time the engine runs one: the
baseline, the red check, the already-done check, and the gates. A repo with
slower tests raises it with `test_timeout_ms` (a positive whole number of
milliseconds) in `.luca/config.json`:

```json
{ "checks": { "test": "bun test" }, "test_timeout_ms": 900000 }
```

It holds for both kinds of test command (`bun` and `pass_fail`). Types and
lint keep 5 minutes. A test command that runs out of time fails, and its
output starts with "Timed out after 5 minutes" and says to raise
`test_timeout_ms`.

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
  failing. The comparison with the baseline's old tests is unchanged.
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

**The fast test speed limit (#580).** A fast test should be fast. A repo says
how fast with `test_case_timeout_ms` (a positive whole number of
milliseconds) in `.luca/config.json`; this repo's is 2000:

```json
{ "checks": { "test": "bun test" }, "test_case_timeout_ms": 2000 }
```

- It goes to every `bun` command of `checks.test` as `--timeout=<n>`, in every
  run of it: the baseline, the red check, the already-done check, and the
  gates (`bunTestCommands` and the gates' fast test call). The one exception
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

**One prepare at a time (#492).** A build uses a lot of CPU, so builds at
the same time only slow each other down. HeartGold's first build takes 8 to
10 minutes alone; four at once took 19 to 25 minutes each. So the engine
runs one prepare at a time, across every ticket in the run. The others wait
their turn, in order. A repo whose builds are light can allow more with
`prepare_concurrency` (a positive whole number) in `.luca/config.json`:

```json
{ "checks": { "test": "bun test" }, "prepare": "bun run build:rom", "prepare_concurrency": 2 }
```

The time limit starts when a prepare starts, so waiting for a turn never
counts toward `prepare_timeout_ms`.

**A timeout stops everything (#485).** Every command the engine runs gets its
own process group. When one runs out of time, the engine kills the whole
group: the shell and all it started (`make`, the compiler, `wine`...). It
then waits at most 2 seconds more for output, so a child that left the
group can't hold the step open. The result says `timed_out: true`, with no
exit code. If the engine itself is stopped (Ctrl-C, say), it passes the
signal on to the commands it is running.

**Files prepare makes stay out of the ticket (#486).** A build can leave
files the repo's `.gitignore` misses. HeartGold's prepare links its vendor
tools in as symlinks to folders, and its `.gitignore` names those paths as
folders (`decomp/tools/bin/`). Git sees a symlink as a file, so the folder
pattern misses it and the link shows up as untracked. Such paths are not an
agent's work. Each time the engine runs prepare, it lists the untracked
paths before and after. The new ones are journaled as
`prepare_made { paths }`, right after that prepare run. From then on, in
every checkout of the run, the engine leaves those paths out of the
ticket's changes: the leftover scan skips them, no commit takes them (not
even the changeset's), and the guard never judges an agent by them, so an
agent that runs the build itself isn't blamed for what it rewrote. The
engine does not write them into `.git/info/exclude`: a ticket's worktree
shares that file with your own checkout, so it would hide them there too.

**Links that point outside the checkout are never committed (#496).** A
run started on an older engine (14.0.0-alpha.1 or before) never noted what
prepare made. Resumed on a newer engine, its worktrees may still hold
prepare's links, and prepare won't make them again, so the engine can't see
them appear. So before every commit (and at the red check), the engine
looks at each untracked symlink. One whose target is outside the checkout
only works on one machine, so no commit may hold it. The engine leaves it
out, like what prepare made, and journals it once as
`prepare_made { paths, outside_links: true }`. The link stays in the
worktree, untracked. The ticket doesn't get stuck on it, since such links
are almost always prepare's.

Three limits. Only untracked paths count: a tracked file prepare changes
still shows as the ticket's change. If the engine crashes in the middle
of a prepare run, the redo can't tell what the first try already made, so
those paths count as the ticket's unless an earlier prepare run already
noted them. And on a run from an older engine, only outside-pointing links
are caught: other files its prepare made still count as the ticket's.

**Nothing to commit never crashes the run (#494).** When prepare made every
change in a worktree, there is nothing left to commit, and `git commit`
would fail. So the engine never runs it then. At the red check, a
test-writer turn that changed no file is one more red check problem ("No
file changed, so the red commit would be empty"), for the test-writer's fix
loop. At any other commit (green, a review fix round, the final review),
the engine journals the current commit as `commit_made` with no files and
moves on. A green stage can be empty that way when a rebase finds the
ticket's change already on the run branch.

An odd path in a worktree never crashes the run. The engine reads a
changed path as git stores it: a symlink as its target (never followed), a
folder as no text. A folder with its own git repo in it, which git can't
commit as files, is a leftover scan hit, so the ticket gets stuck with that
reason.

**Files a tool loads by name are not "unused" (#507).** The leftover scan's
"a new script or module that nothing uses" skips files a tool or framework
loads by their name or folder, so nothing imports them: `*.config.{ts,js,mjs,cjs,mts,cts}`
(vite, vitest, eslint, tailwind, postcss, react-router, astro, next...),
`entry.server.*` and `entry.client.*`, `root.*`, `routes.*`, `middleware.*`,
and any file under `app/routes/`, `pages/`, `src/app/`, or `src/pages/`, at
any depth. The allowlist is `LOADED_BY_NAME` and `ROUTER_FOLDER` in
`src/gates/leftover-scan.ts`.

**A file the repo names is neither unused nor scratch (#507).** Before the
scan, the engine looks for each scratch-named file (`debug.*`, `notes.*`,
`tmp.*`, ...) by its basename in the tracked files (`git grep`, the
worktree's text) and in the files the same change adds. If such a file
other than itself and the tests names it, as an addon's TOC (tracked, or
new in the same ticket) lists `core\debug.lua`, a `package.json` script
runs `tools/notes.ts`, or a config points at it, it is the repo's: never "a
scratch file". A mention in a test alone doesn't count, so a stray `tmp.ts`
a test names is still flagged as scratch, like a `notes.md` or `scratch.ts`
nothing names. A new code file needs no such look: "nothing uses it" already
searches for its name without the extension, which a file naming it holds,
so a file the repo names is never "unused".

**Docs the repo asks for pass (#520).** A new markdown file the spec and
ticket don't name is still let through when it is a `README.md`, sits under
a `docs` or `adr` folder at any depth, is named by a tracked or newly added
non-test file (the same look as for scratch-named files, so an index or a
table of contents counts), or matches a glob pattern in the config's
optional `leftover_allow`:

```json
{ "checks": { "test": "bun test" }, "leftover_allow": ["handbook/**/*.md"] }
```

Stray markdown next to code, such as `src/plan.md`, is still flagged. The
`leftover_scan` record lists each file let through in `passed: [{ path,
reason }]`, with `reason` `doc_place`, `named_by_repo`, or
`config_pattern`; it is left out when none was.

**Agents don't write changesets (#507).** In a repo with changesets
(`.changeset/config.json` when the run branch was made), the engine writes
the run's one changeset at PR time. So the test-writers' and implementers'
prompts (the final review's fixers too) say not to write one, even if the
repo's rules ask for it, and the rules lens is told the engine adds it.
One an agent writes anyway, a new `.changeset/*.md` other than
`.changeset/README.md`, is removed from the worktree before the leftover
scan and journaled as `changeset_dropped { paths }` (no ticket at the final
review's fix commit). It is no leftover hit, so the ticket moves on. Edits to
`.changeset/config.json`, `pre.json`, or the README are the agent's work and
are committed as usual.
