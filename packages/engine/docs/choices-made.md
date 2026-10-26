# @luca/engine: choices made

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
- **A repo without the labels** (no `luca setup` yet) still gets them: adding
  a label the repo doesn't have creates it first, with the same color and
  description `luca setup` gives it. Removing a label the issue or the repo
  doesn't have does nothing.
- **A label that won't move doesn't stop a refusal.** If adding or removing
  a label still fails, the comments are posted anyway, the failure goes in
  `intake_refused` as `label_failures` (the issue, the label, add or remove,
  and the error), and the run ends refused, not crashed. A redo after a crash
  doesn't post a refusal comment twice.
- **Tickets for a person are left out, not refused** (#499). A ticket with
  `ready-for-human` is left out, and so is a ticket waiting on one. A ticket
  with neither ready label (or with `needs-info`) is still refused. A ticket
  with both `ready-for-agent` and `ready-for-human` counts as for a person:
  leaving it out is the safe side, since no agent does a person's work, and
  the PR and board still name it. A left-out agent ticket is still checked,
  so a later run can build it.
- **Blockers** are native "blocked by" links plus `#N` refs in a ticket's
  "Blocked by" section. A closed blocker is fine anywhere; an open one must be
  an open ticket of the same spec, and those must not form a loop.

- **Run branch:** `luca/spec-<n>-<run_id>`, in a worktree at
  `<run folder>/run-branch`. Each ticket's branch is `<run branch>--ticket-<n>`,
  in `<run folder>/tickets/<n>`. Test reports go in `<run folder>/reports`, so
  they are never leftovers.
- **Runs start from `origin/<base>`.** A new run fetches its base branch
  (`main`, or `--base`) from `origin` and makes the run branch from
  `origin/<base>`, never from the local branch, so it never builds on stale
  code. A resumed run keeps the run branch it made and doesn't fetch. A
  failed fetch stops the run before anything is built (`run_stopped`, and a
  message that names the fetch); the spec and tickets aren't blamed, and
  `--resume` tries the fetch again.
- **Test commands (#428):** `checks.test` is one command string, as before,
  or a list of test commands, for a repo with more than one test runner. Each
  list entry is a command string or `{ "run": "...", "results": "..." }`.
  `results` says how the engine reads the command's results: `bun` (bun's
  per-test results), `junit` (per-test results from the JUnit files the
  command writes, #668) or `pass_fail` (just its exit code). Left out, it is
  `bun` for a command starting with `bun test` and `pass_fail` otherwise;
  `junit` is only ever set by hand. For example, tmnb's:

  ```json
  "test": ["bun test", { "run": "bun run test:workers", "results": "pass_fail" }]
  ```

  A `junit` entry names the files its command writes in `junit_path`: one
  path or a list, each a file inside the repo relative to its root (not
  absolute, not climbing out with `..`, not ending in `/`). The loader
  refuses a `junit` entry without `junit_path`, and a `junit_path` on any
  other kind. For a `swift test` command, list both of SwiftPM's files:

  ```json
  {
      "run": "bun run ios:test:core",
      "results": "junit",
      "junit_path": [
          "packages/ios/.derived/junit/core.xml",
          "packages/ios/.derived/junit/core-swift-testing.xml"
      ]
  }
  ```

  List the `.swift` test files in `test_file_patterns` too, such as
  `"packages/ios/**/Tests/**/*.swift"` (the tests only, not `Sources/`). The
  engine ties Swift cases to files and counts their `assertions`, the red
  check and the speed limit find tests, and the test-writer may write tests,
  only among the files those patterns match. The default, `**/*.test.ts`,
  matches no `.swift` file.

  Intake counts a `junit` command like a `bun` one, and refuses each
  `junit_path` entry git doesn't ignore (read into `intake_read` as
  `junit_paths_not_ignored`), so a test run can't get it committed.

  Every test command runs as a gate, in order, after each ticket and in the
  final review; a failing one goes into the gate fix loop with its output.
  The engine adds bun's JUnit reporter flags to the end of each `bun`
  command to learn each test's outcome, runs a `junit` one as written and
  reads its JUnit files, and runs a `pass_fail` one as written. The
  baseline, the red check and the already-done check run every `bun` and
  `junit` command, in config order. Intake refuses a run with no `bun` or
  `junit` command unless every open ticket is a refactor ticket. Agents may
  run each test command exactly; `bun` and `junit` ones may also take extra
  arguments. A repo with no test files passes the baseline.
- **Slow test commands (#563):** `checks.slow_test` is a test command setting
  of the same shape as `checks.test`, for the tests `checks.test` leaves out.
  See "Slow tests (#563)" above. It is frozen for a run, like `checks.test`.
- **A new test file that doesn't load yet** (it imports code not written yet)
  reports no results. Its tests count as failing if their names are in it.
- **Engine commits skip git hooks** (`--no-verify`): the engine already ran
  the gates, and hooks that run tests from inside a run have frozen machines.
- **A test-writer answering "nothing new to test"** makes the ticket stuck at
  once. That answer means the ticket changes no behavior, so the hint speaks
  only to that: add the `refactor` label, then reply `retry`. A ticket whose
  work is already done is a different answer, `already_done`, and is never
  stuck.
- **`may_edit_tests`** on each launch tells the launcher's guards whether the
  agent may edit test files: true for the test-writer and for a refactor
  ticket's implementer, false otherwise (`mayEditTests`). A follow-up keeps
  the guards its session was launched with; the engine looks the value up
  again from the ticket for its after-turn check.
- **The PR's assumptions** come from every agent turn on a ticket, fix rounds
  and bounced test-writers included, each listed once.
- **Run notes:** every fresh agent (`launch_agent`, reviewers included) gets
  the run's `MAX_RUN_NOTES` (10) newest notes at the end of its prompt, under
  "Run notes from earlier agents in this run", oldest first, each with who
  wrote it (`- <note> (test-writer, #11)`). The same text twice is listed
  once, where it was last written. With no notes there is no section.
  Follow-ups don't repeat them. Replay keeps every note in `run_notes`, from
  the `agent_finished` records, in journal order; the prompt itself is
  journaled word for word in `agent_started`. Recalled memories (#370) sit
  next to them, after them at the prompt's end; the run's start memories
  sit at its top (see "Memory").
- **Lockfile updates (#373):** agents never run the install; the prompts say
  so, and every guard layer blocks it (#384). The hook denies package
  managers, `bun` install subcommands, `bunx <package>`, and Bun's
  auto-install flags (`-i`, `--install`) even on the test command; the
  permission rules deny the same for every role; no role writes a lockfile
  or `node_modules`, and the sandbox shuts both. The engine runs it itself, between agent
  turns, so its changes are never blamed on an agent: each turn's after-turn
  snapshot is taken right before that turn. When a `package.json` differs from the worktree's base, the gates
  start with an `install` check: `bun install` in a ticket worktree (it may
  update `bun.lock`, which the green commit then takes), and
  `bun install --frozen-lockfile` on the run branch. A failed install fails the
  gates without running the rest, and goes through the gate fix loop like
  any failed gate: the implementer gets its output in a follow-up.
- **Review rounds:** "at most 3 review rounds" means 3 review fix rounds,
  like the other loops: the first review, then up to 3 fixes, each checked
  by a fresh re-review. The 4th review still asking for changes is stuck.
- **Findings are the truth** for what goes back: the verdict must agree with
  them, and only blockers and should-fixes are sent to fixers.
- **Installs in new worktrees (#382):** a fresh worktree has no
  `node_modules`, so right after the engine makes the run branch's checkout
  or a ticket worktree it runs `bun install --frozen-lockfile` there, before
  any test, agent, or gate, and journals `dependencies_installed` (`check` is
  `null` when there's no `package.json`, so nothing to install). The install
  must not change the lockfile. A failed install is stuck at once as
  `install_failed`, with the command and its output: no agent can fix it,
  since agents never run the install. A failure in the run branch's checkout
  makes the first ticket stuck, before its worktree is made.
- **SDK version:** `@anthropic-ai/claude-agent-sdk` 0.3.273, pinned. Newer
  releases were younger than `bunfig.toml`'s 7-day minimum release age.
- **Reviewers can't run the tests.** They get read-only commands only; the
  engine already ran the gates.
- **A check command with shell syntax** (such as `... > /dev/null` or
  `a && b`) runs only exactly as configured, and gets one exact permission
  rule. Checked against the live CLI (Claude Code 2.1.280, SDK 0.3.273) for
  #384: under `dontAsk` both a redirect and `&&` run. A `bun` test command
  may take extra arguments only when it is one plain command. A check that
  redirects into the worktree writes a file there, which a test-writer may
  not: prefer `> /dev/null`.
- **`rm` takes files one by one** (`-f` at most): no folders, wildcards, or
  `~`, so every path is checked against the role's rules.
- **`sed` is `sed -n '<from>,<to>p'` only**, and `git` only `status`, `diff`,
  `log`, `show`, `ls-files`, and `blame` with no options before the
  subcommand, no `--output`, and no `--ext-diff`.
- **Undoing a violation** puts back each offending path's bytes from before
  the turn (tracked paths from HEAD, new paths removed), and moves HEAD and
  the branch back with a mixed reset, which keeps the files (#384):
  - In the shared `.git`, only the ticket branch's own config section
    (`branch.<branch>.*`) is the agent's: no one else works on that branch
    during the turn, and the engine pushes without `-u`. A change there is
    undone key by key (its keys unset, the saved entries added back in
    order); every other key in `.git/config` stays as it is (#396).
  - The rest of the shared `.git` (other config keys, `info/exclude`,
    `hooks`) is changed by other processes in the same repo, such as
    another agent's `git push -u`, and the sandbox and guard keep the agent
    out of it. A change there is journaled as `shared_git_changed`, never
    blamed on the agent, and never undone. It can't fool the check either:
    every git command the check runs has `core.fsmonitor=false` and
    `core.hooksPath=/dev/null`, and files are listed with the ignore rules
    from before the turn (the global excludes file, then `info/exclude`),
    not the live ones, so an excludes entry added mid-turn hides nothing.
  - A new branch or tag at HEAD is moved to `refs/luca-undone/...`, never
    deleted: refs are shared, and the engine can't tell who made one. The
    engine's own run and ticket branches are left out of this check.
  - A new stash entry on the ticket branch is dropped.
  - A changed or deleted file under `node_modules` can't be put back from
    saved bytes (there are too many), so its package folder is removed and
    the engine runs `bun install --frozen-lockfile`. If that fails, the
    turn's error says so.
- **Ignored files the after-turn check watches:** anything under
  `node_modules`, lockfiles, test and test setup files, and `.env` files
  (Bun loads them into every check). Other ignored paths, such as build
  output and caches, are what check commands write, so they are not
  watched. Under `node_modules` a file's fingerprint is its size, inode, and
  change time, not a content hash: hashing every file each turn takes
  seconds, and no process can set a change time back.
- **Engine retries live in the decision step,** not the executor: the
  executor journals each failed turn once, and replay counts `failed_tries`
  per role (cumulative on the ticket) and `engine_failures` (in a row, reset
  when any other turn ends), so a crash never loses or repeats a count.
- **Follow-ups use the SDK's streaming input.** The Claude launcher keeps
  each session open after its turn, keyed by the `session_id` from its init
  message, and `followUp` pushes the next user message into the same
  session, with the same checks on its messages. A session with no init id
  is closed at once, so a follow-up to it fails as `engine`. A stop, an
  engine failure, or a timeout closes the session; so does sitting idle past
  `idle_timeout_ms` (30 minutes by default). `closeAll()` closes the rest;
  call it when the run ends.
- **Finished agents' sessions close during the run** (#409). Before each
  decision, `runEngine` closes every session nothing can send a follow-up
  anymore (`finishedSessions`) with `closeSession`, and journals each as
  `agent_session_closed`: the test-writer's after the red commit, the
  implementer's after the green (or a review fix round's) commit, the final
  review's fixers after the round's fix commit, and reviewers, lenses, and
  the learner once their turn ends. A stuck ticket or final review closes its
  sessions before `ticket_stuck` or `final_review_stuck`; a plan cut-off or a
  stop closes the turn's session at once; a stopped, finished, or crashed run
  closes the rest. A same-session fix round keeps its session until its loop
  is over. The decision step never follows up a closed session: a review
  fix round or a clash fix after the green commit goes to a fresh
  implementer.
- **A stop leaves the step open.** `run_stopped` changes no ticket's state
  and closes every open step without counting it as a crash, so a later
  `runEngine` on the same journal takes the step again as it was; it does not
  count toward `MAX_CRASHES`. A billing stop (`billing: true`) and a stop for
  crashes (`crashed: true`) are the exceptions: they stick.
- **Denial counts** come from the result's `permission_denials` only (the
  tracer counted them twice), plus the guard hook's own denials.
