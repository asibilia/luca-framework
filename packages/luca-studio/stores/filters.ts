import { atom } from 'jotai'

/**
 * Active event type filter for the event feed.
 * Empty array = show all event types.
 */
export const eventTypeFilterAtom = atom<string[]>([])

/**
 * Search query for filtering events.
 */
export const searchQueryAtom = atom('')
