# @luca/engine: modules in the other folders

The folders with only a few modules each, one section per folder. A folder
with a page of its own is listed in the [README](../README.md).

## `src/config/`

| Module | What it does |
| --- | --- |
| `src/config/engine-config.ts` | Loads the per-repo engine config (`.luca/config.json`). |
| `src/config/config-reload.ts` | Pure: the config fields a resume takes again (`RELOADED_FIELDS`) and the ones it keeps (`FROZEN_FIELDS`), what changed (`configChanges`), and a config with the changes (`withConfigChanges`). |
| `src/config/luca-version.ts` | Luca's own version: the installed `@alecsibilia/luca` package's, or a dev value from the repo's source. |

## `src/intake/`

| Module | What it does |
| --- | --- |
| `src/intake/intake-checks.ts` | Intake's pure checks: refused, nothing to do, or a snapshot, with the tickets left out for a person (#499). |

## `src/limits/`

| Module | What it does |
| --- | --- |
| `src/limits/run-budget.ts` | Pure: the default run budget, a run's budget from its config, and its tokens so far. |
| `src/limits/plan-signals.ts` | Pure: what a rate-limit reading or a session says (fine, a limit, or billing). |
| `src/limits/plan-usage.ts` | Pure: a ticket's or the run's tokens and plan-window movement. |
| `src/limits/limit-wait.ts` | The engine's clock, waiting until a time, and the spec's limit-wait comment. |

## `src/messages/`

| Module | What it does |
| --- | --- |
| `src/messages/agent-messages.ts` | **Agent messages'** rules. Pure: journal records in, a message's fate (queued, not delivered, refused) or what waits for an agent out. |
| `src/messages/agent-messaging.ts` | One agent's messaging, backed by the journal: journals each message and each delivery word for word. |

## `src/git/`

| Module | What it does |
| --- | --- |
| `src/git/git-adapter.ts` | Every git side effect, one call at a time: worktrees (made and removed), commits, throwing away uncommitted work, replaying onto the run branch and undoing it, moving a ticket's change onto the run branch, pushes. It holds the `GitAdapter` type and `createGitAdapter`, which joins the five modules below and runs their calls in turn. |
| `src/git/git-run.ts` | Runs `git` in a folder: `gitRun` returns the result as it is, `gitOk` throws when git fails. Also the line splitter and `head` the other git modules share. |
| `src/git/git-worktrees.ts` | The adapter's worktree calls, the ones that need the repo's root: fetch the base branch, make the run branch and each ticket's worktree (safe to repeat after a crash), remove them. |
| `src/git/git-read.ts` | The adapter's reads: what changed in a worktree or between commits, which files exist, and where a commit is. None of them changes the repo. |
| `src/git/git-commits.ts` | The adapter's commits and clean-ups: stage and commit all or some paths, read the last commit, throw away or reset a worktree's changes, push. |
| `src/git/git-join.ts` | The adapter's moves between branches: list the commits between two, replay them onto the run branch, undo a replay, move a worktree's change onto another commit. |
| `src/git/path-text.ts` | Reads a changed path's text as git would store it: a file's text, a symlink's target (never followed), `null` for a folder or anything else. Never throws. |
| `src/git/outside-links.ts` | Finds the symlinks among some paths whose target is outside the checkout, which no commit may hold. Reads each target, never follows it. |

## `src/shell/`

| Module | What it does |
| --- | --- |
| `src/shell/run-command.ts` | Runs a command in its own process group, with a timeout, and collects its output. A timed-out command is killed with everything it started. |

## `src/tracker/`

| Module | What it does |
| --- | --- |
| `src/tracker/tracker.ts` | The tracker interface: an object of async functions. Also the labels Luca creates, with their colors and descriptions (`RUN_LABELS`, `labelDefinition`). |
| `src/tracker/in-memory-tracker.ts` | A tracker in memory, for tests. It records the PRs it opens. |
| `src/tracker/github-tracker.ts` | The real tracker, through the `gh` CLI. Every call goes through one `gh` runner, which tests fake. A label the repo lacks is created before it's added. |
| `src/tracker/post-comment-once.ts` | Engine comments carry an invisible marker, so a step redone after a crash adopts its comment instead of posting it again, and the engine never takes its own comments as replies. |

## `src/testing/`

