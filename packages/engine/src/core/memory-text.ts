import type {
    MemorySave,
    RecallPoint,
    RecalledMemory,
} from '../memory/memory-schemas'

/**
 * Memory's texts (#370): the sections recalled memories add to an agent's
 * prompt, the PR's "New memories" section, and the spec comment that lists
 * them when there is no PR. Pure.
 */

/** The longest memory content a prompt shows, in characters. */
export const MEMORY_CONTENT_MAX = 600

/** The longest query the engine sends MuninnDB, in characters. */
export const QUERY_MAX = 2000

/** How much of a failure's text a fix round searches with: its end. */
export const FAILURE_QUERY_MAX = 1500

const HEADINGS: Record<RecallPoint, string> = {
    run_start: '## Memories from past runs',
    ticket: '## Memories from past runs for this ticket',
    review: '## Memories from past runs for this review',
    fix_round: '## Memories from past runs for this fix',
}

const clip = ({ text, max }: { text: string; max: number }): string => {
    const trimmed = text.trim()
    return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

/**
 * A query cut to `QUERY_MAX` characters from its start (a spec's or
 * ticket's text), or, with `tail`, to `FAILURE_QUERY_MAX` from its end (a
 * failure's, where the error usually is).
 *
 * @example
 * memoryQuery({ text: output, tail: true }) // the last 1500 characters
 */
export const memoryQuery = ({
    text,
    tail,
}: {
    text: string
    tail?: boolean
}): string => {
    const trimmed = text.trim()
    if (tail === true) return trimmed.slice(-FAILURE_QUERY_MAX).trim()
    return trimmed.slice(0, QUERY_MAX).trim()
}

/**
 * The prompt section of one recall point's memories: a heading, one line to
 * say how to use them, and `- [<vault>] <concept>: <content>` per memory
 * (content trimmed). No memories: no section (`null`).
 *
 * @example
 * memorySection({ point: 'ticket', memories })
 * // '## Memories from past runs for this ticket\n\n...\n\n- [default] pitfall:bun-junit: ...'
 */
export const memorySection = ({
    point,
    memories,
}: {
    point: RecallPoint
    memories: RecalledMemory[]
}): string | null =>
    memories.length === 0
        ? null
        : [
              HEADINGS[point],
              'Lessons earlier runs saved. Use them when they fit this work; they may be out of date.',
              memories
                  .map(
                      ({ vault, concept, content }) =>
                          `- [${vault}] ${concept}: ${clip({ text: content, max: MEMORY_CONTENT_MAX })}`
                  )
                  .join('\n'),
          ].join('\n\n')

/** The saves that added or updated a memory. */
export const newMemories = ({ saves }: { saves: MemorySave[] }): MemorySave[] =>
    saves.filter(({ outcome }) => outcome === 'added' || outcome === 'updated')

const memoryLines = ({ saves }: { saves: MemorySave[] }): string =>
    newMemories({ saves })
        .map(
            ({ type, vault, concept, id, outcome }) =>
                `- ${type} in \`${vault ?? '?'}\`: ${concept} (${id ?? 'no id'}), ${outcome}`
        )
        .join('\n')

/**
 * The PR's "New memories" section: each memory the learner added or
 * updated, with its type, vault, concept, and id. None: no section (`''`).
 *
 * @example
 * newMemoriesSection({ saves }) // '## New memories\n\n...\n\n- pitfall in `default`: pitfall:x (01J...), added'
 */
export const newMemoriesSection = ({
    saves,
}: {
    saves: MemorySave[]
}): string =>
    newMemories({ saves }).length === 0
        ? ''
        : [
              '## New memories',
              'Lessons the learner saved from this run for future runs. Please check them; a wrong one misleads later runs.',
              memoryLines({ saves }),
          ].join('\n\n')

/**
 * The spec comment that lists the new memories when the run ends with no
 * PR (stopped, or every ticket skipped).
 *
 * @example
 * memoriesComment({ spec_number: 10, saves })
 */
export const memoriesComment = ({
    spec_number,
    saves,
}: {
    spec_number: number
    saves: MemorySave[]
}): string =>
    [
        `Luca's learner saved these memories from this run of spec #${spec_number}. The run opened no PR, so they are listed here. Please check them; a wrong one misleads later runs.`,
        memoryLines({ saves }),
    ].join('\n\n')
