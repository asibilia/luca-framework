# Addressing a review

The `/luca-pr-address` skill (#740, part of #735) takes a pull request that has been reviewed and works through everything the review said: it fixes, asks, defers or declines each **finding**, replies on its thread, and hands the PR back ready to be read again. It works on any PR in any repo, and needs only `git`, `gh` and `bun`.

It is the other half of the review loop. `/luca-pr-prep` writes a PR's [story](pr-story.md); the owner reads it and sends a review; `/luca-pr-address` addresses that review and has the story brought up to date, so the owner only walks what changed.

## Three channels

Findings reach a PR three ways, and no way contains another. The helper reads all three into one list.

| `source` | What it is | How it is answered |
| --- | --- | --- |
| `review_comment` | A comment on a line, a range, or a file | A reply on its thread |
| `review_body` | The text a reviewer wrote on the review as a whole | The summary comment |
| `alert` | A check run annotation (the PR's Alerts panel) | The summary comment |

A check's conclusion and its annotations are separate: a passing check can carry `failure` annotations. So the helper never reads the conclusion to decide whether alerts exist. It always reads the annotations, and lists unfinished checks as `pending_checks`. Annotations of level `notice`, and those on the path `.github`, are **CI notices**: counted, never worked on.

## The helper

```bash
bun ~/.claude/skills/luca-pr-address/scripts/fetch-findings.ts [number] [--repo <owner/repo>] [--only <author>] [--owner <login>] [--save]
```

It only reads GitHub. It prints one JSON object: the PR's `state`, `head_sha`, `labels`, `changes_wanted`, `pending_checks`, the `findings`, the `ci_notices`, and `stats`. With `--save` it writes that to `findings.json` in the PR's working folder and prints only the headline.

The working folder is outside any repo: `~/.local/state/luca/pr-address/<owner>/<repo>/pr-<number>/` (`LUCA_PR_ADDRESS_DIR` moves it). It holds `findings.json`, `plan.md` (the triaged plan) and `results.json` (what was done with each finding).

Like the other skill scripts, the helper imports nothing but Bun's and Node's own modules, since it runs from `~/.claude/skills`, where no packages are installed. That is why it narrows GitHub's JSON by hand instead of with Zod.

## The owner rule

The **review owner** is the person whose review is being addressed: the GitHub user `gh` is signed in as, or the login given with `--owner`. Their findings carry `from_owner: true`, and the agent may only **fix** them, **answer** them (a question), or **ask** about them (reply with one question and stop). It never declines, defers or skips one.

Findings from bots and other reviewers may be declined or deferred with a stated reason. Deferring is capped: at most one per iteration, and never more than a fifth of the confirmed findings.

The workflow script (`references/workflow-script.md`) enforces both rules in code. An owner finding judged "not real" becomes a question. One that comes back declined, deferred or skipped is listed in `owner_rule_broken`, and too many deferrals set `deferral_cap_exceeded`. `skill-text.test.ts` runs the script with fake agents to prove it.

## Telling the skill's replies from the owner's

On your own PR the skill replies as you, so a login can't tell its replies from yours. Two hidden lines can:

- Every thread reply the skill posts ends with `<!-- luca-pr-address reply -->`. A thread counts as answered when it has a reply and nobody has written under the skill's last one. When the owner answers the skill's question, the thread opens again, and the finding's `thread` holds the answer.
- Every summary comment starts with `<!-- luca-pr-address summary iteration=<k> head=<sha> -->`. A review's own text counts as answered once a summary follows it. Alerts count as answered once a summary covers the PR's current head commit.

## When it starts and how it ends

It starts when the PR carries the `changes-wanted` label or has anything unanswered. It refuses a merged or closed PR, and asks before working on a draft.

After the fixes it runs the repo's own checks (from `.luca/config.json`, the repo's rule files, its package scripts, or its CI), commits the way that repo commits, and pushes. It never force-pushes. Then it replies, posts the summary, looks for regressions on the files it touched, and loops at most twice.

Last, it follows `/luca-pr-prep` to bring the story up to date, which puts `review-ready` back on a shared PR, and takes `changes-wanted` off. It never merges, approves, or marks a PR signed off: that is the owner's word.

## Where it came from

The method is adapted from a `git-pr-address` skill the owner wrote for another repo. Everything specific to that repo was removed, and three things were added: the review-body channel, the owner rule, and the story refresh at the end.
