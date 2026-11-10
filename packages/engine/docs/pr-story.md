# The PR story

A **story** is the written guide to one pull request at one commit (#738, part of #735). It says what changed and why, maps how the changed files link, and walks the change one **stop** at a time in the order the code runs, from a marked starting point. For every changed region it carries the context a reviewer needs: how the walk got there, why the change was needed, what it means for the architecture, the one thing to check, the test that proves it, the ask it serves, its counted blast radius, and any flags.

The `/luca-pr-prep` skill writes a story. A review app (#739) reads it. Luca's own runs will write one for every PR they open (#741).

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

`--shared` or `--private` forces a home. The format is the same in both. A reader looks in the private home first, then in the PR's comments.

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
- Run again, `/luca-pr-prep` loads the old story, keeps every change in a file the new commits didn't touch, and rewrites the rest. After a force-push it writes a new story.

## The skill's helper

A skill runs from `~/.claude/skills/`, where no packages are installed, so it can't import Zod. `packages/engine/scripts/build-pr-story.ts` bundles `src/story/pr-story-main.ts`, with Zod and the schema inside, into `skills/luca-pr-prep/scripts/pr-story.js`. The skill checks a story with the very schema a reader uses, not a copy.

```bash
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js check <story.json>
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js home <owner/repo> [--shared | --private]
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js save <story.json> [--shared | --private]
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js load <owner/repo> <pr number> [--out <file>]
bun ~/.claude/skills/luca-pr-prep/scripts/pr-story.js status <owner/repo> <pr number>
```

Exit codes: 0 done, 1 the story is invalid or missing, 2 bad arguments or a failed step. `save` checks first, so a story that fails the schema is never saved or posted. GitHub is reached only through `gh`.

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

`packages/engine/src/story/*.test.ts` cover the schema, the comments round trip and its size limit, the private store, and the helper's commands against a pretend GitHub. `skills/luca-pr-prep/` holds the skill's text test and the bundle's freshness test.

## Related

- [Modules: other](modules-other.md) lists the files.
- `packages/engine/skills/luca-pr-prep/SKILL.md` is the skill itself.
