import type { StoryFlag } from './story-parts'
import { storyPositions, type Story } from './story-schema'

/**
 * The part of a story a person reads on GitHub (#738): the top of the
 * first story comment. Plain markdown, no data. The review app shows the
 * same story in full; this is the short form for someone without it.
 */

/** Most stops listed before the rest are summed up in one line. */
const STOPS_SHOWN = 30

const KIND_WORDS: Record<Story['summary']['kind'], string> = {
    enhancement: 'Enhancement',
    fix: 'Fix',
    refactor: 'Refactor',
    docs: 'Docs',
    test: 'Tests',
    chore: 'Chore',
    mixed: 'Mixed change',
}

const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? '' : 's'}`

const flagLine = ({ flag }: { flag: StoryFlag }): string => {
    const where = flag.line === null ? flag.path : `${flag.path}:${flag.line}`
    const source = flag.rule_source === null ? '' : ` (${flag.rule_source})`
    return `- **${flag.rule}**${source}, \`${where}\`: ${flag.message}`
}

/**
 * The readable summary of a story, as markdown.
 *
 * @example
 * renderStorySummary({ story }) // '## Review story\n\n**Fix.** Retries a stuck ticket...'
 */
export const renderStorySummary = ({ story }: { story: Story }): string => {
    const { summary, map, stops } = story
    const { counts } = summary
    const positions = storyPositions({ story })
    const uncovered = stops
        .flatMap((stop) => stop.changes)
        .filter((change) => !change.proof.covered).length
    const shown = stops.slice(0, STOPS_SHOWN)
    const stop_lines = shown.map((stop, at) => {
        const where = stop.path === null ? 'loose ends' : `\`${stop.path}\``
        const start =
            at === 0 && stop.kind === 'walk' ? ' **(start here)**' : ''
        return `${at + 1}. ${where}${start}: ${stop.title} (${plural(stop.changes.length, 'change')})`
    })
    if (stops.length > shown.length) {
        stop_lines.push(
            `…and ${plural(stops.length - shown.length, 'more stop')}.`
        )
    }
    const asker =
        summary.feedback_wanted.source === 'author'
            ? 'The author wants your eyes on'
            : 'Least sure about'

    return [
        '## Review story',
        '',
        `**${KIND_WORDS[summary.kind]}.** ${summary.what_changed}`,
        '',
        `- **Before:** ${summary.before}`,
        `- **After:** ${summary.after}`,
        `- **${asker}:** ${summary.feedback_wanted.text}`,
        '',
        [
            `${counts.files_added} added`,
            `${counts.files_changed} changed`,
            `${counts.files_deleted} deleted`,
            `+${counts.lines_added} / -${counts.lines_removed} lines`,
            `about ${summary.review_minutes} min to review`,
            uncovered === 0
                ? 'every change has a test'
                : `${plural(uncovered, 'change')} of ${positions.length} with no test`,
        ].join(' · '),
        '',
        '### The walk',
        '',
        ...stop_lines,
        '',
        '### Architecture',
        '',
        map.architecture_note,
        '',
        ...(summary.flags.length === 0
            ? ['No flags.']
            : [
                  '### Flags',
                  '',
                  ...summary.flags.map((flag) => flagLine({ flag })),
              ]),
        '',
        `Written for commit \`${story.head_sha.slice(0, 9)}\` by ${story.written_by}. New commits make this story out of date.`,
    ].join('\n')
}
