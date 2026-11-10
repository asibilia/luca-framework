# Addressing a review

The `/luca-pr-address` skill (#740, part of #735) takes a pull request that has been reviewed and works through everything the review said: it fixes, asks, defers or declines each **finding**, replies on its thread, and hands the PR back ready to be read again. It works on any PR in any repo, and needs only `git`, `gh` and `bun`.

It is the other half of the review loop. `/luca-pr-prep` writes a PR's [story](pr-story.md); the owner reads it and sends a review; `/luca-pr-address` addresses that review and has the story brought up to date, so the owner only walks what changed.

## Three channels

Findings reach a PR three ways, and no way contains another. The helper reads all three into one list.

| `source` | What it is | How it is answered |
| --- | --- | --- |
| `review_comment` | A comment on a line, a range, or a file. Its `kind` says which: a `range` keeps both ends (`start_line` to `line`), and a `file` comment has no line at all | A reply on its thread |
| `review_body` | The text a reviewer wrote on the review as a whole | The summary comment |
| `alert` | A check run annotation (the PR's Alerts panel) | The summary comment |

A check's conclusion and its annotations are separate: a passing check can carry `failure` annotations. So the helper never reads the conclusion to decide whether alerts exist. It always reads the annotations, and lists unfinished checks as `pending_checks`. Annotations of level `notice`, and those on the path `.github`, are **CI notices**: counted, never worked on.

## The helper

```bash
bun ~/.claude/skills/luca-pr-address/scripts/fetch-findings.ts [number] [--repo <owner/repo>] [--only <author>] [--owner <login>] [--save] [--wait-checks <minutes>] [--check-summary <file>]
```

It only reads GitHub. It prints one JSON object: the PR's `state`, `head_sha`, `labels`, `changes_wanted`, `pending_checks`, the `findings`, the `ci_notices`, and `stats`. With `--save` it writes that to `findings.json` in the PR's working folder and prints only the headline.

- `--wait-checks <minutes>` fetches again every 30 seconds while a check on the head commit is unfinished, for at most that long. The result says `checks_still_pending` and `waited_seconds`, so a run never waits forever and never calls an unfinished check clean.
- `--check-summary <file>` checks a summary comment's text against a fetch made right then, before it is posted. It prints `{ ready, problems, late }` and exits 0 only when `ready` is true (see "What a summary answers").

The working folder is outside any repo: `~/.local/state/luca/pr-address/<owner>/<repo>/pr-<number>/` (`LUCA_PR_ADDRESS_DIR` moves it). It holds `findings.json`, `plan.md` (the triaged plan), `results.json` (what was done with each finding) and `summary.md` (the summary comment before it is posted).

Like the other skill scripts, the helper imports nothing but Bun's and Node's own modules, since it runs from `~/.claude/skills`, where no packages are installed. That is why it narrows GitHub's JSON by hand instead of with Zod.

## The owner rule

The **review owner** is the person whose review is being addressed: the GitHub user `gh` is signed in as, or the login given with `--owner`. Their findings carry `from_owner: true`, and the agent may only **fix** them, **answer** them (a question), or **ask** about them (reply with one question and stop). It never declines, defers or skips one.

**The owner can settle their own comment.** When the owner's own words elsewhere in the review, written at the same time or later, plainly decide one of their comments (a note that says "no rename if the other skills follow the pattern", and they do), that comment is `answered`, and the reply links the words that settled it. It is the owner's decision, so it is not a decline. The workflow script checks the claim: the settling comment must be another finding from the owner, and not an older one. A claim that fails becomes a question.

**A suggestion block is exact text.** The owner's is applied as written, or asked about when it can't be. Anyone else's is a proposal that may be applied, adapted or declined. The reply always says which.

**A bot notice is not a finding.** A bot saying it could not review asks for nothing. Its category is `notice` and its outcome `noted`: one row in the summary, no judge, no reply.

Findings from bots and other reviewers may be declined or deferred with a stated reason. Deferring is capped: at most one per iteration, and never more than a fifth of the confirmed findings.

The workflow script (`references/workflow-script.md`) enforces both rules in code. An owner finding judged "not real" becomes a question. One that comes back declined, deferred or skipped is listed in `owner_rule_broken`, and too many deferrals set `deferral_cap_exceeded`. `workflow-script.test.ts` runs the script with fake agents to prove it.

## Telling the skill's replies from the owner's

On your own PR the skill replies as you, so a login can't tell its replies from yours. Two hidden lines can:

- Every thread reply the skill posts ends with `<!-- luca-pr-address reply -->`. A thread counts as answered when it has a reply and nobody has written under the skill's last one. When the owner answers the skill's question, the thread opens again, and the finding's `thread` holds the answer.
- Every summary comment starts with `<!-- luca-pr-address summary iteration=<k> head=<full sha> -->`. `head=` is the PR's full head commit after the push.

## What a summary answers

A review's own text and an alert have no thread, so the summary comment is their only answer. A summary answers exactly the findings it lists, in a hidden **covers block** under its first line:

```markdown
<!-- luca-pr-address summary iteration=1 head=<full sha> -->
<!-- luca-pr-address covers
rv-5846885354
alert-7-src/cart.ts-4
-->
```

It does not answer "everything older than me". The first real run showed why: a review that arrived after the run had fetched, but before it posted its summary, was counted as answered though the run never read it. Now such a finding stays unanswered until a summary lists its id (`summary-cover.ts`).

Before posting, the skill runs `--check-summary`. It fetches again and reports:

- `problems`: a short or stale `head=`, a missing covers block, an id that is no finding, or a line comment listed before its thread has a reply.
- `late`: every finding still unanswered that the summary does not list. The agent addresses these, or leaves them out of the covers block and names them in the summary, so the next run picks them up. An owner's comment is never dropped.

A summary from before the covers block existed keeps the old rule, for that summary only: it answers the review texts submitted before it and the alerts of its head commit.

## When it starts and how it ends

It starts when the PR carries the `changes-wanted` label or has anything unanswered. It refuses a merged or closed PR, and asks before working on a draft.

After the fixes it runs the repo's own checks (from `.luca/config.json`, the repo's rule files, its package scripts, or its CI), commits the way that repo commits, and pushes. It never force-pushes. Then it replies, checks and posts the summary, waits for the checks for at most 15 minutes (reporting any still unfinished as pending, not as clean), looks for regressions on the files it touched, and loops at most twice.

Last, it follows `/luca-pr-prep` to bring the story up to date, which puts `review-ready` back on a shared PR, and takes `changes-wanted` off. It looks for that skill in `~/.claude/skills/`, then in the repo's `.claude/skills/`, then in `packages/engine/skills/` (Luca's own repo). When it is in none of them it says so in its report, as `story: not refreshed, luca-pr-prep not found`; it never skips the refresh quietly. It never merges, approves, or marks a PR signed off: that is the owner's word.

