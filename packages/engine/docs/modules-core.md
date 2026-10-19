# @luca/engine: modules in `src/core/`

The decision step and the code that carries out its actions. A module in
another folder is on its folder's page; the [README](../README.md) lists them.

| Module | What it does |
| --- | --- |
| `src/core/decide.ts` | **The decision step.** Pure: journal in, every action that can run now out (`decideSteps`); `decide` gives the first. |
| `src/core/decide-build.ts` | The build half of the decision step: each ticket's spine, the join queue, rebases after a clash, the PR, and removing worktrees. Its parts: [decide-build modules](#decide-build-modules). |
| `src/core/decide-final-review.ts` | The final review's half of the decision step: its rounds, the five lenses at once, its fix rounds, and passed, stuck, or shipped. Its parts: [decide-final-review modules](#decide-final-review-modules). |
| `src/core/loop-caps.ts` | The caps of every fix loop (`MAX_FIX_ROUNDS`, ...), shared by the ticket steps and the final review. |
| `src/core/decide-plan.ts` | The plan half of the decision step: limit waits and billing stops. |
| `src/core/decide-crashes.ts` | The crash half of the decision step: a run-level step cut off by `MAX_CRASHES` crashes in a row stops the run for good. |
| `src/core/decide-stuck.ts` | The stuck half of the decision step: undoing a stuck ticket's join, telling the spec issue, reading replies, and acting on `retry`, `skip`, and `stop`. |
| `src/core/stuck-text.ts` | A skipped ticket's comment and answers to unusable replies; re-exports the stuck texts ([its modules](#stuck-text-modules)). |
| `src/core/execute-stuck.ts` | Carries out the stuck steps on the tracker (comments, reading replies, skips), and `retry` (re-read the ticket: resume, start over, or refuse). |
| `src/core/already-done.ts` | A ticket whose work is already on the base branch (#484): its steps (`check_already_done`, `mark_already_done`, `close_ticket`, `finish_nothing_to_do`) and their texts. |
| `src/core/execute-already-done.ts` | Carries out an already-done ticket's steps on the tracker: the spec comment, and closing the ticket with a comment in a run with no PR. |
| `src/core/decide-usage.ts` | The usage half of the decision step: each finished ticket's usage, then the run's. |
| `src/core/decide-run-budget.ts` | The run budget half of the decision step: the run stuck on its budget, its report, and the owner's `retry` or `stop`. |
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
| `src/core/decide-memory.ts` | Memory's half of the decision step: the recall points (a search before the step that needs it, then its memories in the prompt), and the learner, its saves, and the spec comment at the end of a run. |
| `src/core/execute-memory.ts` | Carries out memory's steps: searches, the learner's turn, saves (update a similar memory or add one), feedback, and the spec comment. |
| `src/core/learner-digest.ts` | Pure: the learner's prompt, a capped digest of the journal. |
| `src/core/memory-text.ts` | Memory's texts: prompt sections, queries, the PR's "New memories", and the spec comment. |

## decide-build modules

`src/core/decide-build.ts` re-exports these modules, so importers don't change.

| Module | What it does |
| --- | --- |
| `src/core/build-action.ts` | `BuildAction`, and the ticket steps' shared args. |
| `src/core/build-launch.ts` | A build agent's launch: run notes, prompt sections. |
| `src/core/decide-ticket.ts` | One ticket's next step: failed turns, install, baseline. |
| `src/core/decide-red-green.ts` | Tests, red check, code, gates, and their commits. |
| `src/core/decide-ticket-review.ts` | The ticket review and its fix rounds. |
| `src/core/decide-rejoin.ts` | Joining the run branch, and rebases with test updates. |
| `src/core/decide-build-view.ts` | What the build half reads about a run's tickets (`buildViewOf`): the tickets in order, each one's progress, and whether it is skipped, pushed, already done, finished, or stuck. |
| `src/core/decide-build-early.ts` | The steps that settle the run before any ticket moves: a `stop` reply or an open PR winds it down, and the run branch's install, which a failure holds every ticket back on. |
| `src/core/decide-build-tickets.ts` | Each ticket's next step, with the join queue picking which approved ticket joins the run branch. |
| `src/core/decide-build-ending.ts` | The steps once no ticket can move: closing the already-done tickets, the final review, the changeset, and the PR. |

## decide-final-review modules

`src/core/decide-final-review.ts` keeps `decideFinalReview` and the lens step, and re-exports these types, so importers don't change.

| Module | What it does |
| --- | --- |
| `src/core/final-review-action.ts` | The final review's actions (`FinalReviewAction`, `isFinalReviewAction`), where it stands (`FinalReviewDecision`), what its decision reads, and the stuck step. |
| `src/core/final-failure-cap.ts` | The cap on a role's failed tries in the final review: the stuck step once its tries, or its engine failures in a row, are used up. |
| `src/core/decide-final-fix.ts` | The final review's fix round: the fixers, the gates and their fix loop, the fix commit, and the push. |

## stuck-text modules

The modules split out of `src/core/stuck-text.ts`. It re-exports them.

| Module | What it does |
| --- | --- |
| `src/core/ticket-stuck-text.ts` | A stuck ticket's comment (why, what was tried, suggestion) and the retry note. |
| `src/core/final-stuck-text.ts` | The stuck final review's comment. |
| `src/core/run-stuck-text.ts` | The run's stuck comments: run budget, unopened PR. |
| `src/core/stuck-detail-text.ts` | Stuck details: a setup file change, a bad test. |
| `src/core/stuck-format.ts` | The stuck texts' error fence and plurals. |
