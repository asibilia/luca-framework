# @luca/engine: the prepare command

This page goes on from [How a run moves](how-a-run-moves.md). It goes on in
[Test limits and slow tests](test-commands-and-limits.md) and
[Leftovers, commits, and changesets](leftovers-and-commits.md).

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
