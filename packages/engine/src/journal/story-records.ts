/**
 * The records of the PR's story step (#743): the story-writer's agent
 * records and the story's own kinds. Replay keeps them out of the final
 * review's (they have `ticket: null` too); the story step reads them.
 */
import type { JournalRecord } from './journal-record'

/** The story's own record kinds. */
export const STORY_KINDS: ReadonlySet<JournalRecord['kind']> = new Set([
    'story_refused',
    'story_saved',
    'story_skipped',
])

/**
 * Whether a record is the story step's: one of the story's own kinds, or
 * a story-writer's agent turn record.
 *
 * @example
 * isStoryRecord({ kind: 'story_saved', ... }) // true
 */
export const isStoryRecord = (record: JournalRecord): boolean => {
    if (STORY_KINDS.has(record.kind)) return true
    switch (record.kind) {
        case 'agent_started':
        case 'agent_finished':
        case 'agent_failed':
        case 'agent_session':
            return record.content.role === 'story-writer'
        default:
            return false
    }
}
