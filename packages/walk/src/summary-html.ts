import { AGENT_AUTHOR, type Reply } from './github-conversation'
import { button, escapeHtml, labelled, page, paragraph } from './webview-html'

import type { StoryUnpack } from '../../engine/src/story/story-comments'
import type { Story } from '../../engine/src/story/story-schema'

/**
 * The Summary panel (#752, section 4): the story's summary, or why there
 * is no walk, with the buttons that go with it.
 */

/** What loading a pull request found. */
export type Loaded =
    | { status: 'found'; found: StoryUnpack; head_sha: string }
    | { status: 'failed'; message: string }

type Flag = Story['summary']['flags'][number]

const short = ({ sha }: { sha: string }) => sha.slice(0, 7)

/** `1 file`, `2 files`. */
const many = ({ count, one }: { count: number; one: string }) =>
    `${count} ${one}${count === 1 ? '' : 's'}`

/**
 * The counts line.
 *
 * @example
 * countsLine({ summary }) // '2 files added, 3 changed, 1 deleted · 120 lines added, 45 removed · about 20 minutes'
 */
export const countsLine = ({
    summary,
}: {
    summary: Story['summary']
}): string => {
    const { counts } = summary
    return [
        `${many({ count: counts.files_added, one: 'file' })} added, ${counts.files_changed} changed, ${counts.files_deleted} deleted`,
        `${many({ count: counts.lines_added, one: 'line' })} added, ${counts.lines_removed} removed`,
        `about ${many({ count: summary.review_minutes, one: 'minute' })}`,
    ].join(' · ')
}

/**
 * A flag as one line.
 *
 * @example
 * flagLine({ flag }) // 'No classes (AGENTS.md), src/a.ts line 44: Adds a class.'
 */
export const flagLine = ({ flag }: { flag: Flag }): string => {
    const source = flag.rule_source === null ? '' : ` (${flag.rule_source})`
    const line = flag.line === null ? '' : ` line ${flag.line}`
    return `${flag.rule}${source}, ${flag.path}${line}: ${flag.message}`
}

const summaryBody = ({ story }: { story: Story }): string => {
    const { summary } = story
    const asked =
        summary.feedback_wanted.source === 'author'
            ? 'The author wants feedback on:'
            : "The story's writer was least sure about:"
    const flags =
        summary.flags.length === 0
            ? ''
            : `<ul>${summary.flags
                  .map(
                      (flag) =>
                          `<li>${escapeHtml({ text: flagLine({ flag }) })}</li>`
                  )
                  .join('')}</ul>`
    return [
        `<h1>${escapeHtml({ text: `#${story.pr_number} ${story.title}` })}</h1>`,
        paragraph({ text: summary.kind }),
        paragraph({ text: summary.what_changed }),
        labelled({ label: 'Before:', text: summary.before }),
        labelled({ label: 'After:', text: summary.after }),
        labelled({ label: asked, text: summary.feedback_wanted.text }),
        paragraph({ text: countsLine({ summary }) }),
        flags,
        button({ id: 'start_walk', label: 'Start the walk' }),
        button({ id: 'show_map', label: 'Show the map' }),
    ].join('\n')
}

const WRITE = button({ id: 'write_story', label: 'Write the story' })

/** The command shown instead of `Write the story`, and why. */
type StoryCommand = { command: string; why: string }

/**
 * Where `Write the story` would be: the button, or, anywhere but the
 * owner's own pull request in their own repo (#766), why not, the command
 * to copy and its Copy button.
 */
const writePart = ({
    story_command,
}: {
    story_command: StoryCommand | null
}) =>
    story_command === null
        ? WRITE
        : [
              paragraph({ text: story_command.why }),
              paragraph({
                  text: "To write the story, run this in a terminal. It starts Claude outside this checkout, so this repo's Claude settings are never loaded:",
              }),
              `<pre><code>${escapeHtml({ text: story_command.command })}</code></pre>`,
              button({ id: 'copy_story_command', label: 'Copy the command' }),
          ].join('\n')
