import { flagLine } from './summary-html'
import { escapeHtml, labelled, link, page, paragraph } from './webview-html'

import type { StoryChange } from '../../engine/src/story/story-parts'
import { storyPositions, type Story } from '../../engine/src/story/story-schema'

/**
 * The Context view (#752, section 7): the story's context for the change
 * under the cursor, the stop's changes when the cursor is on none, or that
 * the file is not part of the walk.
 */

const TITLE = 'Context'

const NOT_IN_WALK =
    'This file is not part of the walk. Use "Back to the walk" to return.'

/** Where the cursor is: a repo path, its diff side, and a 1-based line. */
export type ContextCursor = {
    path: string
    side: 'head' | 'base'
    line: number
}

const list = ({ items }: { items: string[] }) =>
    items.length === 0
        ? ''
        : `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`

const heading = ({ label }: { label: string }) =>
    `<p><strong>${escapeHtml({ text: label })}</strong></p>`

const lineOf = ({ path, line }: { path: string; line: number | null }) =>
    line === null ? path : `${path} line ${line}`

const many = ({
    count,
    one,
    other,
}: {
    count: number
    one: string
    other: string
}) => `${count} ${count === 1 ? one : other}`

const proofHtml = ({ proof }: { proof: StoryChange['proof'] }) => {
    const tests = proof.covered
        ? list({
              items: proof.tests.map(({ path, line, name }) => {
                  const where = lineOf({ path, line })
                  return escapeHtml({
                      text: name === null ? where : `${where}: ${name}`,
                  })
              }),
          })
        : paragraph({ text: 'No test covers this.' })
    return [labelled({ label: 'Proof:', text: proof.note }), tests].join('\n')
}

const servesHtml = ({ serves }: { serves: StoryChange['serves'] }) => {
    if (!serves.found) return labelled({ label: 'Serves:', text: serves.note })
    const items = serves.refs.map(({ label, url, quote }) => {
        const named =
            url === null
                ? escapeHtml({ text: label })
                : link({ url, text: label })
        return quote === null
            ? named
            : `${named} ${escapeHtml({ text: `"${quote}"` })}`
    })
    return [heading({ label: 'Serves:' }), list({ items })].join('\n')
}

const blastHtml = ({ blast }: { blast: StoryChange['blast_radius'] }) => {
    const total = many({
        count: blast.dependents_total,
        one: 'place depends',
        other: 'places depend',
    })
    const sentence = `Blast radius: ${total} on this, ${blast.dependents_outside_pr} outside this pull request.`
    const items = blast.dependents.map(({ path, line, in_pr }) =>
        escapeHtml({
            text: `${lineOf({ path, line })}${in_pr ? ' (in this pull request)' : ''}`,
        })
    )
    return [paragraph({ text: sentence }), list({ items })].join('\n')
}

const changeBody = ({
    story,
    change,
}: {
    story: Story
    change: StoryChange
}) => {
    const position = storyPositions({ story }).find(
        ({ change_id }) => change_id === change.id
    )
    const where =
        position === undefined
            ? ''
            : paragraph({
                  text: `Stop ${position.stop_number} of ${position.stop_count} · change ${position.change_in_file} of ${position.changes_in_file} in this file`,
              })
    const from = story.stops
        .flatMap((stop) => stop.changes)
        .find(({ id }) => id === change.how_we_got_here.from_change_id)
    const flags =
        change.flags.length === 0
            ? ''
            : [
                  heading({ label: 'Flags:' }),
                  list({
                      items: change.flags.map((flag) =>
                          escapeHtml({ text: flagLine({ flag }) })
                      ),
                  }),
              ].join('\n')
    return [
        where,
        `<h2>${escapeHtml({ text: change.title })}</h2>`,
        labelled({
            label: 'How we got here:',
            text: change.how_we_got_here.text,
        }),
        from === undefined
            ? ''
            : labelled({ label: 'Comes from:', text: from.title }),
        labelled({ label: 'Why:', text: change.why_needed }),
        labelled({ label: 'Architecture:', text: change.architecture_note }),
        labelled({ label: 'Check this:', text: change.check_this }),
        proofHtml({ proof: change.proof }),
        servesHtml({ serves: change.serves }),
        blastHtml({ blast: change.blast_radius }),
        flags,
    ]
        .filter((part) => part !== '')
        .join('\n')
}

/** The Context view's HTML for a file the story doesn't touch. */
export const notInWalkHtml = (): string =>
    page({ title: TITLE, body: paragraph({ text: NOT_IN_WALK }) })

/**
 * The Context view's HTML for the cursor at `cursor` in `story`'s pull
 * request.
 *
 * @example
 * contextHtml({ story, cursor: { path: 'src/a.ts', side: 'head', line: 45 } })
 */
export const contextHtml = ({
    story,
    cursor,
}: {
    story: Story
    cursor: ContextCursor
}): string => {
    const changes = story.stops.flatMap((stop) => stop.changes)
    const under = changes.find(
        (change) =>
            change.path === cursor.path &&
            change.side === cursor.side &&
            change.start_line <= cursor.line &&
            cursor.line <= change.end_line
    )
    if (under !== undefined) {
        return page({
            title: TITLE,
            body: changeBody({ story, change: under }),
        })
    }
    const stop = story.stops.find((candidate) =>
        candidate.changes.some(({ path }) => path === cursor.path)
    )
    if (stop === undefined) return notInWalkHtml()
    const in_file = changes
        .filter(({ path }) => path === cursor.path)
        .map(({ start_line, title }) =>
            escapeHtml({ text: `line ${start_line}: ${title}` })
        )
    const body = [
        paragraph({ text: stop.why_here }),
        heading({ label: 'Changes in this file:' }),
        list({ items: in_file }),
    ].join('\n')
    return page({ title: TITLE, body })
}
