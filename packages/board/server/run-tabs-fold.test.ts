import { describe, expect, test } from 'bun:test'

import {
    foldRuns,
    RECENT_RUN_TABS,
    type RunSummary,
} from '../shared/board-state'

/**
 * The run tabs (#412): the side panel gives the newest runs a tab and folds
 * the older ones away, so the tabs don't grow with every run.
 */

/** `count` runs, newest first, as `board.read` lists them. */
const runsNewestFirst = ({ count }: { count: number }): RunSummary[] =>
    Array.from({ length: count }, (_, index) => ({
        run_id: `run-${String(count - index).padStart(3, '0')}`,
        spec_number: 400 + index,
        spec_title: null,
        demo: false,
        status: 'done',
        started_at: new Date(
            Date.parse('2026-09-25T12:00:00.000Z') - index * 60_000
        ).toISOString(),
        needs_you: 0,
    }))

const ids = (runs: RunSummary[]) => runs.map((run) => run.run_id)

describe('the run tabs', () => {
    test('only the newest runs get a tab and the older ones are folded', () => {
        const runs = runsNewestFirst({ count: RECENT_RUN_TABS + 7 })

        const { shown, folded } = foldRuns({ runs, selected: null })

        expect(ids(shown)).toEqual(ids(runs.slice(0, RECENT_RUN_TABS)))
        expect(ids(folded)).toEqual(ids(runs.slice(RECENT_RUN_TABS)))
    })

    test('a handful of runs keeps a tab each with none folded', () => {
        const runs = runsNewestFirst({ count: 2 })

        const { shown, folded } = foldRuns({ runs, selected: null })

        expect(ids(shown)).toEqual(ids(runs))
        expect(folded).toEqual([])
    })

    test('the number of tabs is capped at a few runs', () => {
        expect(RECENT_RUN_TABS).toBeGreaterThan(1)
        expect(RECENT_RUN_TABS).toBeLessThan(20)
    })

    test('a picked older run keeps its tab and no run is lost', () => {
        const runs = runsNewestFirst({ count: RECENT_RUN_TABS + 7 })
        const old = runs.at(-1)?.run_id ?? ''

        const { shown, folded } = foldRuns({ runs, selected: old })

        expect(ids(shown)).toContain(old)
        expect(ids(folded)).not.toContain(old)
        expect(shown.length).toBeLessThanOrEqual(RECENT_RUN_TABS + 1)
        expect([...ids(shown), ...ids(folded)].toSorted()).toEqual(
            ids(runs).toSorted()
        )
    })
})