const BROWSE = button({ id: 'browse_diff', label: 'Browse the diff' })
const RELOAD = button({ id: 'reload_story', label: 'Reload the story' })
const NOT_READ = "This pull request's story can't be read:"

/** The panel's body for what was found, before the Reload button. */
const foundBody = ({
    found,
    head_sha,
    write,
}: {
    found: StoryUnpack
    head_sha: string
    /** The HTML where `Write the story` goes. */
    write: string
}): string => {
    if (found.status === 'ok' && found.story.head_sha === head_sha) {
        return summaryBody({ story: found.story })
    }
    if (found.status === 'newer_version') {
        const text = `This story uses a newer story format (version ${found.schema_version}). Update Luca Walk to read it.`
        return [paragraph({ text }), BROWSE].join('\n')
    }
    const said =
        found.status === 'ok'
            ? [
                  paragraph({
                      text: `This story was written for ${short({ sha: found.story.head_sha })}, but the pull request is now at ${short({ sha: head_sha })}.`,
                  }),
              ]
            : found.status === 'none'
              ? [paragraph({ text: 'This pull request has no story yet.' })]
              : found.status === 'invalid'
                ? [NOT_READ, ...found.problems].map((text) =>
                      paragraph({ text })
                  )
                : [NOT_READ, found.reason].map((text) => paragraph({ text }))
    return [...said, write, BROWSE].join('\n')
}

/** A text as one paragraph per line that isn't blank. */
const linesOf = (text: string): string =>
    text
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => paragraph({ text: line }))
        .join('')

/**
 * `/luca-pr-address`'s summaries, newest first, then (#766) comments by
 * others that hold its marker, under their real authors; empty when there
 * are none.
 */
const repliesBody = ({ replies }: { replies: Reply[] }): string => {
    const agent = replies.filter(({ author }) => author === AGENT_AUTHOR)
    const others = replies.filter(({ author }) => author !== AGENT_AUTHOR)
    const heading = (text: string) => `<h2>${escapeHtml({ text })}</h2>`
    return [
        ...(agent.length === 0
            ? []
            : [
                  heading('Replies from /luca-pr-address:'),
                  ...agent.map(({ body }) => `<div>${linesOf(body)}</div>`),
              ]),
        ...(others.length === 0
            ? []
            : [
                  heading(
                      "Comments by others that hold /luca-pr-address's marker:"
                  ),
                  ...others.map(
                      ({ author, body }) =>
                          `<div>${paragraph({ text: `${author}:` })}${linesOf(body)}</div>`
                  ),
              ]),
    ].join('\n')
}

/**
 * The Summary panel's HTML for pull request `pr_number`.
 *
 * @param story_requested - `Write the story` was pressed, so `Reload the story` is offered.
 */
export const summaryHtml = ({
    pr_number,
    loaded,
    story_requested,
    replies = [],
    visit_note = null,
    story_command = null,
    story_note = null,
}: {
    pr_number: number
    loaded: Loaded
    story_requested: boolean
    /** `/luca-pr-address`'s summaries, and look-alikes by others, newest first. */
    replies?: Reply[]
    /** What changed since the owner's last review; null on a first visit. */
    visit_note?: string | null
    /** The command shown instead of `Write the story`, and why; null for the button. */
    story_command?: StoryCommand | null
    /** Why a story on the pull request is not used (#766); null when none is left out. */
    story_note?: string | null
}): string => {
    const title = `Summary of #${pr_number}`
    if (loaded.status === 'failed') {
        const body = [
            paragraph({ text: `Luca Walk could not load #${pr_number}:` }),
            paragraph({ text: loaded.message }),
            RELOAD,
        ].join('\n')
        return page({ title, body })
    }
    const body = foundBody({
        ...loaded,
        write: writePart({ story_command }),
    })
    return page({
        title,
        body: [
            visit_note === null ? '' : paragraph({ text: visit_note }),
            story_note === null ? '' : paragraph({ text: story_note }),
            body,
            ...(story_requested ? [RELOAD] : []),
            repliesBody({ replies }),
        ]
            .filter((part) => part !== '')
            .join('\n'),
    })
}
