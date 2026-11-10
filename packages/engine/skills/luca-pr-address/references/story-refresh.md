# Refreshing the PR's story, and the final report

Stage 8 of `/luca-pr-address`.

When the iteration pushed commits, the PR's story is stale. The `/luca-pr-prep` skill refreshes it. Find that skill, in this order:

```bash
for dir in ~/.claude/skills/luca-pr-prep .claude/skills/luca-pr-prep packages/engine/skills/luca-pr-prep; do
    [ -f "$dir/SKILL.md" ] && echo "$dir" && break
done
```

1. `~/.claude/skills/luca-pr-prep/SKILL.md`: where `luca init` and `luca upgrade` install it.
2. `.claude/skills/luca-pr-prep/` in this repo: a project-level install.
3. `packages/engine/skills/luca-pr-prep/` in this repo: you are inside Luca's own repo, where the skill lives before it is installed.

Follow the `SKILL.md` you found for this PR. When it is not the installed copy, run its helper from the folder you found, in place of `~/.claude/skills/luca-pr-prep` in its commands. Its `status` step will say `stale`, and its "bring a stale story up to date" step moves the story's line numbers and rewrites only what your commits touched. It keeps the story where it already lives (shared or private) and puts `review-ready` back on a shared PR. Never post a story or add that label by hand.

**If the skill is in none of the three places, don't skip this quietly.** The PR now has a stale story, or none, and no `review-ready` label. Say so in the final report, as `story: not refreshed, luca-pr-prep not found`, and tell the person how to get it (`luca init`, or `luca upgrade`). If the skill is there but the PR never had a story, write one with it when the PR is in a repo of the signed-in user's own; otherwise report `story: none`.

## The final report

```
PR #<n> review addressed
  iterations:      <k>
  outcomes:        <n> fixed, <n> answered, <n> asked, <n> deferred, <n> declined, <n> skipped
  waiting on you:  <the questions asked, one line each>
  commits:         <shas>
  checks:          <what ran and how it ended>
  checks pending:  <none | the checks still unfinished after 15 minutes; their alerts are unread>
  arrived late:    <none | findings that came in during the run and are still open>
  story:           <refreshed | written | none | not refreshed, luca-pr-prep not found>
  plan file:       <work_dir>/plan.md
```
