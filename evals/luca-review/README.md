# The `/luca-review` eval

This eval checks that our `/luca-review` skill works at least as well as the skill it came from: Corey Gallon's [agent-review](https://github.com/captivus/agent-review) 1.0.0, under the MIT license. Every way ours differs from his has to pass it, or that change goes back to his wording. The design is in [`docs/superpowers/specs/2026-10-13-luca-review-design.md`](../../docs/superpowers/specs/2026-10-13-luca-review-design.md).

## The setups

- **A:** his skill, word for word, from `upstream/agent-review/`. `upstream.test.ts` pins every file's hash, so it can't drift.
- **B:** ours, from `packages/engine/skills/luca-review/`.
- **C:** no skill.

## One run

`run-eval.ts` builds a fresh folder, `<evals root>/<round>/<case><setup><rep>/`. The evals root is `$LUCA_EVALS_DIR` (an empty value counts as unset), else `~/.local/state/luca/evals`. It must be an absolute path outside this repo and outside `~/.claude`; the commands refuse any other. The folder holds:
- `ws/`: the case's files, plus that setup's skill as a project skill
- `out/`: what the run produced, as described below
- `tmp/` and `reviews/`: the run's own temp folder and review root

It runs `claude -p --setting-sources project` in `ws/`, so only that skill and Claude Code's built-in ones load. The prompt goes in on stdin. Then it:
1. checks that the run finished (its stream ends with a `result` event), that the right skill loaded, and that transcripts exist; a run that fails a check is invalid and is not graded
2. counts tokens from Claude Code's transcripts of every session under the run's folder, which takes in subagents and any `claude -p` the run started
3. checks every transcript but the coordinator's for the case's marker word, which sits only in its `notes/`
4. has a grader (no tools, skill names hidden) score what the run wrote against the case's answer, which was written before any run

Everything lands in `out/`:
- `prompt.md`: what the run was asked
- `baseline.json`: the hash of every file in `ws/` before the run, so the grader sees only what the run wrote
- `stream.jsonl` and `stream.jsonl.stderr`: the run's output and its error output
- `usage.json`: tokens, cost units, the stream's `is_error`, and the transcripts counted
- `grader-prompt.md`: exactly what the grader was shown
- `grader.json` and `grader.json.stderr`: the grader's output and its error output
- `grade.json`, or `grade-error.txt` when the grade could not be read (a later good grade deletes the note)
- `row.json`: the run's numbers, which the report reads

**Cost units** weigh tokens by price, in input-token units: a cache write counts 1.25×, a cache read 0.1×, and output 5×.

## The cases

| Case | Level | What a good run does |
| --- | --- | --- |
| `1-wrong-finding` | 3 | Rejects a reviewer's "no changeset" finding: the engine writes the run's changeset itself |
| `2-missing-tool` | 1 | Reports that the required tool is missing, instead of a fake "done" |
| `3-machine-blamed` | 3 | Finds that a port clash, not the code, failed the tests |
| `4-planted-bug` | 3 | Catches a planted bug and an overstated claim in PR #531 |
| `5-clean-change` | 3 | Raises no made-up blocker on PR #531 as merged |

Cases 1, 4 and 5 take their code from this repo's git history, at pinned commits. `cases.test.ts` builds every case and checks that its plants took. The case folders are left out of `bun test`, the type check and lint, because they are sample code for agents to read.

## Running a round

```bash
bun evals/luca-review/run-eval.ts --round r1                 # every case, every setup, rep 1
bun evals/luca-review/run-triggers.ts --round r1 --arm A
bun evals/luca-review/run-triggers.ts --round r1 --arm B
bun evals/luca-review/report.ts --round r1                   # writes results/r1.md
```

**Optional flags:**
- `--case <id>`, `--arm <A|B|C>` and `--rep <n>` narrow a run down.
- `--no-grade` runs without grading; `--grade-only` can grade those runs later.
- `--dry-run` builds the folder and prints the prompt, without running. The folder stays, and a real run of the same round, case, setup and rep refuses a folder that exists, so dry-run in a throwaway round such as `r0-dry`.
- `--grade-only` grades finished runs that have no `out/grade.json`, for example after the grader failed. A run that already has a grade is skipped ("already graded, skipped"), so a person's corrections are never overwritten. It can't be used with `--dry-run`.

A run that fails in any way is printed as `ERROR <message>`, and the sweep goes on to the next run. The command exits 1 if any run was invalid, errored, or (unless `--no-grade`) was left ungraded.

`report.ts` counts a run folder with no `out/row.json` as an invalid run ("unfinished: no row.json"), so it shows under "Runs left out" and its case can't drop out of the decision unseen. A trigger file cut short by a stopped run is filled out with invalid results.

**After a round:**
- A person checks every grade against `out/grader-prompt.md`. To correct one, edit `out/grade.json`, add a `"person_note"`, and run the report again. `--grade-only` will not touch a run that has a `grade.json`.
- Run the cases that A and B disagree on again, with `--rep 2`.

## The decision rule

B ships if, across the counted cases:
- it catches at least as much as A
- it has no more false blockers and no more leaks than A
- its cost units and wall time are each at most 1.25 × A's

A case where C does as well as A and B is "too easy". It isn't counted for catches or false blockers.

## When B loses

Each of B's changes, D1 to D6, is its own commit (see the spec). For the changes that touch the case B lost, revert them one at a time:

```bash
git revert --no-commit <change's commit>
bun evals/luca-review/run-eval.ts --round r1-no-d3 --case <case> --arm B
git revert --abort    # or keep the revert if B did better without it
```

Keep the revert of any change that hurt.

## Adding a case

1. Make `cases/<n>-<name>/`, with a `case.json` (see `lib/case-schema.ts`) and a `workspace/`.
2. Add `notes/` if the case has a marker.
3. Write the answer before you run anything.
4. Add the case to `cases.test.ts`.
