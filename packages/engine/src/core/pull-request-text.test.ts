import { describe, expect, test } from 'bun:test'

import { withNotInRun } from './pull-request-text'

/**
 * Before the PR opens, the engine re-reads the spec's sub-issues. The open
 * ones that are not in the run (#484), such as one reopened while the run
 * went, or one closed at intake and reopened since, are named in the PR.
 */

const BODY = [
    'Built by the Luca engine from spec #10.',
    '## Tickets\n\n- Closes #11: Add sum',
    '## Assumptions\n\nCalls agents made by themselves. Please check them.\n\n- #11: Numbers are integers.',
].join('\n\n')

describe('the PR names open tickets that are not in the run', () => {
    test('they go right after the tickets, under "Not in this run", with number and title', () => {
        expect(
            withNotInRun({
                body: BODY,
                open: [
                    { number: 13, title: 'Add the menu item' },
                    { number: 14, title: 'Export rows' },
                ],
            })
        ).toBe(
            [
                'Built by the Luca engine from spec #10.',
                '## Tickets\n\n- Closes #11: Add sum',
                "## Not in this run\n\nOpen tickets of the spec that this run didn't build. This PR doesn't close them.\n\n- #13 Add the menu item\n- #14 Export rows",
                '## Assumptions\n\nCalls agents made by themselves. Please check them.\n\n- #11: Numbers are integers.',
            ].join('\n\n')
        )
    })

    test('with none, the body stays as it is', () => {
        expect(withNotInRun({ body: BODY, open: [] })).toBe(BODY)
    })

    test('a body with nothing after its tickets gets the section at the end', () => {
        const body = 'Built.\n\n## Tickets\n\n- Closes #11: Add sum'
        expect(
            withNotInRun({ body, open: [{ number: 13, title: 'Menu' }] })
        ).toBe(
            `${body}\n\n## Not in this run\n\nOpen tickets of the spec that this run didn't build. This PR doesn't close them.\n\n- #13 Menu`
        )
    })
})
