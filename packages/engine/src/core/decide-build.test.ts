import { describe, expect, test } from 'bun:test'

import { decide } from './decide'

import { intakePassed, practiceTicket } from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

const TICKET = practiceTicket({ number: 11 })

describe('decision step: building a ticket', () => {
    test('once intake passes, the run branch is made from the base branch', () => {
        const records = recordsFrom({
            entries: intakePassed({ tickets: [TICKET] }),
        })

        expect(decide({ records })).toEqual({
            type: 'create_run_branch',
            spec_number: 10,
            base_branch: 'main',
        })
    })
})
