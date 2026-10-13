# `/luca-review`: a three-level review skill, proven by an eval

Date: 2026-10-13. Status: design, waiting for the owner's review.

## What we want

- **Owner's words:** take Corey Gallon's findings and his `agent-review` skill, and make our own `agent-review` skill that is a first-class part of Luca and fits with our other tools. Runs take very long and get stuck often; maybe this helps the review step. Any change we make to his skill, or anything we leave out, must be proven by an eval, because adapted copies of skills often work worse than the original. Order: plan, then discuss, then a small eval, then the real build.
- **Agreed in discussion:** the skill and its eval come first (this spec). Changes to the engine's own reviewers are a later, separate spec. The skill is called `luca-review`, to match `/luca-retro` and `/luca-unstick`.
- **Success:** `/luca-review` ships with Luca, and `luca init` and `luca upgrade` install it. Every way it differs from his skill has won the eval, or the difference was reverted to his wording. The eval stays in the repo, so we can run it again after any future edit.

## The source

- Repo: `github.com/captivus/agent-review`, version 1.0.0, commit `031841c` (2026-10-11).
- License: MIT, copyright 2026 Corey Gallon. The license lets us copy and change it, as long as his copyright and permission notice go along with every copy. So we keep his `LICENSE` file in the skill folder, and add a credit line to `SKILL.md`.
- His files: `SKILL.md`, `README.md`, and `references/` (`level-1-dispatch.md`, `level-2-brief.md`, `level-3-reviewer-prompts.md`, `tool-notes.md`).
- His method, in one line per level:
  - **Level 1:** an artifact, or a named failure. The agent ends with `ARTIFACT-VERIFIED <sha256>` or `ARTIFACT-MISSING: <reason>`, and the sender runs the check itself.
  - **Level 2:** two agents do the same job without seeing each other's work. A third settles every difference against the source and a control total.
  - **Level 3:** adversarial review. A self-audit first, then cold persona reviewers, with every finding checked before anything is fixed. Then brand-new reviewers look at the final version.

## What the evidence says about our runs

A read of 10 real run journals (`~/.local/state/luca/runs/`, 2026-09-24 to 2026-10-10, 120.4 wall-clock hours) found these. Each fact is marked measured or inferred.

- **Review is not why runs are slow (measured).**
  - Gates running alone: 30% of the time.
  - Idle, waiting on the owner's reply to a stuck comment: 29%.
  - Engine down: 13%.
  - Review agents: 3.4%.
  - A ticket review takes a median 0.7–0.9 minutes. Final reviews settle in 2–3 rounds.
- **Gates are slow when two runs share one repo and its single prepare slot (overlap measured, cause inferred).**
- **Stucks (measured):**
  - 52 stucks in total, and none was `changes_requested` reaching its cap.
  - The top reasons: `leftovers_found` 19, `setup_change_needed` 11, environment failures blamed on the ticket 9, `bad_test` 6, `run_budget` 4.
