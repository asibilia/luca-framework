import { describe, expect, test } from 'bun:test'

import { decideSteps } from './decide'
import type { EngineAction } from './decide'
import { MAX_FIX_ROUNDS } from './decide-build'
import { CRASH_SECTION } from './fix-loop-text'

import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import { resumeEntry } from '../journal/step-records'
import {
    agentFailed,
    agentStarted,
    baselineTests,
    billingStopped,
    commitMade,
    commentRead,
    finding,
    gatesRun,
    implemented,
    intakePassed,
    leftoverScan,
    practiceTicket,
    pullRequestOpened,
    redCheck,
    replyReceived,
    reviewed,
    runBranchCreated,
    SESSIONS,
    stepStarted,
    stuckReported,
    testsWritten,
    ticketBuilt,
    ticketPath,
    ticketSkipped,
    ticketStuck,
    ticketWorktreeCreated,
    withInstalls,
    worktreesRemoved,
    RUN_BRANCH_PATH,
} from '../testing/build-fixtures'
import {
    finalReviewClean,
    finalReviewShipped,
    finalReviewStuck,
    lensRound,
} from '../testing/final-review-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'
import {
    intakePassedWithMemory,
    learnerFailed,
    learnerFinished,
    learnerStarted,
    learningSkipped,
    memoriesSaved,
    memoryRecalled,
    memorySave,
    PROJECT_VAULT,
    proposedMemory,
    recalledMemory,
} from '../testing/memory-fixtures'

/**
 * Seam 1 for memory (#370): the recall points, the learner at the end of
 * every run that ran agents, the saves' routing, and the listing of new
 * memories, all through the decision step.
 */

const SUM = practiceTicket({ number: 11, title: 'Add sum' })
const PRODUCT = practiceTicket({ number: 12, title: 'Add product' })

/** The run's start search, with one memory. */
const START_MEMORY = recalledMemory({ id: 'start-1', vault: PROJECT_VAULT })

const startRecalled = (): JournalEntry =>
    memoryRecalled({ point: 'run_start', memories: [START_MEMORY] })

/** A proposed memory the learner marked with this scope. */
const scoped = ({
    type,
    concept,
    scope,
}: {
    type: string
    concept: string
    scope: string
}) => ({ ...proposedMemory({ type, concept }), scope })

const steps = ({
    tickets,
    entries,
    memory,
}: {
    tickets?: TicketSnapshot[]
    entries: JournalEntry[]
    /** Defaults to on. */
    memory?: boolean
}): EngineAction[] => {
    const list = tickets ?? [SUM]
    return decideSteps({
        records: recordsFrom({
            entries: [
                ...(memory === false
                    ? intakePassed({ tickets: list })
                    : intakePassedWithMemory({ tickets: list })),
                ...withInstalls({ entries }),
            ],
        }),
    })
}

/** #11 up to its baseline: its test-writer is next. */
const ticketStarted = (ticket: number): JournalEntry[] => [
    ticketWorktreeCreated({ ticket }),
    baselineTests({ ticket }),
]

const promptOf = (action: EngineAction | undefined): string => {
    if (action === undefined) return ''
    if ('prompt' in action) return action.prompt
    if ('message' in action) return action.message
    return ''
}

describe('memory off', () => {
    test('a run without memory searches nothing and runs no learner', () => {
        expect(steps({ memory: false, entries: [] })).toEqual([
            {
                type: 'create_run_branch',
                spec_number: 10,
                base_branch: 'main',
            },
        ])
        const toPr = steps({
            memory: false,
            entries: [
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }),
                ...finalReviewClean(),
            ],
        })
        expect(toPr.map(({ type }) => type)).toEqual(['open_pull_request'])
        expect(
            promptOf(
                steps({
                    memory: false,
                    entries: [runBranchCreated(), ...ticketStarted(11)],
                })[0]
            )
        ).not.toContain('Memories')
    })
})

