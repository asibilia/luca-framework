/**
 * The story-writer's prompt and follow-up (#743), from the opened PR, its
 * diff, and the repo's rule files. Pure.
 */
import { inPathOrder, storyDiff, type StoryDiffFile } from './story-diff'

/** The opened PR as the story-writer's prompt names it. */
export type StoryPullRequest = {
    number: number
    url: string
    title: string
    base_branch: string
    base_sha: string
    head_sha: string
}

/** The follow-up's first line, before the problem lines. */
export const STORY_REFUSED =
    'The story was refused. Fix every problem below and answer again with the whole story.'

/** A section: its heading line, one blank line, then its body. */
const section = (heading: string, body: string): string =>
    `${heading}\n\n${body}`

/** One line per changed file, in path order. */
const changedFileLines = (files: StoryDiffFile[]): string =>
    inPathOrder(files)
        .map(({ status, path, previous_path }) =>
            status === 'renamed'
                ? `- renamed: ${previous_path ?? ''} -> ${path}`
                : `- ${status}: ${path}`
        )
        .join('\n')

/**
 * The story-writer's prompt: the PR, its changed files, its capped diff,
 * and the rule files, each a section under its own heading, one blank line
 * between them, ending with one newline. `problems`, the latest refusal's
 * problem lines, add one last section.
 *
 * @example
 * storyPrompt({ pull_request, files, rule_files: ['AGENTS.md'], problems: null })
 * // '## Pull request\n\nNumber: 812\n...'
 */
export const storyPrompt = ({
    pull_request,
    files,
    rule_files,
    problems,
}: {
    pull_request: StoryPullRequest
    files: StoryDiffFile[]
    rule_files: string[]
    problems: string[] | null
}): string => {
    const { number, url, title, base_branch, base_sha, head_sha } = pull_request
    const sections = [
        section(
            '## Pull request',
            [
                `Number: ${number}`,
                `URL: ${url}`,
                `Title: ${title}`,
                `Base branch: ${base_branch}`,
                `Base commit: ${base_sha}`,
                `Head commit: ${head_sha}`,
            ].join('\n')
        ),
        section('## Changed files', changedFileLines(files)),
        // The diff part ends with a newline; the blank line after it is
        // the one between sections.
        section('## Diff', storyDiff({ files }).replace(/\n$/, '')),
        section(
            '## Rule files',
            rule_files.length === 0
                ? 'No rule files.'
                : rule_files.map((path) => `- \`${path}\``).join('\n')
        ),
        ...(problems === null
            ? []
            : [section('## Problems with the last try', problems.join('\n'))]),
    ]
    return `${sections.join('\n\n')}\n`
}

/**
 * The follow-up to a refused story: `STORY_REFUSED`, a blank line, then
 * every problem line.
 *
 * @example
 * storyFollowUp({ problems: ['map.entry_path: ...'] })
 */
export const storyFollowUp = ({ problems }: { problems: string[] }): string =>
    `${STORY_REFUSED}\n\n${problems.join('\n')}`
