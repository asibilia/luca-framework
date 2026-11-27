# @luca/engine: the PR story modules

The modules in `src/story/`, and the scripts that build the skill's helper.

See [The PR story](pr-story.md) (#738) for how it works.

| Module | What it does |
| --- | --- |
| `src/story/story-parts.ts` | The Zod schemas for a story's parts: the summary, the map, a stop, a change and its context, and a flag. |
| `src/story/story-schema.ts` | `StorySchema` and `STORY_SCHEMA_VERSION`; `readStory`, which tells a good story from a newer or a broken one; `storyPositions`. |
| `src/story/story-render.ts` | The readable summary at the top of the first story comment. |
| `src/story/story-comments.ts` | A story as PR comments: `packStory`, `unpackStory`, `isStoryComment`, and `planCommentSync` for replacing a story's own comments. |
| `src/story/story-redact.ts` | `redactStory`: a story with every text redacted, before `postSharedStory` packs it, since its data is base64 in the comments. |
| `src/story/story-store.ts` | The private home: one file per PR under the stories folder. |
| `src/story/story-github.ts` | The shared home through `gh`: reading and posting story comments, the `review-ready` label, and which home a repo gets. |
| `src/story/story-home.ts` | `StoryHomeSchema` and `StoryHome`: a story's two homes, `shared` and `private`. |
| `src/story/story-pick.ts` | The two-homes rule: `findStory` reads both homes, and `pickStory` makes sure a stale copy never hides a fresh one. |
| `src/story/story-save.ts` | `saveStoryWith` (#742): the one save the helper's `save` command and the GitHub tracker both call. Private: the story file in the stories folder. Shared: refuses a moved head, else posts the story as comments (rewriting its own in place), adds `review-ready` (creating it when missing), and removes the PR's private copy. |
| `src/story/story-shift.ts`, `story-shift-cli.ts` | Moving a stale story's line numbers to a newer commit (`shiftStory`), and the helper's `shift` command that runs it against `git`. |
| `src/story/story-cli.ts`, `pr-story-main.ts` | The skill's helper commands, and its entry point with the real `gh` and `git`. |
| `scripts/build-pr-story.ts`, `scripts/write-story-example.ts` | Build the helper bundle and the example story the skill ships. Both take the skill's folder and file names from `scripts/pr-prep-skill-paths.ts`. |
