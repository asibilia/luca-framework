import { atom } from "jotai";

/**
 * Currently selected session ID for filtering.
 * null = show all sessions.
 */
export const selectedSessionAtom = atom<string | null>(null);
