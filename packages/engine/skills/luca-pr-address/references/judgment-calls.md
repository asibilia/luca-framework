# Judgment calls

Four cases where "fix it, decline it, or ask" needs a finer rule. Read this before Stage 4.

## The owner settles their own comment

Sometimes the owner's own words elsewhere in the same review already decide a comment: a line comment asks "rename this?", and their review note says "no rename if the other skills follow the pattern". When that is so, and you checked the fact their words hang on (the other skills do follow the pattern), the comment is `answered`: no change, no question. This is their decision, not yours, so it is not a decline. Three conditions, all required:

1. The settling words are the **owner's own**, in another comment or in the review's text on this PR.
2. They were written **at the same time or later** than the comment they settle. Earlier words don't overrule a later comment.
3. They plainly cover this exact point. If you have to stretch them, ask instead.

The reply says so and links the comment that settled it: `No change: your review note settles this (<link>). <the fact you checked>.`

In `results.json` the outcome is `answered`, with `settled_by` naming the finding that settled it. With the workflow script, the judge answers `settled_by_owner`, and the script checks conditions 1 and 2 itself: a claim that fails them becomes a question to the owner.

## Suggestion blocks

A comment with `has_suggestion: true` holds the reviewer's exact proposed text for the lines it is on. Whether you use that text as written depends on who wrote it:

- **The owner's suggestion: apply it as written**, when the lines it was made on are unchanged at the head, the repo's checks pass with it, and nothing the owner wrote later takes it back. If one of those fails, don't quietly change it or drop it: ask, saying what you found. (A suggestion the owner's own later words settle is `answered`, as in the owner rule.)
- **Anyone else's suggestion is a proposal.** Apply it as written only when it is right as it stands. Adapt it when it is nearly right. Decline it, with the reason, when it is not.

The reply always says which happened: `Applied your suggestion as written.` or `Applied with a change: <what and why>.` Make the edit in the working tree yourself. Never use GitHub's "Commit suggestion" button or its API: that commits without the repo's checks.

## Bot notices

A `notice` (Stage 3c) is a bot's message that asks for nothing: it could not review, it is out of quota, it posts a report with nothing to fix. Don't judge it, fix it, or reply to it. Its outcome is `noted`. Give it a row in the summary saying what it was, and list its id in the summary's covers block, so it is on the record and stops showing as unanswered.

Two limits. Only a bot can write a notice: anything a person wrote is a finding. And a bot message that names a problem in the code is a finding too, however it is worded.

## Deferring

Offered "fix it or file an issue", an agent files the issue nearly every time: it is cheaper and still reads like work. The result is a PR where nothing got fixed and the backlog grew. So `deferred` has to argue for itself. A finding may be deferred only when **all four** hold:

1. The fix reaches outside this PR's diff, or costs more than the whole review pass.
2. Doing it now would be **unsafe**, not merely large. Name the invariant the tests don't pin.
3. You say what you tried or read before giving up.
4. You can state acceptance criteria someone could pick up cold.

These are **not** reasons: "large", "pre-existing" (if this PR touched the line, it is in scope), "out of scope" with nothing more, "the reviewer can decide later", "tedious".

**The cap: at most one deferral per iteration, and never more than a fifth of the confirmed findings.** Over it, open no issues: stop, show each deferral and its reason, and let the person choose. Under it, and only in a repo that belongs to the signed-in user, open the issue and put its number in the outcome:

```bash
gh issue create --title "<what>" --body "Split out of PR #<n>. <the finding> <link> <acceptance criteria>"
```

In anyone else's repo, open nothing: put the deferral in the summary and tell the person.