## Where it came from

The method is adapted from a `git-pr-address` skill the owner wrote for another repo. Everything specific to that repo was removed, and three things were added: the review-body channel, the owner rule, and the story refresh at the end.

## Files

| File | What it holds |
| --- | --- |
| `SKILL.md` | The eight stages |
| `references/judgment-calls.md` | The owner settling their own comment, suggestion blocks, bot notices, and when deferring is allowed |
| `references/plan-file.md` | The shape of `plan.md` |
| `references/summary-comment.md` | Writing, checking and posting the summary |
| `references/story-refresh.md` | Finding `/luca-pr-prep`, and the final report |
| `references/workflow-script.md` | The script for the `Workflow` tool |
| `scripts/fetch-findings.ts` | The helper's command line |
| `scripts/pr-findings.ts` | GitHub's JSON turned into findings |
| `scripts/summary-cover.ts` | Which findings a summary answers, and the check before posting |

## Tests

`scripts/pr-findings.test.ts`, `scripts/summary-cover.test.ts`, `scripts/fetch-findings.test.ts` and `scripts/fetch-findings-main.test.ts` run the helper against a pretend GitHub (`scripts/testing-fixtures.ts`), with comment shapes taken from a real review. `skill-text.test.ts` checks the skill's words against the helper, and `workflow-script.test.ts` runs the workflow script with fake agents.
