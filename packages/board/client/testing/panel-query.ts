import * as reactQuery from '@tanstack/react-query'
import { afterAll, mock } from 'bun:test'

/** React-query as it was before any mock, for the tests that use it whole. */
const REAL = { ...reactQuery }

/**
 * The board state the whole panel shows in a test. The panel reads
 * `board.read` with react-query, which this stands in for with the state a
 * test built; every test file that renders the whole `BoardPanel` sets
 * `panelQuery.state` and calls `mockPanelQuery()` before importing it.
 * The mock lasts the whole test process, so with no state set (and after
 * the file that set it) `useQuery` is react-query's own again.
 */
export const panelQuery: { state: unknown } = { state: null }

export const mockPanelQuery = () => {
    mock.module('@tanstack/react-query', () => ({
        ...REAL,
        useQuery: (...args: Parameters<typeof REAL.useQuery>) =>
            panelQuery.state === null
                ? REAL.useQuery(...args)
                : {
                      data: {
                          selected: panelQuery.state,
                          runs: [],
                          posted: [],
                          chat_agent_id: null,
                      },
                      isError: false,
                      isPending: false,
                      error: null,
                  },
    }))
    afterAll(() => {
        panelQuery.state = null
    })
}
