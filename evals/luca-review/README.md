# The `/luca-review` eval

This eval checks that our `/luca-review` skill works at least as well as the skill it came from: Corey Gallon's [agent-review](https://github.com/captivus/agent-review) 1.0.0, under the MIT license. Every way ours differs from his has to pass it, or that change goes back to his wording. The design is in [`docs/superpowers/specs/2026-10-13-luca-review-design.md`](../../docs/superpowers/specs/2026-10-13-luca-review-design.md).

## The setups

- **A:** his skill, word for word, from `upstream/agent-review/`. `upstream.test.ts` pins every file's hash, so it can't drift.
- **B:** ours, from `packages/engine/skills/luca-review/`.
- **C:** no skill.

## One run

`run-eval.ts` builds a fresh folder, `<evals root>/<round>/<case><setup><rep>/`. The evals root is `$LUCA_EVALS_DIR`, else `~/.local/state/luca/evals`. The folder holds:
- `ws/`: the case's files, plus that setup's skill as a project skill
- `out/`: what the run produced, as described below
- `tmp/` and `reviews/`: the run's own temp folder and review root

It runs `claude -p --setting-sources project` in `ws/`, so only that skill and Claude Code's built-in ones load. The prompt goes in on stdin. Then it:
1. checks that the right skill loaded and that transcripts exist
2. counts tokens from Claude Code's transcripts of every session under the run's folder, which takes in subagents and any `claude -p` the run started
3. checks every transcript but the coordinator's for the case's marker word, which sits only in its `notes/`
4. has a grader (no tools, skill names hidden) score what the run wrote against the case's answer, which was written before any run

Everything lands in `out/`: `prompt.md`, `stream.jsonl`, `usage.json`, `grader-prompt.md`, `grade.json` and `row.json`.

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
- `--dry-run` builds the folder and prints the prompt, without running.
- `--grade-only` grades a finished run again.

**After a round:**
- A person checks every grade against `out/grader-prompt.md`. To correct one, edit `out/grade.json`, add a `"person_note"`, and run the report again.
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
