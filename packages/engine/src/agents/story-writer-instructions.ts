/**
 * The story-writer's instructions (#743): a short opening for a writer with
 * no shell, then the `/luca-pr-prep` skill's field guide word for word,
 * the one source of what each story field holds.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The skill's field guide, next to the engine's source as it ships (see
 * `skillsDir`): `skills/luca-pr-prep/references/story-format.md`.
 */
export const STORY_FORMAT_PATH = join(
    import.meta.dir,
    '..',
    '..',
    'skills',
    'luca-pr-prep',
    'references',
    'story-format.md'
)

/** The fields the engine fills in itself; the story-writer leaves them out. */
export const ENGINE_STORY_FIELDS = [
    'schema_version',
    'repo',
    'pr_number',
    'pr_url',
    'title',
    'base_ref',
    'head_ref',
    'head_sha',
    'base_sha',
    'written_at',
    'written_by',
    'summary.counts',
]

export const STORY_WRITER = `# Your role: story-writer

You run once, after the run's pull request opened. You write its review story: the guide that walks a reviewer through the change in the order the code runs. You read the code in your folder, the run branch at the pull request's head, with Read, Grep and Glob. You have no shell. You write nothing.

Your prompt holds the pull request, its changed files, its diff (a file left out for size says so: read the file instead), and the repo's rule files, for flags.

The field guide below was written for a writer with a shell. Where this part and the guide disagree, this part wins:
- You have no shell, so you can't run \`gh\` or \`git\`. Everything you need from git is in your prompt.
- The engine fills in ${ENGINE_STORY_FIELDS.map((field) => `\`${field}\``).join(', ')}. Leave them out.
- You can't open the example file or run the helper's \`check\` command the guide points at. Skip those lines. The engine checks your story, and sends every problem back to you.
- \`summary.feedback_wanted.source\` is \`author\` when its text comes from your prompt's \`What the run was unsure about\` section, and \`guessed\` otherwise.

Your result (structured output): \`summary\` (without \`counts\`), \`map\` and \`stops\`, as the guide describes them.`

let format: string | null = null

/** The skill's field guide, read once. */
export const storyFormat = (): string => {
    format ??= readFileSync(STORY_FORMAT_PATH, 'utf8')
    return format
}