describe('recall points', () => {
    test('the run start searches with the spec, alone, before the run branch', () => {
        expect(steps({ entries: [] })).toEqual([
            {
                type: 'recall_memories',
                point: 'run_start',
                ticket: null,
                key: 'run_start',
                query: 'Practice spec\n\n## Testing Decisions\n\n- Test the sum.',
            },
        ])
        expect(steps({ entries: [startRecalled()] })).toEqual([
            {
                type: 'create_run_branch',
                spec_number: 10,
                base_branch: 'main',
            },
        ])
    })

    test("before a ticket's first test-writer, a search with the ticket's text", () => {
        expect(
            steps({
                entries: [
                    startRecalled(),
                    runBranchCreated(),
                    ...ticketStarted(11),
                ],
            })
        ).toEqual([
            {
                type: 'recall_memories',
                point: 'ticket',
                ticket: 11,
                key: 'ticket:11',
                query: 'Add sum\n\n## What to build\n\nA sum function.',
            },
        ])
    })

    test("each ticket searches beside the others', so tickets still search at the same time", () => {
        const both = steps({
            tickets: [SUM, PRODUCT],
            entries: [
                startRecalled(),
                runBranchCreated(),
                ...ticketStarted(11),
                ...ticketStarted(12),
            ],
        })
        expect(
            both.map((action) =>
                action.type === 'recall_memories' ? action.key : action.type
            )
        ).toEqual(['ticket:11', 'ticket:12'])
    })

    test("the run start's memories go at the very top of a fresh agent's prompt, the ticket's at its end, and none twice", () => {
        const [launch] = steps({
            entries: [
                startRecalled(),
                runBranchCreated(),
                ...ticketStarted(11),
                memoryRecalled({
                    point: 'ticket',
                    key: 'ticket:11',
                    ticket: 11,
                    memories: [
                        START_MEMORY,
                        recalledMemory({
                            id: 'sum-1',
                            concept: 'pattern:sum-reduce',
                        }),
                    ],
                }),
            ],
        })
        expect(launch).toMatchObject({
            type: 'launch_agent',
            role: 'test-writer',
        })
        const prompt = promptOf(launch)
        expect(prompt.startsWith('## Memories from past runs\n')).toBe(true)
        expect(prompt).toContain(
            `- [${PROJECT_VAULT}] pitfall:start-1: The lesson of start-1.`
        )
        expect(prompt).toContain('## Memories from past runs for this ticket')
        expect(
            prompt
                .trimEnd()
                .endsWith(
                    '- [default] pattern:sum-reduce: The lesson of sum-1.'
                )
        ).toBe(true)
        expect(prompt.split('pitfall:start-1').length).toBe(2)
        expect(prompt.indexOf('# Your role: test-writer')).toBeGreaterThan(
            prompt.indexOf('pitfall:start-1')
        )
    })

    test('the implementer gets the same ticket memories without a new search', () => {
        const [launch] = steps({
            entries: [
                startRecalled(),
                runBranchCreated(),
                ...ticketStarted(11),
                memoryRecalled({
                    point: 'ticket',
                    key: 'ticket:11',
                    ticket: 11,
                    memories: [recalledMemory({ id: 'sum-1' })],
                }),
                agentStarted({ ticket: 11, role: 'test-writer' }),
                testsWritten({ ticket: 11 }),
                redCheck({ ticket: 11, ok: true }),
                leftoverScan({ ticket: 11, stage: 'red' }),
                commitMade({ ticket: 11, stage: 'red' }),
            ],
        })
        expect(launch).toMatchObject({
            type: 'launch_agent',
            role: 'implementer',
        })
        expect(promptOf(launch)).toContain('pitfall:sum-1')
    })

    const greenCommitted = (): JournalEntry[] => [
        startRecalled(),
        runBranchCreated(),
        ...ticketStarted(11),
        memoryRecalled({ point: 'ticket', key: 'ticket:11', ticket: 11 }),
        testsWritten({ ticket: 11 }),
        redCheck({ ticket: 11, ok: true }),
        leftoverScan({ ticket: 11, stage: 'red' }),
        commitMade({ ticket: 11, stage: 'red', files: ['src/sum.test.ts'] }),
        implemented({ ticket: 11 }),
        gatesRun({ ticket: 11, target: 'ticket', ok: true }),
        leftoverScan({ ticket: 11, stage: 'green' }),
        commitMade({ ticket: 11, stage: 'green', files: ['src/sum.ts'] }),
    ]

    test('before each ticket review, a search with the title and the files it changed', () => {
        expect(steps({ entries: greenCommitted() })).toEqual([
            {
                type: 'recall_memories',
                point: 'review',
                ticket: 11,
                key: 'review:11:green-sha',
                query: 'Add sum\n\nFiles changed:\nsrc/sum.test.ts\nsrc/sum.ts',
            },
        ])
        const [launch] = steps({
            entries: [
                ...greenCommitted(),
                memoryRecalled({
                    point: 'review',
                    key: 'review:11:green-sha',
                    ticket: 11,
                    memories: [recalledMemory({ id: 'rev-1' })],
                }),
            ],
        })
        expect(launch).toMatchObject({
            type: 'launch_agent',
            role: 'ticket-reviewer',
        })
        expect(promptOf(launch)).toContain(
            '## Memories from past runs for this review'
        )
        expect(promptOf(launch)).toContain('pitfall:rev-1')
    })

    test('a re-review after a fix round searches again, with the fix commit', () => {
        const refixed = [
            ...greenCommitted(),
            memoryRecalled({
                point: 'review',
                key: 'review:11:green-sha',
                ticket: 11,
            }),
            reviewed({ ticket: 11, findings: [finding({ id: 'R1-1' })] }),
            memoryRecalled({
                point: 'fix_round',
                key: 'fix_round:11:review:22',
                ticket: 11,
            }),
            agentStarted({
                ticket: 11,
                role: 'implementer',
                follow_up_of: SESSIONS.implementer,
            }),
            implemented({
                ticket: 11,
                finding_responses: [
                    { finding_id: 'R1-1', response: 'fixed', reason: '' },
                ],
            }),
            gatesRun({ ticket: 11, target: 'ticket', ok: true }),
            leftoverScan({ ticket: 11, stage: 'fix' }),
            commitMade({ ticket: 11, stage: 'fix', files: ['src/sum.ts'] }),
        ]
        expect(steps({ entries: refixed })).toEqual([
            expect.objectContaining({
                type: 'recall_memories',
                point: 'review',
                key: 'review:11:fix-sha',
                query: 'Add sum\n\nFiles changed:\nsrc/sum.ts',
            }),
        ])
    })

    test("a review fix round searches with the findings, and its memories go in the implementer's follow-up", () => {
        const reviewedWithFinding = [
            ...greenCommitted(),
            memoryRecalled({
                point: 'review',
                key: 'review:11:green-sha',
                ticket: 11,
            }),
            reviewed({
                ticket: 11,
                findings: [finding({ id: 'R1-1', title: 'Sum ignores NaN' })],
            }),
        ]
        const [search] = steps({ entries: reviewedWithFinding })
        expect(search).toMatchObject({
            type: 'recall_memories',
            point: 'fix_round',
            ticket: 11,
        })
        const key = search?.type === 'recall_memories' ? search.key : ''
        expect(key).toMatch(/^fix_round:11:review:\d+$/)
        expect(
            search?.type === 'recall_memories' ? search.query : ''
        ).toContain('Sum ignores NaN')
        const [followUp] = steps({
            entries: [
                ...reviewedWithFinding,
                memoryRecalled({
                    point: 'fix_round',
                    key,
                    ticket: 11,
                    memories: [recalledMemory({ id: 'nan-1' })],
                }),
            ],
        })
        expect(followUp).toMatchObject({
            type: 'follow_up_agent',
            role: 'implementer',
        })
        expect(promptOf(followUp)).toContain(
            '## Memories from past runs for this fix'
        )
        expect(promptOf(followUp)).toContain('pitfall:nan-1')
        // A follow-up is in its session already: no run-start memories again.
        expect(promptOf(followUp)).not.toContain('pitfall:start-1')
    })

    const redFailed = (): JournalEntry[] => [
        startRecalled(),
        runBranchCreated(),
        ...ticketStarted(11),
        memoryRecalled({ point: 'ticket', key: 'ticket:11', ticket: 11 }),
        agentStarted({ ticket: 11, role: 'test-writer' }),
        testsWritten({ ticket: 11 }),
        redCheck({ ticket: 11, ok: false }),
    ]

    test('a failed red check searches with its failure text before the fix round', () => {
        const [search] = steps({ entries: redFailed() })
        expect(search).toMatchObject({
            type: 'recall_memories',
            point: 'fix_round',
            ticket: 11,
        })
        const key = search?.type === 'recall_memories' ? search.key : ''
        expect(key).toMatch(/^fix_round:11:red:\d+$/)
        expect(
            search?.type === 'recall_memories' ? search.query : ''
        ).toContain('passes already')
        const [followUp] = steps({
            entries: [
                ...redFailed(),
                memoryRecalled({
                    point: 'fix_round',
                    key,
                    ticket: 11,
                    memories: [recalledMemory({ id: 'red-1' })],
                }),
            ],
        })
        expect(followUp).toMatchObject({
            type: 'follow_up_agent',
            role: 'test-writer',
        })
        expect(promptOf(followUp).startsWith('The red check failed.')).toBe(
            true
        )
        expect(promptOf(followUp)).toContain('pitfall:red-1')
    })

    test('a fresh test-writer taking a red check follow-up a crash cut off gets the fix round memories', () => {
        const [search] = steps({ entries: redFailed() })
        const key = search?.type === 'recall_memories' ? search.key : ''
        const cutOff = [
            ...redFailed(),
            memoryRecalled({
                point: 'fix_round',
                key,
                ticket: 11,
                memories: [recalledMemory({ id: 'red-1' })],
            }),
            stepStarted({
                ticket: 11,
                step: 'follow_up_agent:test-writer',
                role: 'test-writer',
            }),
        ]
        const resumed = resumeEntry({
            records: recordsFrom({
                entries: [
                    ...intakePassedWithMemory({ tickets: [SUM] }),
                    ...withInstalls({ entries: cutOff }),
                ],
            }),
        })
        expect(resumed).not.toBeNull()
        const [fresh] = steps({
            entries: [...cutOff, ...(resumed === null ? [] : [resumed])],
        })
        expect(fresh).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
        })
        expect(promptOf(fresh)).toContain('The red check failed.')
        expect(promptOf(fresh)).toContain(CRASH_SECTION)
        expect(promptOf(fresh)).toContain('pitfall:red-1')
        expect(promptOf(fresh)).toContain('pitfall:start-1')
    })

    test('failed gates search with their output; each fix round searches afresh', () => {
        const gatesFailed = [
            ...redFailed().slice(0, -1),
            redCheck({ ticket: 11, ok: true }),
            leftoverScan({ ticket: 11, stage: 'red' }),
            commitMade({ ticket: 11, stage: 'red' }),
            implemented({ ticket: 11 }),
            gatesRun({ ticket: 11, target: 'ticket', ok: false }),
        ]
        const [first] = steps({ entries: gatesFailed })
        expect(first).toMatchObject({
            type: 'recall_memories',
            point: 'fix_round',
            query: 'test failed:\n1 fail',
        })
        const firstKey = first?.type === 'recall_memories' ? first.key : ''
        const again = [
            ...gatesFailed,
            memoryRecalled({ point: 'fix_round', key: firstKey, ticket: 11 }),
            agentStarted({
                ticket: 11,
                role: 'implementer',
                follow_up_of: SESSIONS.implementer,
            }),
            implemented({ ticket: 11 }),
            gatesRun({ ticket: 11, target: 'ticket', ok: false }),
        ]
        const [second] = steps({ entries: again })
        expect(second).toMatchObject({
            type: 'recall_memories',
            point: 'fix_round',
        })
        expect(second?.type === 'recall_memories' ? second.key : '').not.toBe(
            firstKey
        )
    })

    test('a failed try is no fix round: its follow-up searches nothing', () => {
        const [followUp] = steps({
            entries: [
                ...redFailed().slice(0, -2),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'result',
                }),
            ],
        })
        expect(followUp).toMatchObject({
            type: 'follow_up_agent',
            role: 'test-writer',
        })
        expect(promptOf(followUp)).not.toContain('Memories')
    })

    test('the final review searches once for all five lenses, with the spec and the files', () => {
        const built = [
            startRecalled(),
            runBranchCreated(),
            ...ticketBuilt({ ticket: 11 }),
            lensRound({ round: 1 })[0] as JournalEntry,
        ]
        expect(steps({ entries: built })).toEqual([
            {
                type: 'recall_memories',
                point: 'review',
                ticket: null,
                key: 'review:final:g1',
                query: 'Practice spec\n\nFiles changed:\nsrc/sum.test.ts\nsrc/sum.ts',
            },
        ])
        const lenses = steps({
            entries: [
                ...built,
                memoryRecalled({
                    point: 'review',
                    key: 'review:final:g1',
                    memories: [recalledMemory({ id: 'lens-1' })],
                }),
            ],
        })
        expect(lenses.map(({ type }) => type)).toEqual(
            Array(5).fill('launch_lens')
        )
        for (const lens of lenses) {
            expect(
                promptOf(lens).startsWith('## Memories from past runs\n')
            ).toBe(true)
            expect(promptOf(lens)).toContain('pitfall:lens-1')
        }
    })
})

