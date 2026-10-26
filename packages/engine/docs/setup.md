# @luca/engine: publishing and setting up

## Publishing Luca

Runs never use the development working copy. A **release** is a published
npm version of `@alecsibilia/luca`, and every run uses the installed one,
including runs on `luca-framework` itself, so a run can't change the engine
it runs on. Changes reach runs only by publishing. See
[For maintainers](../../luca/README.md#for-maintainers) in the publish
package's README for changesets, the Version PR, and the `alpha` guard.

`luca upgrade` moves this computer to another published version. It refuses
while any run is going (`goingRuns` in `src/cli/going-runs.ts`). A run is
going when its engine process is running, or when its engine is gone but the
board will restart it. Stuck runs and limit waits count, because their
engine keeps running while it waits.

- **Is the engine running?** Upgrade lists every process's command line with
  `ps -axww -o command=`. A line with `--run-id <id>` or `--resume <id>`, as
  whole words, means that run's engine is running. The board checks the same
  way; the engine has its own copy (`src/cli/live-runs.ts`), because neither
  package imports the other.
- **Will the board restart it?** Yes when the board started the run, its
  registry entry has no `ended`, it isn't a demo, it has automatic restarts
  left (fewer than 3), and its journal can go on.
- **`ps` fails:** every unfinished run counts as going, and upgrade says why.
  Upgrading under a live engine is far worse than a refused upgrade.
- **A run nothing runs** (it crashed, or the launcher stopped it) doesn't stop
  the upgrade. Upgrade lists it and says how to pick it up on the new
  version: `/luca-run resume <run id>` in a Paseo chat for a run the board
  started, so the board shows it live, else `luca-run --resume <run id>`.
  A billing stop never goes on, so it isn't listed.

After `bun add -g`, the rest of the upgrade runs in the version just
installed, not the one that installed it (#529). The process that runs
`luca upgrade` is the old version's, so its own board setup, skill list, and
checks are the old ones: a skill new in the release wouldn't be copied. So
upgrade finds the new install the way the PATH does (the `luca` in
`bun pm bin -g`), checks it is the version it just installed, and runs its
`luca upgrade --finish`. That reloads the board, copies the skills, and runs
the checks with the new code, its output goes straight to the terminal, and
its exit code is upgrade's. It doesn't check for going runs again or
install anything.

- **A version from before the hand-off** (such as `--to` an older one) has
  no `src/cli/upgrade-finish.ts` next to its `luca.ts`. Upgrade says so and
  runs the last steps itself, as before.
- **The hand-off fails to start, or exits non-zero:** the new version stays
  installed, and upgrade says what failed and what to run next.
- **Either way, the skill list comes from the install's `skills/` folder**,
  not a list in the code, so even old code copies every skill it ships.

## Setting up a repo

`luca setup` gets a repo ready for Luca in one step. Run it inside the
target repo:

```bash
luca setup [--base <branch>]
```

`luca` is the engine package's command for people (`src/cli/luca.ts`), next
to `luca-run`. `luca --help` lists its subcommands, and an unknown one prints
the usage and exits 2. `luca hook <anything>` exits 0 and prints nothing:
old Luca (v13) left a global Claude Code hook that runs `luca hook
stage-gate` before every edit, write, and shell call, and it must never block.

It never commits, and running it again gives the same result, so it doubles
as a health check.

- **Labels.** It creates `ready-for-agent`, `ready-for-human` ("Needs a
  person, not an agent"), `refactor`, and `needs-info` if they're missing. Labels that are already there are left as they are.
- **No `.luca/config.json` yet:** it writes a starting one from the
  `package.json` scripts. `test` and `test:*` become test commands: a script
  that is a `bun test` command runs as written and is bun-readable, and the
  rest run as `bun run <script>` and are pass-or-fail. A `type-check` or
  `typecheck` script becomes the types check (`bun run <script>`), and
  `lint` becomes `bun run lint`. Its `muninn.vault` is the repo's GitHub
  name (the `repo` of `owner/repo`), and the done list names it and says it
  can be changed.
- **An old-Luca config** (any key a new-style config doesn't have, such as
  `lucaVersion` or `muninn.todoBacklog`): it keeps `muninn.vault` (or an
  older top-level `vault`) and writes the rest fresh from `package.json`, as
  above.
- **A new-style config:** it leaves the file alone and only reports on it.
  With no vault, the vault is a to-do. Each test command is listed as
  bun-readable, junit-readable (`"results": "junit"`, #668) or pass or
  fail; with no bun or junit command, only refactor tickets can run, and
  that is a to-do.
- **junit commands (#668):** with a junit test command in the config, the
  repo group has a `junit` check. It reads each junit command, the root
  `package.json` script a `bun run <script>` command names, and the repo
  file that script starts (directly, or after `bash`, `sh` or `zsh`). A
  command whose texts have `swift test` but no `--parallel` is a warning
  (XCTest writes no JUnit file without it), and so is a `junit_path` that
  lists only one of SwiftPM's pair, `<name>.xml` and
  `<name>-swift-testing.xml` in the same folder. Several warnings make one.
  Like every warning, it doesn't fail doctor. A junit command's `.swift`
  test files must also match `test_file_patterns`, such as
  `"packages/ios/**/Tests/**/*.swift"`: neither setup nor the check adds
  them, and the engine reads and lets the test-writer write Swift tests only
  among those files.
- **Checks.** `gh` is logged in, the repo has a GitHub remote, its issues have
  sub-issues and issue dependencies, the base branch (default `main`) is on
  `origin`, and MuninnDB can search the config's vault (found as `luca-run`
  finds it).

It ends with a plain list of what's done and what's left, each to-do with its
fix, and a reminder that tickets needing tests the red check can't read (for
`tmnb`, new vitest tests) should be `ready-for-human`. Its last line says to
run `/setup-matt-pocock-skills` in Claude Code in the repo, so the planning
skills know it. A written config waits
in the working tree: check it, then merge it through a normal PR. It exits 0
when nothing is left to do and 1 otherwise.

`runSetup` (`src/cli/setup.ts`) is handed its GitHub adapter
(`SetupGitHub`) and memory client, so the tests (`src/cli/setup.test.ts`,
`src/cli/setup-junit.test.ts`) run it end to end with real git in
throwaway repos with a local bare `origin`, a fake GitHub, and a fake
MuninnDB. Its config side (guessing checks, the config report) is in
`src/cli/setup-config.ts`, doctor's repo group in
`src/cli/setup-repo-checks.ts`, and the `junit` check in
`src/cli/setup-junit-check.ts`.

## Checking a setup: `luca doctor`

```bash
luca doctor [--fix]
```

It checks this computer (Bun; exactly one `luca` on the PATH, and it's v14;
Claude Code 2.1.280+; `gh` signed in; Paseo 0.9.1+ with plugins on; the
board installed from Luca's own folder, loaded at the installed version, with
its engine and Bun paths; MuninnDB 0.11.0+ answering its health check, and
Claude Code's user-scope `muninn` entry with its token; the planning skills
still writing what intake needs; Luca's own skills, `/luca-unstick` and `/luca-retro`,
in `~/.claude/skills` as the installed Luca ships them), then, inside a repo, `luca setup`'s checks
without changing anything. Each line prints OK, or the problem and its exact
fix. It exits 1 on any problem. MuninnDB not installed (memory off) and
planning-skill drift are warnings, which don't fail it.

`--fix` fixes what's safe without asking: it starts MuninnDB, repairs the
`muninn` entry as `luca init` does, reloads (or moves) the board keeping its
settings and rewrites its paths, copies Luca's own skills again, and runs
`luca setup` in a repo, then lists
the files to commit. It never deletes and never commits. Installs, sign-ins,
Paseo's plugin consent, and other `luca` copies are only reported.

`luca init` ends with the computer checks, then, inside a git repo, runs
`luca setup` there, which ends with the repo checks. The board reports its loaded version through its `board.version`
RPC, from its version module (`packages/board/server/luca-version.ts`), which
Paseo bundles with the board: `dev (source)` from the repo's source, the
package's version once packed (`packages/luca/scripts/copy-sources.ts` stamps
it in the packed copy). The tests
(`src/cli/doctor.test.ts`) run doctor end to end in a throwaway home folder
and throwaway repos, with fakes for every tool.
