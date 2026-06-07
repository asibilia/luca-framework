import { atomWithStorage } from 'jotai/utils'

/**
 * Theme preference atom persisted in localStorage.
 *
 * Stores "dark" or "light" under the key "luca-studio-theme".
 * Defaults to "dark" on first visit.
 */
export const themeAtom = atomWithStorage<'dark' | 'light'>(
    'luca-studio-theme',
    'dark'
)
