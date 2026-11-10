# The summary comment

Stage 6 of `/luca-pr-address`. One summary comment per iteration records what happened to every finding. It is also how the next run knows what was answered.

**A review's own text and an alert have no thread.** Their outcomes live only in the summary comment, which is why the summary is required. Write it to `summary.md` in the working folder. It starts with two hidden parts:

- **The marker line.** `head=` is the PR's **full** head commit, all 40 characters, **after** your push (`git rev-parse HEAD`). Not a short sha, and not the commit you started on.
- **The covers block**: the `id` of every finding this summary answers, one per line, as `findings.json` spells them (`rv-…`, `alert-…`, `rc-…`). The next run counts a review's text or an alert as answered **only if its id is listed here**. So list every finding that has a row in the table, and never list one you did not address.

```markdown
<!-- luca-pr-address summary iteration=<k> head=<full sha> -->
<!-- luca-pr-address covers
rc-4039139369
rv-5846885354
alert-7-src/cart.ts-4
-->
## Review addressed, iteration <k>

| # | Where | Finding | Outcome |
|---|-------|---------|---------|
| F01 | `file.ts:186` | Total ignores the discount | Fixed in `abc1234` |
| F02 | `other.ts:42` | Rename `x` to `count` | Asked: which of the two counts? |
| F03 | (whole PR) | Bot: prefer a class here | Declined: the repo's rules forbid classes |
| F04 | (whole PR) | Bot: could not review, out of quota | Noted: a notice, nothing to fix |

Fixed N · Answered N · Asked N · Deferred N · Declined N · Skipped N · Noted N
Waiting on <owner>: N question(s)
Checks run: <which, and that they passed>
CI notices (no line to fix): N
```

**Check the summary against GitHub as it is right now, before you post it.** Reviews and comments can arrive while you work, and a summary must not answer what it never read:

```bash
bun ~/.claude/skills/luca-pr-address/scripts/fetch-findings.ts [number] [--repo <owner/repo>] --check-summary <work_dir>/summary.md
```

It fetches again and prints `{ "ready", "problems", "late" }`. Post only when `ready` is true.

- `problems`: the marker line or covers block is wrong (a short or old `head=`, an id that is no finding, a line comment listed before its thread got a reply). Fix the file.
- `late`: findings that are unanswered and that the summary does not list. They arrived after your fetch, or you missed them. **Never add one to the covers block to make the check pass.** For each: address it now (fetch with `--save`, triage it, act, reply) when you still have an iteration left, and always when it is from the owner and small. Otherwise leave it out of the covers block and name it under an `Arrived during this run, not yet addressed` heading in the summary, so the next run picks it up. An owner's comment is never dropped: it is addressed now or it stays open.

When only named late arrivals are left, post the summary anyway: the check will keep saying `ready: false` for them, and that is right.

```bash
gh api "repos/<owner>/<repo>/issues/<n>/comments" -F body=@<work_dir>/summary.md
```

Then fetch again with `--save` and confirm `stats.unanswered` counts only the late arrivals you named, or is zero.