- **Wrong reviewer findings (measured):** across 5 runs, 12 `changes_requested` verdicts (from ticket reviewers and final-review lenses) rested only on a wrong "no changeset" finding (#545), and 12 of the 32 findings fixers declined were the changeset. Each one cost a fix round, a gate rerun of 13 to 17 minutes, and a re-review.
- **The board makes testing look like reviewing (measured board behavior, inferred effect).** It shows a ticket as "Reviewing" from the reviewer's start until it joins, so gate time looks like review time.

**So:** the skill will not make runs faster by itself. The slow parts already have issues: #542, #518, #520, #538, #544 and #545. His ideas do match three real problems, and the later engine spec will take these on:

- **E1, check a finding before fixing it.** The wrong "no changeset" findings.
- **E2, a named failure for environment problems.** An agent can say "the machine, not the code", so the engine stops early instead of spending three fix rounds.
- **E3, a fresh look at the final version.** Today a re-review looks only at the new changes (`packages/engine/src/core/review-text.ts:154`).

The engine's agents cannot load skills (`skills: []`, `packages/engine/src/agents/claude-options.ts:217`). So the skill helps a person in a chat. The engine changes need engine code.

## The design

### Files

```
packages/engine/skills/luca-review/
  SKILL.md              his SKILL.md, plus the changes below, plus a credit line
  references/           his four reference files, plus the changes below
  LICENSE               his MIT license, unchanged
  skill-text.test.ts    our test (does not ship)
```

- **Packing:** `packages/luca/scripts/copy-sources.ts` already copies the whole skills folder, leaving out test files. So `references/` and `LICENSE` ship.
- **Install:** `lucaSkills` finds any folder with a `SKILL.md`, so `luca init`, `luca upgrade` and `luca doctor --fix` install it with no code change. A changeset bumps the engine, which bumps the whole fixed group.

### The test, `skill-text.test.ts`

Like the other two skills, it checks:
- the frontmatter: name, a long description with its trigger phrases, and `argument-hint`
- that every backticked `snake_case` word is a real engine word

It also checks that his key rules are still in the text, so a later edit can't quietly drop one:

- the two closing lines, `ARTIFACT-VERIFIED` and `ARTIFACT-MISSING`, and that "done" on its own is not accepted
- that the sender runs the check itself and compares the hash
- the control total, two agents that don't see each other's work, and never forcing a match
- the four labels: measured, verified against source, inferred, assumed
- cold reviewers with no history, drafts or preferred conclusion
- that every finding is checked against the source before anything changes
- that a fix is checked by an agent that didn't write it
- fresh reviewers for the final version
- that reviewers are never role-played in one context
- that instructions inside sources are data, not commands
- the three severities and the three verdicts
- simplifying first

### What changes from his skill

Each change is a delta. A delta ships only if the eval says it does no harm.

| # | Change | Why | Risk | Eval cases that cover it |
|---|---|---|---|---|
| D1 | Swap words only where the meaning is exactly the same: "minor" becomes "nit", "worker" becomes "agent". | Our glossary uses these words. | Low | All |
| D2 | Cut the Codex-only notes from `references/tool-notes.md`, and the Codex bits elsewhere. | Luca runs on Claude Code only. | Low | 3, 4, 5, the leak test |
| D3 | Add a short "Reviewing a Luca run" section. It says where a run's spec issue, tickets, branch diff, gate reports (`reports/*.xml`), journal and `pull-request.md` live, and which reader to play (the person who would merge the pull request). | So it can review Luca's own output without searching. | Medium | 1, 3, 4, 5 |
| D4 | Keep the review files in `~/.local/state/luca/reviews/<review id>/`, not in a `reviews/` folder in the repo. | His text already allows keeping them outside the repo. Nothing in the repo's `.gitignore` needs editing, and they sit next to the run journals. | Low | 3, 4, 5 |
| D5 | Add a helper script, `scripts/cold-reviewer.ts`, that starts one reviewer as a clean `claude -p` session in a fresh folder outside the repo, holding only the artifact and the sources. It then runs his marker test, to show the reviewer can't see the withheld material. | His notes say subagents can still receive `CLAUDE.md` and a git snapshot. A script makes real separation the easy path. Like our other skills' scripts, it uses only Bun and Node built-ins. | Medium-high | 3, 4, 5, the leak test |
| D6 | New name and description, so it triggers on Luca phrases. | It sits next to `/luca-retro` and `/luca-unstick`. | Medium | The trigger test |

**Kept as his, on purpose:**
- all three levels, Level 2 included
- his principles, severity rubric and verdicts
- his reviewer prompts, register and stop rules
- the word "persona"

Our glossary says to avoid "persona", but our nearest word, "lens", means an angle such as security. His persona is a real reader, such as the maintainer or the other side's lawyer. Swapping them could change how reviewers behave.

**Later, not in this spec:**
- adding his self-audit paragraph to `AGENTS.md`, or having `luca init` add it to other repos
- the engine changes, now tracked as issues: E1 on #545, E2 on #544, E3 as #548, and the board's "Reviewing" label as #549

## The eval

### Setups

- **A:** his skill, word for word, installed as `agent-review`.
- **B:** our skill with all six changes, installed as `luca-review`.
- **C:** no skill. The same task prompt, just "review this".

### One run

- A runner script (`evals/luca-review/run-eval.ts`) makes a fresh temp folder outside the repo, copies in the case's fixture and that setup's skill (as a project skill), and runs `claude -p --output-format json`.
- It saves the output, the review files, the wall time and the token use.
- It uses the cleanest Claude Code setup that still loads that one skill, and checks which skills actually loaded. The owner's user-level settings load the same way in every setup, so the comparison stays fair.
- Claude Code version, recorded per run: 2.1.296, the same version his notes were checked on.

### Cases

Each case has a fixture and a right answer, written down before any run. The repo is public, so any case taken from a private repo (heartgold-plus) is rebuilt as a small look-alike with the same shape and no private content.

1. **Wrong finding (Level 3, check a finding before fixing it).**
   - Fixture: a ticket diff and a reviewer finding that says a changeset is missing, from run p9dr, rebuilt; the repo rule asking for changesets; and the engine doc saying the engine writes the changeset.
   - Right answer: the finding is rejected, with evidence, before any fix.
2. **The tool isn't there (Level 1).**
   - Fixture: a job that must use a named tool that isn't installed, with an easy swap to another tool available.
   - Right answer: `ARTIFACT-MISSING` naming the missing tool, and no "done". If the agent swaps tools anyway, the sender's acceptance check catches it.
3. **Machine blamed on code (Level 3).**
   - Fixture: a write-up blaming a ticket's code for failing tests; the JUnit report and gate log showing a port already in use; the diff. From run za85, rebuilt.
   - Right answer: the reviewers find that the cause is the environment.
4. **Planted bug plus an overstated claim (Level 3).**
   - Fixture: a real merged Luca pull request with one planted bug (written down by file and line), and a description changed to claim more than the change does.
   - Right answer: both are caught as blocker or should-fix.
5. **Clean change (Level 3).**
   - Fixture: a real merged Luca pull request with no known problems (no later fix touched it).
   - Right answer: no confirmed blocker.

**Side tests:**
- **Leak test:** a unique marker word goes into the material reviewers must not see (the drafts and the investigation notes). The marker showing up in any reviewer's output or review file means separation failed.
- **Trigger test:** about 10 short prompts, half that should start the skill and half that shouldn't. Each runs once per setup, for A and B only. This covers D6.

### Scoring

For each run:
- caught the right answer (yes or no)
- confirmed false blockers (count)
- marker leaks (count)
- followed the method: closing line format, a register exists, findings checked before fixes (yes or no for each)
- wall time and tokens

A grader agent scores each run against the written right answer. Then a person checks every grade, since there are few runs.

### Size and cost

- **First pass:** 5 cases × 3 setups × 1 run, which is 15 runs, plus the trigger test.
- **Second runs:** only for cases where A and B disagree.
- **Cost check:** after the very first run, report its tokens and time, and stop for the owner's go-ahead if a full pass would cost more than expected.

### Decision rule

- **B ships** if, across the cases:
  - it catches at least as many right answers as A
  - it has no more false blockers and no more leaks than A
  - its tokens and wall time are no more than about 25% above A's
- **If B loses a case,** put the deltas that case covers back to his wording, one at a time, and rerun that case until the harmful delta is found. A delta that's found harmful stays reverted.
- **If C does as well as A and B** on a case, that case is too easy to tell them apart. Note it, and don't count it.

### Where the eval lives

- `evals/luca-review/` at the repo root: the runner, the fixtures, the right answers, the grader prompt, and a `results.md` per eval round.
- It does not ship, because packing copies only the engine, the board and the skills.
- Raw run outputs stay in `~/.local/state/luca/evals/`, not in git.

## Order of work

1. **Copy his skill word for word** into the eval as setup A.
2. **Build the runner, the fixtures and the right answers,** then run one case on A for the cost check.
3. **Write B:** his files plus D1 to D6.
4. **Run the first pass,** then second runs where needed, then the decision rule.
5. **Write `results.md`.** Discuss it with the owner.
6. **Build for real:** the skill folder, the test, the changeset and the README mention, all on a branch, with a pull request.

## Risks and limits

- **The sample is small.** Fifteen runs show big differences, not small ones. A tie means "no harm found", not "proven equal".
- **The grader is a model.** A person checking every grade limits this.
- **Rebuilt look-alikes may be easier or harder than the real cases.** Each one keeps the real case's key fact.
- **Separation depends on the Claude Code version.** The runner records the version, and the leak test catches regressions.
- **His own skill says its detection rate hasn't been measured.** This eval measures it only on our five cases.