describe('the learner', () => {
    const passed = (): JournalEntry[] => [
        startRecalled(),
        runBranchCreated(),
        ...ticketBuilt({ ticket: 11 }),
        ...finalReviewClean(),
    ]

    test('once the final review passed, the learner runs before the PR, with a digest of the journal', () => {
        const [learner] = steps({ entries: passed() })
        expect(learner).toMatchObject({ type: 'launch_learner' })
        const prompt = promptOf(learner)
        expect(prompt).toContain('# Your role: learner')
        expect(prompt).toContain('## Spec #10: Practice spec')
        expect(prompt).toContain('The final review passed')
        expect(prompt).toContain('## Memories shown during this run')
        expect(prompt).toContain(
            `- id start-1 [${PROJECT_VAULT}] pitfall:start-1: The lesson of start-1.`
        )
    })

    test("the learner's prompt asks for each memory's scope: this repo only, or useful anywhere", () => {
        const prompt = promptOf(steps({ entries: passed() })[0])
        expect(prompt).toContain('scope')
        expect(prompt).toContain('repo')
        expect(prompt).toContain('anywhere')
    })

    test("the learner's memories are routed by type, unknown types refused, and feedback set for every shown memory", () => {
        const [save] = steps({
            entries: [
                ...passed(),
                learnerStarted(),
                learnerFinished({
                    memories: [
                        scoped({
                            type: 'pitfall',
                            concept: 'bun-junit',
                            scope: 'anywhere',
                        }),
                        scoped({
                            type: 'decision',
                            concept: 'engine-only-memory',
                            scope: 'repo',
                        }),
                        scoped({
                            type: 'session',
                            concept: 'today',
                            scope: 'anywhere',
                        }),
                    ],
                    helped: ['start-1', 'never-shown'],
                }),
            ],
        })
        expect(save).toMatchObject({
            type: 'save_memories',
            saves: [
                {
                    type: 'pitfall',
                    vault: 'default',
                    concept: 'pitfall:bun-junit',
                    tags: ['luca', 'spec-10'],
                },
                {
                    type: 'decision',
                    vault: PROJECT_VAULT,
                    concept: 'decision:engine-only-memory',
                },
            ],
            refused: [
                {
                    type: 'session',
                    concept: 'today',
                    reason: expect.stringContaining('Unknown memory type'),
                },
            ],
            feedback: [{ id: 'start-1', vault: PROJECT_VAULT, useful: true }],
        })
        const opIds =
            save?.type === 'save_memories'
                ? save.saves.map(({ op_id }) => op_id)
                : []
        expect(new Set(opIds).size).toBe(2)
    })

    test("the learner's memories are routed by scope: repo-only to the project vault, useful anywhere to default, and a decision to the project vault whatever its scope", () => {
        const [save] = steps({
            entries: [
                ...passed(),
                learnerStarted(),
                learnerFinished({
                    memories: [
                        scoped({
                            type: 'pitfall',
                            concept: 'engine-readme-guard-docs',
                            scope: 'repo',
                        }),
                        scoped({
                            type: 'pattern',
                            concept: 'object-args',
                            scope: 'anywhere',
                        }),
                        scoped({
                            type: 'procedure',
                            concept: 'luca-run',
                            scope: 'repo',
                        }),
                        scoped({
                            type: 'decision',
                            concept: 'markers',
                            scope: 'anywhere',
                        }),
                    ],
                }),
            ],
        })
        expect(save).toMatchObject({ type: 'save_memories', refused: [] })
        expect(
            save?.type === 'save_memories'
                ? save.saves.map(({ concept, vault }) => ({ concept, vault }))
                : []
        ).toEqual([
            {
                concept: 'pitfall:engine-readme-guard-docs',
                vault: PROJECT_VAULT,
            },
            { concept: 'pattern:object-args', vault: 'default' },
            { concept: 'procedure:luca-run', vault: PROJECT_VAULT },
            { concept: 'decision:markers', vault: PROJECT_VAULT },
        ])
    })

    test('a memory with a missing or unknown scope is refused with the reason, never saved to a guessed vault', () => {
        const [save] = steps({
            entries: [
                ...passed(),
                learnerStarted(),
                learnerFinished({
                    memories: [
                        proposedMemory({
                            type: 'pitfall',
                            concept: 'no-scope',
                        }),
                        scoped({
                            type: 'pattern',
                            concept: 'odd-scope',
                            scope: 'everywhere',
                        }),
                        scoped({
                            type: 'pitfall',
                            concept: 'fine',
                            scope: 'anywhere',
                        }),
                    ],
                }),
            ],
        })
        expect(save).toMatchObject({
            type: 'save_memories',
            saves: [{ concept: 'pitfall:fine', vault: 'default' }],
            refused: [
                {
                    type: 'pitfall',
                    concept: 'no-scope',
                    reason: expect.stringContaining('scope'),
                },
                {
                    type: 'pattern',
                    concept: 'odd-scope',
                    reason: expect.stringContaining('"everywhere"'),
                },
            ],
        })
        expect(save?.type === 'save_memories' ? save.saves : []).toHaveLength(1)
    })

    test('a repo-only memory is refused when the run has no project vault', () => {
        const [save] = decideSteps({
            records: recordsFrom({
                entries: [
                    ...intakePassedWithMemory({
                        tickets: [SUM],
                        project_vault: null,
                    }),
                    ...withInstalls({
                        entries: [
                            ...passed(),
                            learnerStarted(),
                            learnerFinished({
                                memories: [
                                    scoped({
                                        type: 'pitfall',
                                        concept: 'only-here',
                                        scope: 'repo',
                                    }),
                                    scoped({
                                        type: 'pitfall',
                                        concept: 'everywhere',
                                        scope: 'anywhere',
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
        })
        expect(save).toMatchObject({
            type: 'save_memories',
            saves: [{ concept: 'pitfall:everywhere', vault: 'default' }],
            refused: [
                {
                    type: 'pitfall',
                    concept: 'only-here',
                    reason: expect.stringContaining('muninn.vault'),
                },
            ],
        })
    })

    test("the PR shows each saved memory's vault: the project vault for repo-only ones, default for the rest", () => {
        const learned = [
            ...passed(),
            learnerStarted(),
            learnerFinished({
                memories: [
                    scoped({
                        type: 'pitfall',
                        concept: 'engine-readme-guard-docs',
                        scope: 'repo',
                    }),
                    scoped({
                        type: 'pitfall',
                        concept: 'bun-junit',
                        scope: 'anywhere',
                    }),
                ],
            }),
        ]
        const [save] = steps({ entries: learned })
        expect(
            save?.type === 'save_memories'
                ? save.saves.map(({ concept, vault }) => ({ concept, vault }))
                : []
        ).toEqual([
            {
                concept: 'pitfall:engine-readme-guard-docs',
                vault: PROJECT_VAULT,
            },
            { concept: 'pitfall:bun-junit', vault: 'default' },
        ])
        const [pr] = steps({
            entries: [
                ...learned,
                memoriesSaved({
                    saves: [
                        memorySave({
                            concept: 'pitfall:engine-readme-guard-docs',
                            vault: PROJECT_VAULT,
                            id: 'new-1',
                        }),
                        memorySave({
                            concept: 'pitfall:bun-junit',
                            id: 'new-2',
                        }),
                    ],
                }),
            ],
        })
        const body = pr?.type === 'open_pull_request' ? pr.body : ''
        expect(body).toContain(
            `- pitfall in \`${PROJECT_VAULT}\`: pitfall:engine-readme-guard-docs (new-1), added`
        )
        expect(body).toContain(
            '- pitfall in `default`: pitfall:bun-junit (new-2), added'
        )
    })

    test('once saved, the PR opens and lists the new memories', () => {
        const [pr] = steps({
            entries: [
                ...passed(),
                learnerStarted(),
                learnerFinished({
                    memories: [
                        proposedMemory({
                            type: 'pitfall',
                            concept: 'bun-junit',
                        }),
                    ],
                }),
                memoriesSaved({
                    saves: [
                        memorySave({
                            concept: 'pitfall:bun-junit',
                            id: 'new-1',
                        }),
                        memorySave({
                            concept: 'pattern:reduce',
                            outcome: 'updated',
                            id: 'old-2',
                        }),
                        memorySave({
                            concept: 'session:today',
                            outcome: 'refused',
                        }),
                    ],
                }),
            ],
        })
        expect(pr).toMatchObject({ type: 'open_pull_request' })
        const body = pr?.type === 'open_pull_request' ? pr.body : ''
        expect(body).toContain('## New memories')
        expect(body).toContain(
            '- pitfall in `default`: pitfall:bun-junit (new-1), added'
        )
        expect(body).toContain(
            '- pattern in `default`: pattern:reduce (old-2), updated'
        )
        expect(body).not.toContain('session:today')
    })

    test('a failed learner gets a fresh one, and after its last try the run ends without it', () => {
        const failedOnce = [
            ...passed(),
            learnerStarted(),
            learnerFailed({ failure: 'result' }),
        ]
        expect(steps({ entries: failedOnce })[0]).toMatchObject({
            type: 'launch_learner',
        })
        const failedForGood = [
            ...passed(),
            ...Array.from({ length: MAX_FIX_ROUNDS }, () => [
                learnerStarted(),
                learnerFailed({ failure: 'agent' }),
            ]).flat(),
        ]
        expect(steps({ entries: failedForGood })).toEqual([
            {
                type: 'skip_learning',
                reason: expect.stringContaining(
                    `failed ${MAX_FIX_ROUNDS} tries`
                ),
            },
        ])
        const [pr] = steps({ entries: [...failedForGood, learningSkipped()] })
        expect(pr).toMatchObject({ type: 'open_pull_request' })
        expect(pr?.type === 'open_pull_request' ? pr.body : '').not.toContain(
            'New memories'
        )
    })

    test("learner records are not the final review's", () => {
        const [save] = steps({
            entries: [
                ...passed(),
                learnerStarted(),
                learnerFailed({ failure: 'agent' }),
                learnerStarted(),
                learnerFinished({}),
            ],
        })
        expect(save).toMatchObject({
            type: 'save_memories',
            saves: [],
            feedback: [{ id: 'start-1', useful: false }],
        })
    })

    /** #11 failed its gates for good and is stuck, told on the spec. */
    const stuck11 = (): JournalEntry[] => [
        ticketWorktreeCreated({ ticket: 11 }),
        baselineTests({ ticket: 11 }),
        ...ticketBuilt({ ticket: 11 }).slice(2, 6),
        implemented({ ticket: 11 }),
        gatesRun({ ticket: 11, target: 'ticket', ok: false }),
        ticketStuck({
            ticket: 11,
            reason: 'gates_failed',
            detail: 'The gates still fail.',
        }),
        stuckReported({ ticket: 11 }),
    ]

    test('a stop reply runs the learner first, then saves, then comments the new memories on the spec, then ends', () => {
        const stopped = [
            startRecalled(),
            runBranchCreated(),
            ...stuck11(),
            commentRead({ comment_id: 120, body: 'stop' }),
            replyReceived({ word: 'stop', ticket: null, comment_id: 120 }),
        ]
        const [learner] = steps({ entries: stopped })
        expect(learner).toMatchObject({ type: 'launch_learner' })
        expect(promptOf(learner)).toContain('replied `stop`')
        expect(promptOf(learner)).toContain('#11 stuck: The checks still fail.')
        const saved = [
            ...stopped,
            learnerStarted(),
            learnerFinished({
                memories: [proposedMemory({ type: 'pitfall', concept: 'x' })],
            }),
            memoriesSaved({
                saves: [memorySave({ concept: 'pitfall:x', id: 'new-1' })],
            }),
        ]
        const [report] = steps({ entries: saved })
        expect(report).toMatchObject({
            type: 'report_memories',
            spec_number: 10,
            count: 1,
        })
        expect(report?.type === 'report_memories' ? report.body : '').toContain(
            'pitfall:x (new-1), added'
        )
        expect(
            steps({
                entries: [
                    ...saved,
                    {
                        kind: 'memories_reported',
                        ticket: null,
                        role: null,
                        content: { comment_id: 130, count: 1 },
                    },
                ],
            })
        ).toEqual([{ type: 'done', outcome: 'stopped_by_user' }])
    })

    test('with nothing saved, no comment goes on the spec', () => {
        expect(
            steps({
                entries: [
                    startRecalled(),
                    runBranchCreated(),
                    ...stuck11(),
                    replyReceived({
                        word: 'stop',
                        ticket: null,
                        comment_id: 120,
                    }),
                    learnerStarted(),
                    learnerFinished({}),
                    memoriesSaved({
                        saves: [
                            memorySave({
                                concept: 'session:x',
                                outcome: 'refused',
                            }),
                        ],
                    }),
                ],
            })
        ).toEqual([{ type: 'done', outcome: 'stopped_by_user' }])
    })

    test('with every ticket stuck and skipped, the learner runs before the last worktrees go', () => {
        const allSkipped = [
            startRecalled(),
            runBranchCreated(),
            ...stuck11(),
            replyReceived({ word: 'skip', ticket: 11, comment_id: 120 }),
            ticketSkipped({ ticket: 11 }),
        ]
        const [learner] = steps({ entries: allSkipped })
        expect(learner).toMatchObject({ type: 'launch_learner' })
        expect(promptOf(learner)).toContain(
            'Every ticket got stuck and was skipped'
        )
        expect(
            steps({
                entries: [
                    ...allSkipped,
                    learnerStarted(),
                    learnerFinished({}),
                    memoriesSaved({ saves: [] }),
                ],
            })
        ).toEqual([
            {
                type: 'remove_worktrees',
                paths: [ticketPath(11), RUN_BRANCH_PATH],
            },
        ])
    })

    test('no learner on a billing stop', () => {
        const billed = steps({
            entries: [
                startRecalled(),
                runBranchCreated(),
                ...ticketStarted(11),
                billingStopped({ reason: 'overage in use' }),
            ],
        })
        expect(billed.map(({ type }) => type)).toEqual(['done'])
        expect(billed[0]).toMatchObject({ outcome: 'stopped' })
    })

    test('no learner and no search on a refused run', () => {
        expect(
            decideSteps({
                records: recordsFrom({
                    entries: [
                        intakePassedWithMemory({
                            tickets: [SUM],
                        })[0] as JournalEntry,
                        {
                            kind: 'intake_refused',
                            ticket: null,
                            role: null,
                            content: {
                                problems: [
                                    {
                                        ticket: 10,
                                        missing: ['Testing Decisions'],
                                    },
                                ],
                            },
                        },
                    ],
                }),
            })
        ).toEqual([{ type: 'done', outcome: 'refused' }])
    })

    test('once the PR is open, nothing more is learned', () => {
        expect(
            steps({
                entries: [
                    ...passed(),
                    learnerStarted(),
                    learnerFinished({}),
                    memoriesSaved({ saves: [] }),
                    pullRequestOpened(),
                    worktreesRemoved({
                        paths: [ticketPath(11), RUN_BRANCH_PATH],
                    }),
                ],
            })
        ).toEqual([
            {
                type: 'done',
                outcome: 'pr_opened',
                pull_request: {
                    number: 99,
                    url: 'https://github.com/acme/app/pull/99',
                },
            },
        ])
    })

    test('a shipped final review runs the learner before its PR too', () => {
        expect(
            steps({
                entries: [
                    startRecalled(),
                    runBranchCreated(),
                    ...ticketBuilt({ ticket: 11 }),
                    ...lensRound({ round: 1 }),
                    finalReviewStuck({ reason: 'changes_requested' }),
                    finalReviewShipped(),
                ],
            })[0]
        ).toMatchObject({ type: 'launch_learner' })
    })
})
