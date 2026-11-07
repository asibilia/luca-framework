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

**Warm builds (#721).** A repo that keeps its build caches inside the
checkout (a Swift repo's `.derived` and `.build` folders, say) gives every
new ticket worktree a cold build, so its baseline, red check and first gate
rebuild everything. Such a repo lists those folders in `build_cache_paths`
in `.luca/config.json`: repo-relative paths or globs. For
`asibilia/movie-rankings`:

```json
{ "build_cache_paths": ["packages/ios/.derived", "packages/ios/Packages/*/.build"] }
```

- In `create_ticket_worktree`, after the worktree is made and before
  `ticket_worktree_created`, the engine clones each one into it, so the
  baseline, the test-writer, the red check and the gates all start warm.
- It copies from two sources, and only reads them: first the run branch's
  worktree, then the repo's own checkout (`run_started`'s `repo`; none when
  that is `null`, in an older journal). An entry with no `*`, `?`, `[` or `{`
  is one path. A glob is expanded in each source (`Bun.Glob`, dot files
  too), and each match is copied from the first source that has it.
- Each path must be ignored by git: a match `git check-ignore` doesn't
  ignore in the new worktree is never copied, so a copied cache can't end
  up in a commit. `luca doctor` and `luca setup` warn about each path git
  doesn't ignore in the checkout (the `build_cache` check, see
  [Setup](setup.md)).
- Each copy goes to `<run folder>/cache-copies/<n>` first (`cp -c -R`, an
  APFS clone on macOS, else `cp -R`), then is renamed into the worktree, so
  a worktree never holds a half-made copy. That folder is cleared before and
  after. `create_ticket_worktree` already runs alone among the run branch's
  steps, so no join or gate writes the run branch's caches mid-copy.
- The journal has one `build_cache_copied { paths: [{ path, from }], ms }`
  per ticket when anything was copied (`from` is `run_branch` or
  `checkout`; `ms` is how long the copies and renames took), and one
  `build_cache_skipped { path, reason }` for each path not copied:
  `not_ignored`; `no_source`, when the entry matched nothing in either
  source (`path` is then the entry as written); `copy_failed`, with the
  copy's `error`; or `already_present`, on a redo after a crash. A skipped
  path only means a cold start: it never fails or blocks the ticket.
- A worktree reset (a bad-test bounce, a rebase) keeps the ignored files the
  worktree has, so nothing is copied again. A resume reloads the field (see
  [Crash recovery](crash-recovery.md)).
- Left out, it is `[]`, and nothing is copied. A trailing `/` is dropped.
  The loader refuses an entry that is empty, absolute, the repo root (`.`),
  or leaves the repo with `..`.
