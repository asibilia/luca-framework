# @luca/engine: modules

## Modules

| Module | What it does |
| --- | --- |
| `src/config/engine-config.ts` | Loads the per-repo engine config (`.luca/config.json`). |
| `src/config/config-reload.ts` | Pure: the config fields a resume takes again (`RELOADED_FIELDS`) and the ones it keeps (`FROZEN_FIELDS`), what changed (`configChanges`), and a config with the changes (`withConfigChanges`). |
| `src/config/luca-version.ts` | Luca's own version: the installed `@alecsibilia/luca` package's, or a dev value from the repo's source. |
| `src/journal/journal-record.ts` | The journal's record kinds and their content, as Zod schemas, from one module per area ([journal entries](journal-entries.md)). |
| `src/journal/journal.ts` | One append-only JSONL journal per run, outside git. |
| `src/journal/replay.ts` | Rebuilds a run's state from its journal. There is no status file. Its parts: [replay modules](replay-modules.md). |
| `src/journal/step-records.ts` | Pure: the steps a crash cut off (`resumeEntry`, the `run_resumed` a restarted engine appends), each step's crashes in a row, and a redo's first try. |
| `src/intake/intake-checks.ts` | Intake's pure checks: refused, nothing to do, or a snapshot, with the tickets left out for a person (#499). |
| `src/core/decide.ts` | **The decision step.** Pure: journal in, every action that can run now out (`decideSteps`); `decide` gives the first. |
| `src/core/decide-build.ts` | The build half of the decision step: each ticket's spine, the join queue, rebases after a clash, the PR, and removing worktrees. Its parts: [decide-build modules](decide-build-modules.md). |
| `src/core/decide-final-review.ts` | The final review's half of the decision step: its rounds, the five lenses at once, its fix rounds, and passed, stuck, or shipped. |
| `src/core/loop-caps.ts` | The caps of every fix loop (`MAX_FIX_ROUNDS`, ...), shared by the ticket steps and the final review. |
| `src/core/decide-plan.ts` | The plan half of the decision step: limit waits and billing stops. |
| `src/core/decide-crashes.ts` | The crash half of the decision step: a run-level step cut off by `MAX_CRASHES` crashes in a row stops the run for good. |
| `src/core/decide-stuck.ts` | The stuck half of the decision step: undoing a stuck ticket's join, telling the spec issue, reading replies, and acting on `retry`, `skip`, and `stop`. |
| `src/core/stuck-text.ts` | A skipped ticket's comment and answers to unusable replies; re-exports the stuck texts ([its modules](role-and-stuck-modules.md)). |
| `src/core/execute-stuck.ts` | Carries out the stuck steps on the tracker (comments, reading replies, skips), and `retry` (re-read the ticket: resume, start over, or refuse). |
| `src/core/already-done.ts` | A ticket whose work is already on the base branch (#484): its steps (`check_already_done`, `mark_already_done`, `close_ticket`, `finish_nothing_to_do`) and their texts. |
| `src/gates/already-done-check.ts` | Pure: the check of a test-writer's `already_done` evidence (#495). Each commit is on the base, each criterion names a test, and each named test exists, is as it is on the base, and passes there. |
| `src/core/execute-already-done.ts` | Carries out an already-done ticket's steps on the tracker: the spec comment, and closing the ticket with a comment in a run with no PR. |
| `src/core/decide-usage.ts` | The usage half of the decision step: each finished ticket's usage, then the run's. |
| `src/core/decide-run-budget.ts` | The run budget half of the decision step: the run stuck on its budget, its report, and the owner's `retry` or `stop`. |
| `src/limits/run-budget.ts` | Pure: the default run budget, a run's budget from its config, and its tokens so far. |
| `src/limits/plan-signals.ts` | Pure: what a rate-limit reading or a session says (fine, a limit, or billing). |
| `src/limits/plan-usage.ts` | Pure: a ticket's or the run's tokens and plan-window movement. |
| `src/limits/limit-wait.ts` | The engine's clock, waiting until a time, and the spec's limit-wait comment. |
| `src/core/fix-loop-text.ts` | The follow-up messages a fix loop sends: a failed red check's or gate's output, a failed try's error, or the files that clashed on the run branch. |
| `src/core/review-text.ts` | The **ticket review**'s texts: the reviewer's diff, gate results, and earlier findings (also after a ticket was sent back onto the run branch), and what each review fixer is sent. |
| `src/core/final-review-text.ts` | The **final review**'s texts: each lens's prompt (the whole run branch, the rule files for the rules lens, or a re-review of only the new changes), what each fixer is sent, and the open findings of a shipped final review. |
| `src/core/pull-request-text.ts` | The PR title and body: a shipped final review's open findings first, then the tickets it closes (an already-done one with its commits), the spec's open tickets not in the run, the tickets for a person and the ones waiting on them (#499), the agents' **assumptions**, the reviews' nits, and declined findings (the final review's too). |
| `src/core/not-in-run.ts` | Just before the PR: the spec's open sub-issues that aren't in the run (#484). |
| `src/core/left-out.ts` | The words for tickets left out for a person (#499): why each is out, the PR's "For a person" and "Waiting on a person", and why a run had nothing to do. |
| `src/core/execute.ts` | `runEngine`: the scheduler that runs tickets' steps at the same time. |
| `src/core/execute-action.ts` | Carries out one action. |
| `src/core/schedule-rules.ts` | An action's scheduler key, step name, and kind. |
| `src/core/execute-with-jev.ts` | An action with the decision model in shadow mode. |
| `src/core/run-start.ts` | A run's start, resume, and config reload records. |
| `src/core/execute-intake.ts` | Reads intake, or refuses the run. |
| `src/core/execute-waits.ts` | Limit waits, the billing stop, usage-line waits. |
| `src/core/execute-build.ts` | Carries out a build step through the git adapter, the gates, and the agent launcher. Its turn, gates, and commit helpers serve the final review too. |
| `src/core/build-context.ts` | `BuildContext` and the lookups every build step shares. |
| `src/core/worktree-changes.ts` | A worktree's changes, less what prepare made and outside links. |
| `src/core/agent-turn.ts` | One agent turn (`runTurn`), guarded and journaled; launches and follow-ups. |
| `src/core/execute-red-check.ts` | The red check step. |
| `src/core/execute-already-done-check.ts` | The already-done check step. |
| `src/core/commit-in.ts` | The leftover scan, then an engine commit (`commitIn`). |
| `src/core/execute-gates.ts` | Gates, the final slow tests, and the install in a worktree. |
| `src/core/execute-join.ts` | Undoing a join, rebasing a ticket, and sending its tests back. |
| `src/core/execute-final-review.ts` | Carries out a final review step on the run branch's worktree (reading the rule files for the rules lens), and `shipFinalReview`, the seam for a `ship` reply (#366). |
| `src/agents/agent-launcher.ts` | The agent launcher interface (`launch` a fresh session, or `followUp` in an open one), its failure kinds, and the session summary. |
| `src/agents/claude-launcher.ts` | The real launcher: one Claude Agent SDK session per agent, with every guard on, kept open for follow-ups. |
| `src/agents/claude-options.ts` | Pure: the model, effort, clean environment, and SDK options for one agent. |
| `src/agents/role-instructions.ts` | Each role's instructions, appended to Claude Code's system prompt ([its modules](role-and-stuck-modules.md)). |
| `src/agents/scripted-launcher.ts` | Scripted stand-in agents: write files, act (sending and receiving agent messages too), return a result or a failure, and record each launch and follow-up with its session and what it was handed. |
| `src/agents/message-tool.ts` | The engine's in-process MCP server `luca` with its `send_message` tool, and the hook that hands messages over after each tool call. |
| `src/messages/agent-messages.ts` | **Agent messages'** rules. Pure: journal records in, a message's fate (queued, not delivered, refused) or what waits for an agent out. |
| `src/messages/agent-messaging.ts` | One agent's messaging, backed by the journal: journals each message and each delivery word for word. |
| `src/agents/role-results.ts` | Each **role**'s result, as Zod schemas. |
| `src/agents/role-prompts.ts` | The prompt each agent starts with (spec, ticket, criterion ids, its address for messages, and the run's newest **run notes**), and its section after a clash: the clashed tests, the clashed code, or "re-review only the new changes". |
| `src/guards/role-rules.ts` | Pure: what each role may write and run, checked per tool call (`checkToolCall`) ([its modules](role-and-stuck-modules.md)). |
| `src/guards/guard-hook.ts` | The guard as the SDK's `PreToolUse` hook. |
| `src/guards/sandbox-settings.ts` | Pure: each role's OS sandbox, in absolute paths. |
| `src/guards/after-turn-check.ts` | Pure: compares a worktree before and after an agent's turn. |
| `src/guards/worktree-state.ts` | Snapshots a worktree and its git state, and undoes violations. The engine's own refs (the run branch, other tickets' branches) don't count. |
| `src/git/git-adapter.ts` | Every git side effect, one call at a time: worktrees (made and removed), commits, throwing away uncommitted work, replaying onto the run branch and undoing it, moving a ticket's change onto the run branch, pushes. |
| `src/git/path-text.ts` | Reads a changed path's text as git would store it: a file's text, a symlink's target (never followed), `null` for a folder or anything else. Never throws. |
| `src/git/outside-links.ts` | Finds the symlinks among some paths whose target is outside the checkout, which no commit may hold. Reads each target, never follows it. |
| `src/gates/test-runner.ts` | Runs the config's `bun` test commands with bun's JUnit reporter. |
| `src/gates/red-check.ts` | The **red check**. Pure. At most `MAX_TESTS_PER_CRITERION` tests per criterion, every new test mapped (#581), and every new test file in the feature map (#583). |
| `src/gates/new-tests.ts` | Pure: the test names in a test file's text (`testNamesIn`), and the ones a change added (`addedTestNames`, #581). |
| `src/gates/feature-map.ts` | Pure: the test files a repo's feature map lists (`featureMapFiles`, #583). |
| `src/gates/gate-runner.ts` | Runs the config's **gates**: each test command, types, lint. First, the install when a manifest changed. |
| `src/gates/prepare-slots.ts` | Lets only so many prepare runs go at once (`prepare_concurrency`, 1 by default); the rest wait their turn. |
| `src/gates/lockfile-install.ts` | Which install to run: in a new worktree, or before the gates when a manifest changed. Pure. |
| `src/gates/leftover-scan.ts` | The **leftover scan**. Pure. |
| `src/shell/run-command.ts` | Runs a command in its own process group, with a timeout, and collects its output. A timed-out command is killed with everything it started. |
| `src/tracker/tracker.ts` | The tracker interface: an object of async functions. Also the labels Luca creates, with their colors and descriptions (`RUN_LABELS`, `labelDefinition`). |
| `src/tracker/in-memory-tracker.ts` | A tracker in memory, for tests. It records the PRs it opens. |
| `src/tracker/github-tracker.ts` | The real tracker, through the `gh` CLI. Every call goes through one `gh` runner, which tests fake. A label the repo lacks is created before it's added. |
| `src/tracker/post-comment-once.ts` | Engine comments carry an invisible marker, so a step redone after a crash adopts its comment instead of posting it again, and the engine never takes its own comments as replies. |
| `src/testing/intake-fixtures.ts` | Spec, ticket, and journal builders for tests. |
| `src/testing/build-fixtures.ts` | Journal entry builders for each build step. |
| `src/testing/final-review-fixtures.ts` | Journal entry builders for the final review: rounds, lens turns, fix rounds, passed, stuck, shipped. |
| `src/testing/practice-repo.ts` | The end-to-end practice repo: a throwaway git repo, local `origin`, tracker, and scripted turns (or any launcher). `CLEAN_LENS_TURNS` are five approving lenses; its runs fall back on them for any lens the turns don't script. |
| `src/testing/many-tickets.ts` | The many-ticket practice runs: three tickets, two at once with a clash and one waiting on both (`SUM_PRODUCT_AVERAGE`); two tickets that break each other's gates after joining (`BROKEN_JOIN`); a plan limit with two tickets in flight (`LIMIT_HIT`); and a rebase across a new dependency (`REINSTALL`). |
| `src/jev/jev-schemas.ts` | The decision model's questions, requests, and answers, the engine's fixed choices, failure and off reasons, and the Clef model ids, as Zod schemas. The folder and names keep the Jev name, so old journals read. |
| `src/jev/clef-client.ts` | The decision model client for Cloudflare's **Clef** on Workers AI. Never throws, and never puts the token in an error. |
| `src/jev/decision-model-credentials.ts` | Reads the Cloudflare credentials from Luca's own env file (`~/.config/luca/.env`), with the process env winning key by key. Never a repo's `.env`. |
| `src/jev/jev-jobs.ts` | What to ask the decision model around each step, with the engine's fixed choice. Pure. |
| `src/jev/jev-shadow.ts` | Asks the decision model in **shadow mode**, journals each call and answer, and turns it off for the run when Cloudflare turns the token down. |
| `src/memory/memory-schemas.ts` | **Memory**'s shapes as Zod schemas (a hit, a shown memory, a vault's search, a save, a feedback) and its numbers: `MIN_MEMORY_SCORE`, `MAX_MEMORIES_PER_RECALL`, `SIMILAR_MEMORY_SCORE`, `DEFAULT_MEMORY_TIMEOUT_MS`. |
| `src/memory/memory-client.ts` | The memory client interface (an object of async functions), and `safeMemory`: every call with a timeout, every error a value. Never throws. |
| `src/memory/memory-recall.ts` | Pure: the vaults a search covers, and the merge by score (minimum score, one per vault and id, at most 5). |
| `src/memory/memory-routing.ts` | Pure: each proposed memory's vault by its type and scope (`MEMORY_ROUTES`, `MEMORY_SCOPES`), refusals, the stored concept, and the helped / didn't-help feedback. |
| `src/memory/muninn-mcp-client.ts` | The real client: MuninnDB's MCP tools over Streamable HTTP (SSE as a fallback), with pure settings resolution and result parsing. |
| `src/core/decide-memory.ts` | Memory's half of the decision step: the recall points (a search before the step that needs it, then its memories in the prompt), and the learner, its saves, and the spec comment at the end of a run. |
| `src/core/execute-memory.ts` | Carries out memory's steps: searches, the learner's turn, saves (update a similar memory or add one), feedback, and the spec comment. |
| `src/core/learner-digest.ts` | Pure: the learner's prompt, a capped digest of the journal. |
| `src/core/memory-text.ts` | Memory's texts: prompt sections, queries, the PR's "New memories", and the spec comment. |
| `src/testing/fake-muninn.ts` | A fake MuninnDB for tests and the demo: vaults in memory with scripted scores, every call recorded, told to fail or hang per vault and operation. |
| `src/testing/memory-fixtures.ts` | Journal entry builders for memory: a run with memory on, searches, the learner's turns, saves. |
| `src/testing/setup-repo.ts` | `luca setup`'s test harness: a throwaway repo with a local bare `origin`, a fake GitHub, and the helpers `cli/setup.test.ts` and `cli/setup-checks.test.ts` share. |
| `src/testing/practice-run.ts` | The `--demo` run: `practice-repo.ts`'s repo and turns, plus a second ticket (#12, blocked by #11) and its turns. |
| `src/board/board-sync.ts` | Keeps the board in step with the journal: a cursor, batches, replays. Never throws. |
| `src/board/paseo-board-link.ts` | The board link over Paseo: the plugin's `engine.event` RPC through the daemon. |
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
| `skills/luca-unstick/` | The `/luca-unstick` skill (#504): its `SKILL.md`, and `scripts/stuck-summary.ts`, which prints what is stuck in a run and why, and waits for the engine to take a reply. See "Getting a stuck run moving". |
| `skills/luca-retro/` | The `/luca-retro` skill (#514): its `SKILL.md`, and `scripts/retro-summary.ts`, which sums up what went wrong in finished runs, from their journals, and the patterns that repeat across them. See "Looking back at a run". |
| `src/cli/doctor-command.ts` | `luca doctor`'s flags, wired to the real adapters. |
