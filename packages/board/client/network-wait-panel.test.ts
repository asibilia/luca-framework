import { createElement } from 'react'

import { afterEach, describe, expect, test } from 'bun:test'

import { mockPanelQuery, panelQuery } from './testing/panel-query'
import {
    LAYOUT,
    THEME,
    render,
    textOf,
    type Screen,
} from './testing/render-native'

import { createHarness, type Harness } from '../server/testing/board-harness'
import {
    intakeRead,
    runBranchCreated,
    runStarted,
    specSnapshot,
    ticketSnapshot,
} from '../server/testing/journal-fixtures'

mockPanelQuery()

const { BoardPanel } = await import('./board-panel')

/**
 * The network wait on the panel (#701): while the engine waits for GitHub,
 * the run header says so, where a limit wait shows. The panel renders
 * through the stand-ins of `testing/render-native.ts`, from the board state
 * the plugin's server builds out of a fixture journal.
 */

let harness: Harness | null = null
let screen: Screen | null = null

afterEach(async () => {
    screen?.unmount()
    screen = null
    await harness?.cleanup()
    harness = null
})

describe('the network wait on the panel', () => {
    test('a run waiting for GitHub reads "Waiting for GitHub to be reachable"', async () => {
        harness = await createHarness()
        const { run_id, token } = await harness.start()
        await harness.send({
            run_id,
            token,
            entries: [
                runStarted({ spec: 10 }),
                intakeRead({ spec: 10 }),
                specSnapshot({
                    spec: 10,
                    title: 'Add CSV export',
                    order: [13],
                }),
                ticketSnapshot({ number: 13, title: 'Export rows' }),
                runBranchCreated({ branch: 'luca/run-10' }),
                {
                    kind: 'network_wait_started',
                    ticket: null,
                    role: null,
                    content: {
                        step: 'push_run_branch',
                        error: 'error connecting to api.github.com',
                    },
                },
            ],
        })
        const state = await harness.state()
        panelQuery.state = state

        screen = render(
            createElement(BoardPanel, {
                theme: THEME,
                layout: LAYOUT,
                workspaceId: 'workspace-1',
            } as never)
        )

        expect(state.run.status).toBe('network_wait')
        expect(
            screen
                .texts()
                .map(textOf)
                .some((text) =>
                    text.includes('Waiting for GitHub to be reachable')
                )
        ).toBe(true)
    })
})
