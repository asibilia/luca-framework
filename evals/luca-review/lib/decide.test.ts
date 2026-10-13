import { describe, expect, test } from 'bun:test'

import type { Row, TriggerResult } from './case-schema'
import {
    caseArmStats,
    decide,
    decideTriggers,
    reportText,
    runValidity,
} from './decide'

const row = (over: Partial<Row>): Row => ({
    case_id: '4-planted-bug',
    arm: 'A',
    rep: 1,
    invalid_reason: null,
    caught: 1,
    false_blockers: 0,
    leaks: 0,
    cost_units: 1000,
    wall_ms: 600_000,
    claude_code_version: '2.1.296',
    ...over,
})

/** A, B and C on one case; B and C can be changed. */
const trio = (b: Partial<Row>, c: Partial<Row>): Row[] => [
    row({ arm: 'A', caught: 0.5 }),
    row({ arm: 'B', caught: 0.5, ...b }),
    row({ arm: 'C', caught: 0, ...c }),
]

describe('runValidity', () => {
    const ok = {
        session_id: 's',
        skills: ['luca-review'],
        skill_name: 'luca-review',
        other_names: ['agent-review'],
        cost_units: 10,
    }
    test('a run with its own skill, no other, and transcripts is valid', () => {
        expect(runValidity(ok)).toBeNull()
    })
    test('no session', () => {
        expect(runValidity({ ...ok, session_id: null })).toContain('no session')
    })
    test('its skill did not load', () => {
        expect(runValidity({ ...ok, skills: [] })).toContain('did not load')
    })
    test("another setup's skill loaded", () => {
        expect(
            runValidity({ ...ok, skills: ['luca-review', 'agent-review'] })
        ).toContain('agent-review')
    })
    test('no transcripts, so no cost', () => {
        expect(runValidity({ ...ok, cost_units: 0 })).toContain(
            'no transcripts'
        )
    })
})

describe('caseArmStats', () => {
    test('averages valid, graded runs per case and setup', () => {
        const stats = caseArmStats({
            rows: [
                row({ caught: 1, cost_units: 1000 }),
                row({ rep: 2, caught: 0, cost_units: 3000 }),
                row({ rep: 3, invalid_reason: 'skill did not load' }),
                row({ rep: 4, caught: null, false_blockers: null }),
            ],
        })
        expect(stats).toEqual([
            {
                case_id: '4-planted-bug',
                arm: 'A',
                runs: 2,
                caught: 0.5,
                false_blockers: 0,
                leaks: 0,
                cost_units: 2000,
                wall_ms: 600_000,
            },
        ])
    })
})

describe('decide', () => {
    test('B ships when it ties A', () => {
        expect(decide({ rows: trio({}, {}) })).toEqual({
            ships: true,
            reasons: [],
            too_easy: [],
            disagree: [],
        })
    })

    test('B does not ship when it catches less', () => {
        const decision = decide({ rows: trio({ caught: 0 }, {}) })
        expect(decision.ships).toBe(false)
        expect(decision.reasons[0]).toContain('B caught less than A')
        expect(decision.disagree).toEqual(['4-planted-bug'])
    })

    test('nor with more false blockers, or more leaks', () => {
        expect(
            decide({ rows: trio({ false_blockers: 1 }, {}) }).reasons[0]
        ).toContain('false blockers')
        expect(decide({ rows: trio({ leaks: 1 }, {}) }).reasons[0]).toContain(
            'leaked'
        )
    })

    test('cost and time may be up to 1.25 times A, not more', () => {
        expect(
            decide({ rows: trio({ cost_units: 1250, wall_ms: 750_000 }, {}) })
                .ships
        ).toBe(true)
        expect(
            decide({ rows: trio({ cost_units: 1251 }, {}) }).reasons[0]
        ).toContain('cost more')
        expect(
            decide({ rows: trio({ wall_ms: 750_001 }, {}) }).reasons[0]
        ).toContain('took more')
    })

    test('a case C does as well on is too easy, and not counted for catches', () => {
        const decision = decide({
            rows: [
                ...trio({ caught: 0 }, { caught: 1 }),
                ...trio({}, {}).map((r) => ({
                    ...r,
                    case_id: '5-clean-change',
                })),
            ],
        })
        expect(decision.too_easy).toEqual(['4-planted-bug'])
        expect(decision.ships).toBe(true)
    })

    test('every case too easy, or a missing setup, means no decision', () => {
        expect(decide({ rows: trio({}, { caught: 1 }) }).reasons).toContain(
            'every case was too easy to tell the setups apart'
        )
        expect(decide({ rows: [row({ arm: 'A' })] }).reasons[0]).toContain(
            'no graded runs of A or of B'
        )
    })
})

const trigger = (over: Partial<TriggerResult>): TriggerResult => ({
    prompt: 'Check what the agent says it did.',
    should_trigger: true,
    triggered: true,
    invalid_reason: null,
    ...over,
})

describe('decideTriggers', () => {
    test('B passes with as many hits and no more false hits than A', () => {
        const a = [
            trigger({}),
            trigger({ should_trigger: false, triggered: false }),
        ]
        expect(decideTriggers({ a, b: a }).passes).toBe(true)
        const fewer = [trigger({ triggered: false }), a[1] ?? trigger({})]
        expect(decideTriggers({ a, b: fewer }).passes).toBe(false)
        const noisier = [trigger({}), trigger({ should_trigger: false })]
        expect(decideTriggers({ a, b: noisier }).reasons[0]).toContain(
            'should not'
        )
    })
})

describe('reportText', () => {
    test('has the table, the decision, and the runs left out', () => {
        const text = reportText({
            round: 'r1',
            rows: [
                ...trio({}, {}),
                row({
                    arm: 'B',
                    rep: 2,
                    invalid_reason: 'the luca-review skill did not load',
                }),
            ],
            triggers: null,
        })
        expect(text).toContain('# luca-review eval: round r1')
        expect(text).toContain(
            '| Case | Setup | Runs | Caught | False blockers | Leaks | Cost units | Minutes |'
        )
        expect(text).toContain('**B ships.**')
        expect(text).toContain('4B2: the luca-review skill did not load')
        expect(text).toContain('No trigger test in this round.')
    })
})