| Module | What it does |
| --- | --- |
| `src/testing/intake-fixtures.ts` | Spec, ticket, and journal builders for tests. |
| `src/testing/build-fixtures.ts` | Journal entry builders for each build step. |
| `src/testing/final-review-fixtures.ts` | Journal entry builders for the final review: rounds, lens turns, fix rounds, passed, stuck, shipped. |
| `src/testing/practice-repo.ts` | The end-to-end practice repo: a throwaway git repo, local `origin`, tracker, and scripted turns (or any launcher). `CLEAN_LENS_TURNS` are five approving lenses; its runs fall back on them for any lens the turns don't script. |
| `src/testing/many-tickets.ts` | The many-ticket practice runs: three tickets, two at once with a clash and one waiting on both (`SUM_PRODUCT_AVERAGE`); two tickets that break each other's gates after joining (`BROKEN_JOIN`); a plan limit with two tickets in flight (`LIMIT_HIT`); and a rebase across a new dependency (`REINSTALL`). |
| `src/testing/fake-muninn.ts` | A fake MuninnDB for tests and the demo: vaults in memory with scripted scores, every call recorded, told to fail or hang per vault and operation. |
| `src/testing/memory-fixtures.ts` | Journal entry builders for memory: a run with memory on, searches, the learner's turns, saves. |
| `src/testing/setup-repo.ts` | `luca setup`'s test harness: a throwaway repo with a local bare `origin`, a fake GitHub, and the helpers `cli/setup.test.ts` and `cli/setup-checks.test.ts` share. |
| `src/testing/practice-run.ts` | The `--demo` run: `practice-repo.ts`'s repo and turns, plus a second ticket (#12, blocked by #11) and its turns. |

## `src/jev/`

| Module | What it does |
| --- | --- |
| `src/jev/jev-schemas.ts` | The decision model's questions, requests, and answers, the engine's fixed choices, failure and off reasons, and the Clef model ids, as Zod schemas. The folder and names keep the Jev name, so old journals read. |
| `src/jev/clef-client.ts` | The decision model client for Cloudflare's **Clef** on Workers AI. Never throws, and never puts the token in an error. |
| `src/jev/decision-model-credentials.ts` | Reads the Cloudflare credentials from Luca's own env file (`~/.config/luca/.env`), with the process env winning key by key. Never a repo's `.env`. |
| `src/jev/jev-jobs.ts` | What to ask the decision model around each step, with the engine's fixed choice. Pure. |
| `src/jev/jev-shadow.ts` | Asks the decision model in **shadow mode**, journals each call and answer, and turns it off for the run when Cloudflare turns the token down. |

## `src/memory/`

| Module | What it does |
| --- | --- |
| `src/memory/memory-schemas.ts` | **Memory**'s shapes as Zod schemas (a hit, a shown memory, a vault's search, a save, a feedback) and its numbers: `MIN_MEMORY_SCORE`, `MAX_MEMORIES_PER_RECALL`, `SIMILAR_MEMORY_SCORE`, `DEFAULT_MEMORY_TIMEOUT_MS`. |
| `src/memory/memory-client.ts` | The memory client interface (an object of async functions), and `safeMemory`: every call with a timeout, every error a value. Never throws. |
| `src/memory/memory-recall.ts` | Pure: the vaults a search covers, and the merge by score (minimum score, one per vault and id, at most 5). |
| `src/memory/memory-routing.ts` | Pure: each proposed memory's vault by its type and scope (`MEMORY_ROUTES`, `MEMORY_SCOPES`), refusals, the stored concept, and the helped / didn't-help feedback. |
| `src/memory/muninn-mcp-client.ts` | The real client: MuninnDB's MCP tools over Streamable HTTP (SSE as a fallback), with pure settings resolution and result parsing. |

## `src/board/`

| Module | What it does |
| --- | --- |
| `src/board/board-sync.ts` | Keeps the board in step with the journal: a cursor, batches, replays. Never throws. |
| `src/board/paseo-board-link.ts` | The board link over Paseo: the plugin's `engine.event` RPC through the daemon. |

## `skills/`

| Module | What it does |
| --- | --- |
| `skills/luca-unstick/` | The `/luca-unstick` skill (#504): its `SKILL.md`, and `scripts/stuck-summary.ts`, which prints what is stuck in a run and why, and waits for the engine to take a reply. See "Getting a stuck run moving". |
| `skills/luca-retro/` | The `/luca-retro` skill (#514): its `SKILL.md`, and `scripts/retro-summary.ts`, which sums up what went wrong in finished runs, from their journals, and the patterns that repeat across them. See "Looking back at a run". |
