/**
 * Small builders for journal records shaped like the engine's
 * (`packages/engine/src/journal/journal-record.ts`), for the board's tests.
 * They are written here on purpose: the plugin never imports the engine.
 *
 * The builders live in one module per area, beside this file, and are
 * re-exported here, so a test imports them all from `journal-fixtures`:
 * the run, agents, the plan, the decision model, a ticket's work, stuck work
 * and replies, the final review, and memory. A new builder goes in the
 * module of its area; `journal-fixture-base.ts` holds what they share.
 */
export { stamp, type Entry } from './journal-fixture-base'
export * from './journal-fixtures-agents'
export * from './journal-fixtures-decisions'
export * from './journal-fixtures-final-review'
export * from './journal-fixtures-memory'
export * from './journal-fixtures-plan'
export * from './journal-fixtures-run'
export * from './journal-fixtures-stuck'
export * from './journal-fixtures-tickets'
