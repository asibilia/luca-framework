# The PR story

A **story** is the written guide to one pull request at one commit (#738, part of #735). It says what changed and why, maps how the changed files link, and walks the change one **stop** at a time in the order the code runs, from a marked starting point. For every changed region it carries the context a reviewer needs: how the walk got there, why the change was needed, what it means for the architecture, the one thing to check, the test that proves it, the ask it serves, its counted blast radius, and any flags.

The `/luca-pr-prep` skill writes a story. A review app (#739) reads it. Luca's own runs write one for every PR they open (#741): see "A run's own story" below.

## A run's own story

Once a run's PR is open, and before the run branch's worktree is removed, the engine starts a **story-writer** (#743): a fresh agent on the locked pick (Opus) at `high` effort, with 80 turns, that plays by the learner's guard (Read, Grep, Glob and the read-only helper; no shell, it writes nothing). Its instructions carry `story-format.md` word for word, after a short opening that wins where the two disagree (`agents/story-writer-instructions.ts`).

Its prompt is pure code (`core/story-prompt.ts`), in this order:

- `## Pull request`: its number, URL, title, base branch, base and head commits.
- `## Changed files`: one line per file, in path order (`core/story-diff-files.ts` joins git's three reads into one entry per file).
- `## Diff`: git's own text, capped at 150,000 characters by `core/story-diff.ts`: smallest files whole first, the rest left out with their hunk headers and line counts.
- `## The run's asks` (#745): the spec's number, URL, title and body (between lines of `~~~~~~`), then each ticket the run built (not skipped, not already done) with its URL and every acceptance criterion (`AC1: ...`), all from the run's intake snapshot (`core/story-asks.ts`).
- `## What the run was unsure about` (#745): `Open findings:` and `Assumptions agents made:`, the same lines as the PR body's `## Open findings` and `## Assumptions` sections (`openFindingsLines`, `assumptionLines` in `core/pull-request-text.ts`), or `Nothing was left open.`
- `## Rule files`.

It answers with the story's `summary` (without `counts`), `map` and `stops`. The engine fills in every other field from the PR, the tracker's `repo` and git (`head_sha` the run branch's tip, `base_sha` its merge base with `origin/<base>`, `summary.counts` from git, `written_at` the answer's `agent_finished` time). It keeps the answer's `summary.feedback_wanted.source` (`author` when the text comes from what the run was unsure about), except when nothing was left open: then it sets it to `guessed`, and never fails a try over it. It reads the whole story with `readStory`, and only a story that read calls `ok` has its serves refs checked (`servesProblems`, `core/story-serves.ts`): each label is exactly `spec #12` or `ticket #14, AC2`, names the run's spec or a ticket it built (and a criterion that ticket has), carries that issue's URL, and for a ticket quotes that criterion's text. A valid story goes to `story.json` in the run folder and is saved through the tracker (`saveStory`) ──> `story_saved`.

A story that fails the read or the serves check is journaled as `story_refused` and goes back to the same session with every problem (the reader's lines, or one line per failing serves ref, in story order); a turn with no result gets a fresh story-writer, whose prompt ends with `## Problems with the last try`. After 3 failed tries, a `head_moved` save or a refused save, the engine journals `story_skipped` and the run ends as it would have: a story never makes a run stuck. The next step, `report_story_skip` (#744), tells the owner: in the shared home it posts one comment on the PR (``Luca could not write the review story for this pull request (<reason>). Run `/luca-pr-prep <number>` to write it.``), once even across a crash, then journals `story_skip_reported` with the comment's id (null when the tracker refused the comment); in the private home it posts and journals nothing. `pr_story: false` in `.luca/config.json` turns the step off.

## The format is a contract

The writer and every reader must agree on the shape exactly, so it is one Zod schema: `StorySchema` in `packages/engine/src/story/story-schema.ts`, built from the parts in `story-parts.ts`. Keys are `snake_case`. A reader imports it from `@luca/engine`:

```typescript
import { readStory, storyPositions } from '@luca/engine'

const read = readStory({ value: JSON.parse(text) })
if (read.status === 'ok') {
    const where = storyPositions({ story: read.story }) // stop 2 of 5, change 1 of 2 in this file
}
if (read.status === 'newer_version') {
    // Written by a newer writer: ask the user to update the reader.
}
if (read.status === 'invalid') {
    console.error(read.problems.join('\n'))
}
```

`STORY_SCHEMA_VERSION` (now 1) goes up whenever a reader of the old shape could misread the new one. Beyond the shape, the schema checks what a reader relies on: ids are unique, the walk starts in the map's entry file, the loose ends are the last stop, no changed file is left out, "how we got here" points backwards, and every count matches its list. `skills/luca-pr-prep/references/story-format.md` lists every field in plain words.

There are no grades in a story. Blast radius is a count with the list behind it. Conventions and cleanliness are **flags**: absent when fine, and when something is off they name the rule and the line.

## Two homes

| Home | Where the story lives | When |
| --- | --- | --- |
| **Shared** | Comments on the PR, plus the `review-ready` label | A repo that belongs to the signed-in GitHub user's own account |
| **Private** | `~/.local/state/luca/stories/<owner>/<repo>/pr-<number>.json` (`LUCA_STORIES_DIR` moves the folder) | Every other repo. Nothing is posted |

`--shared` or `--private` forces a home. The format is the same in both. A reader looks in both homes. When both hold a story for the PR, a stale copy never hides a fresh one:

1. The copy written for the PR's current head is used.
2. Otherwise a readable copy beats a broken one.
3. Otherwise the repo's default home wins: shared in your own repo, private everywhere else.

Every reader should find a story through `findStory` (`story-pick.ts`, exported from `@luca/engine` with `pickStory`), so the helper, a review app, and the engine all follow this one rule:

```typescript
import { findStory, storiesDir } from '@luca/engine'

const { found, home, other_copy } = await findStory({
    gh, // runs the `gh` command
    stories_dir: storiesDir({ home: homedir(), env: process.env }),
    repo: 'acme/site',
    pr_number: 12,
})
```

A writer that posts to the shared home should call `removePrivateStory` afterwards, as the helper's `save` does.

`status` reports the copy that was not used as `other_copy` (`null` when there is only one), and `load` mentions it. Saving to the shared home removes the PR's private copy, so the two can't drift apart. When the PR's comments can't be read (no network, no access), a private copy is still used.

### A story as comments

`packStory` (`story-comments.ts`) turns a story into one or more comment bodies:

````
<!-- luca-pr-story v=1 part=1/2 head=<commit> sha256=<hash of the JSON> -->
## Review story
...the readable summary (story-render.ts)...

<details><summary>Story data (for the review app)</summary>
```luca-pr-story
<the story's JSON, base64, wrapped>
```
</details>
````

- The hidden first line marks a comment as a story's, so a re-run finds and rewrites its own comments (`planCommentSync`) and never touches anyone else's.
- The JSON is base64 so that markdown, backticks, or HTML inside a story can't break the block.
- GitHub refuses a comment body over 65,536 characters. A story comment stays within 60,000 bytes; a longer story spills into `part=2/n`, and so on. `unpackStory` joins the parts in order and checks the hash, so half an update reads as `broken`, not as a wrong story.

## Staying in step with the code

A story names the commit it was written for (`head_sha`). When the PR's head moves on, the story is **stale**:

- The helper's `status` command says `stale`, and takes `review-ready` off the PR. There is no GitHub Action for this: the label comes off the next time the skill or a reader asks for the status.
- `save` refuses to post a story whose `head_sha` is not the PR's head.
- Run again, `/luca-pr-prep` loads the old story and brings it up to date instead of writing it again. After a force-push it writes a new story.

### Moving the line numbers

New commits move code they don't change: one line added at the top of a file pushes every change, test, and caller below it down. So "keep a change word for word" is not enough; its line numbers have to move too. The helper's `shift` command does that, so it is not left to a careful reread:

```bash
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js shift <story.json> <new head sha> [--out <file>] [--repo-dir <dir>]
```

It asks `git` for the zero-context diff between the story's commit and the new one, for the files the story points into, and moves every line number through it (`shiftStory` in `story-shift.ts`): each change's range, and the line of every test in `proof`, every place in `blast_radius`, and every flag. It sets `head_sha` to the new commit and writes the story back (or to `--out`).

What the new commits **edited** it leaves alone and lists as `notes` in the one JSON line it prints, `{ status, from, to, lines_moved, notes }`:

| Note | Means | The writer must |
| --- | --- | --- |
| `change_touched` | The commits edit lines inside this change | Rewrite the change |
| `change_file_gone` | The change's file was deleted | Rewrite it as a deletion, or drop it |
| `ref_touched` | A test, caller, or flag line it points at was edited | Find the line again, or redo the proof, count, or flag |
| `ref_file_gone` | The file of such a line was deleted | Redo the proof or the count without it |

A range on the `base` side counts lines of the old file and is not moved. `shift` exits 1 when the story's commit is not an ancestor of the new one, and 2 when `git` doesn't have a commit. Run on a story already at that commit, it changes nothing, so running it twice is safe.

## The skill's helper

A skill runs from `~/.claude/skills/`, where no packages are installed, so it can't import Zod. `packages/engine/scripts/build-pr-story.ts` bundles `src/story/pr-story-main.ts`, with Zod and the schema inside, into `skills/luca-pr-prep/scripts/pr-story.js`. The skill checks a story with the very schema a reader uses, not a copy.

```bash
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js check <story.json>
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js home <owner/repo> [--shared | --private]
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js save <story.json> [--shared | --private]
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js load <owner/repo> <pr number> [--out <file>]
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js status <owner/repo> <pr number>
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js shift <story.json> <new head sha> [--out <file>] [--repo-dir <dir>]
```

Exit codes: 0 done, 1 the story is invalid or missing, 2 bad arguments or a failed step. `save` checks first, so a story that fails the schema is never saved or posted. GitHub is reached only through `gh`, and only `shift` runs `git`.

**After any change in `src/story/`, rebuild and commit the bundle:**

```bash
bun packages/engine/scripts/build-pr-story.ts
bun packages/engine/scripts/write-story-example.ts   # when the test fixture story changed
```

`skills/luca-pr-prep/scripts/pr-story-bundle.test.ts` fails until you do: the bundle's second line holds a hash of the source it was built from.

## Errors

- A story file that isn't JSON, fails the schema, or is from a newer version: `check` and `save` print every problem and exit 1.
- `gh` missing, signed out, or refused: the command prints `gh`'s own message and exits 2. With `gh` unable to say who is signed in, the home falls back to private, so nothing is posted by mistake.
- A private file that is damaged reads as `invalid`; a missing one as `none`.

## Tests

`packages/engine/src/story/*.test.ts` cover the schema, the comments round trip and its size limit, the private store, the two-homes rule, moving line numbers, and the helper's commands against a pretend GitHub and a pretend `git`. `story-shift.e2e.test.ts` runs `shift` against a real git repo. `skills/luca-pr-prep/` holds the skill's text test and the bundle's freshness test.

## Related

- [Modules: other](modules-other.md) lists the files.
- `packages/engine/skills/luca-pr-prep/SKILL.md` is the skill itself.
