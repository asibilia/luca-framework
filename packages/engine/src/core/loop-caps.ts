/**
 * The caps of every **fix loop**, shared by the ticket steps
 * (`decide-build.ts`) and the final review (`decide-final-review.ts`).
 */

/**
 * Follow-ups an agent gets to fix a failed red check or failed gates, after
 * its first try. A failure after the last follow-up makes the ticket stuck.
 * Also the cap on review fix rounds and on failed tries per role.
 */
export const MAX_FIX_ROUNDS = 3

/**
 * Times an implementer may send a test back as bad, each to a fresh
 * test-writer. The bounce after these makes the ticket stuck.
 */
export const MAX_BAD_TEST_BOUNCES = 1

/**
 * Engine failures in a row (the SDK crashed, or a follow-up's session was
 * gone) after which a ticket is stuck. Each one before it starts a fresh
 * agent without using up a try.
 */
export const MAX_ENGINE_FAILURES = 3

/**
 * Times a joined ticket may be sent back onto the run branch, after a clash
 * or failed gates after joining. The clash or failed join after these makes
 * the ticket stuck.
 */
export const MAX_REJOINS = MAX_FIX_ROUNDS
