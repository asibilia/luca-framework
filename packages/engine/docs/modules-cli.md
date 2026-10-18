# @luca/engine: modules in `src/cli/`

The `luca-run` and `luca` command lines, and the adapters they use. A module in
another folder is on its folder's page; the [README](../README.md) lists them.

| Module | What it does |
| --- | --- |
| `src/cli/luca-run.ts` | The `luca-run` command line (the package's `bin`). |
| `src/cli/run-args.ts` | Reads `luca-run`'s flags. |
| `src/cli/run-modes.ts` | A real run of a spec (`runSpec`), going on with a run from its journal (`resumeRun`), the runs that are not over (`unfinishedRuns`), how to resume one (`resumeCommand`), and the practice `--demo`. |
| `src/cli/luca.ts` | The `luca` command line (a `bin`): `luca init`, `luca setup`, `luca upgrade`, `luca doctor`, and a quiet `luca hook`. |
| `src/cli/setup-command.ts` | `luca setup`'s flags, wired to the real repo adapters. |
| `src/cli/setup.ts` | Gets a repo ready for Luca (`runSetup`): labels and the config, then `repoChecks` once; `repoChecks` are its checks, read-only, for `luca doctor` too. |
| `src/cli/repo-adapters-real.ts` | The real repo adapters `luca setup` and `luca doctor` share: the repo's GitHub side and MuninnDB over MCP. |
| `src/cli/computer-adapters.ts` | The adapter types `luca init`, `luca doctor`, and `luca upgrade` share (MuninnDB, `claude mcp`, Paseo, the computer's tools), and their constants. |
| `src/cli/computer-adapters-real.ts` | The real ones, and where the installed Luca and its board are (`lucaInstall`, its version from `config/luca-version.ts`). |
| `src/cli/muninn-entry.ts` | Claude Code's user-scope `muninn` entry: what's right (`rightEntry`), and making it right (`ensureMuninnEntry`). The token is never shown. |
| `src/cli/board-in-paseo.ts` | Puts the board into Paseo from Luca's folder, settings kept, and writes its engine and Bun paths (`placeBoard`, `setUpBoard`). |
| `src/cli/upgrade-command.ts` | `luca upgrade`'s flags (`--finish` included) and its real npm registry, `bun add -g`, and new-install adapters: finding the new install (`findNewInstall`) and handing off to it (`handOff`). |
| `src/cli/upgrade.ts` | Moves to another version of Luca (`runUpgrade`): refuses while runs go, picks the version on the installed channel (`channelTarget`), installs it, then hands the last steps to the new install. |
| `src/cli/upgrade-finish.ts` | `luca upgrade`'s last steps (`finishUpgrade`), run by the version just installed: reloads the board, copies Luca's skills, and ends with doctor's computer checks. Older Luca looks for this file, so don't rename it. |
| `src/cli/going-runs.ts` | The runs that are going (`goingRuns`), from their journals, the board's run registry, and `ps`; and the unfinished runs nothing runs now. |
| `src/cli/live-runs.ts` | Which runs have a live engine: every process's command line from `ps` (`listProcesses`), and the run ids in them (`liveRunIds`). A copy of the board's check. |
| `src/cli/doctor.ts` | `luca doctor [--fix]` (`runDoctor`): the computer and repo checks, and the safe fixes. |
| `src/cli/doctor-checks.ts` | A doctor check (OK, warning, or problem, with its fix), how checks print, and version comparison. Pure. |
| `src/cli/computer-checks.ts` | Doctor's computer checks: Bun, the `luca` copies on the PATH, Claude Code, `gh`, Paseo, the board, MuninnDB and its Claude Code entry, the planning skills, and Luca's own skills. |
| `src/cli/luca-skills.ts` | Luca's own Claude Code skills (#504): which there are (`lucaSkills`, every folder in `skills/` with a `SKILL.md`), the files each ships, how the copy in `~/.claude/skills` differs (`skillDrift`), and copying them there (`installLucaSkills`). |
| `src/cli/doctor-command.ts` | `luca doctor`'s flags, wired to the real adapters. |
