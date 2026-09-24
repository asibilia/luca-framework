import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { rateLimitReading } from './build-fixtures'
import { specIssue, ticketIssue } from './intake-fixtures'
import {
    APPROVE,
    IMPLEMENTER_RESULT,
    makePracticeRepo,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
} from './practice-repo'
import { AVERAGE, AVERAGE_TEST } from './practice-run'

import { AgentSessionSchema } from '../agents/agent-launcher'
import type { ScriptedCall, ScriptedTurn } from '../agents/scripted-launcher'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import { loadEngineConfig } from '../config/engine-config'
import type { EngineAction } from '../core/decide'
import { runEngine, startRun } from '../core/execute'
import { createGitAdapter } from '../git/git-adapter'
import type { JevShadow } from '../jev/jev-shadow'
import { createJournal, runJournalPath } from '../journal/journal'
import {
    JournalRecordSchema,
    type JournalRecord,
} from '../journal/journal-record'
import type { EngineClock } from '../limits/limit-wait'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'

/**
 * The many-ticket practice run, for seam 2: spec #10 with three tickets on
 * the practice repo. #11 "Add sum" and #12 "Add product" are independent,
 * and both change `src/index.ts`'s `export {}` line, so the second to join
 * clashes. #13 "Add average" waits on both.
 *
 * The scripted turns make the run go one way every time: #11's and #12's
 * test-writers each wait until the other's has started (only possible if
 * both build at once), and #11's reviewer waits until #12's approving review
 * is journaled, so #12 joins first and #11 clashes. #11's second implementer
 * turn (the clash follow-up) exports both, and its second reviewer turn (the
 * re-review) approves.
 */

/** How long a scripted turn waits for another ticket before it gives up. */
export const MANY_TICKETS_WAIT_MS = 15_000

const PRODUCT_TEST = `import { describe, expect, test } from 'bun:test'

import { product } from './product'

describe('product', () => {
    test('multiplies two numbers', () => {
        expect(product({ numbers: [2, 3] })).toBe(6)
    })

    test('of no numbers is one', () => {
        expect(product({ numbers: [] })).toBe(1)
    })
})
`

const PRODUCT = `export const product = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce((total, each) => total * each, 1)
`

/** `src/index.ts` once #11 is fixed on top of #12. */
export const SUM_AND_PRODUCT_INDEX =
    "export { product } from './product'\nexport { sum } from './sum'\n"

/** `src/index.ts` once #13 has joined. */
export const ALL_THREE_INDEX =
    "export { average } from './average'\nexport { product } from './product'\nexport { sum } from './sum'\n"

/** A test-writer's result mapping AC1 and AC2 to one test each. */
const mapping = ({
    file,
    first,
    second,
    assumption,
}: {
    file: string
    first: string
    second: string
    assumption: string
}) => ({
    outcome: 'tests_written',
    criteria: [
        { criterion_id: 'AC1', tests: [{ file, name: first }] },
        { criterion_id: 'AC2', tests: [{ file, name: second }] },
    ],
    summary: 'One test per criterion.',
    assumptions: [assumption],
    run_notes: [],
})

/** Polls until `check` holds, or throws after `MANY_TICKETS_WAIT_MS`. */
export const waitUntil = async ({
    check,
    what,
}: {
    check: () => boolean
    what: string
}): Promise<void> => {
    const until = Date.now() + MANY_TICKETS_WAIT_MS
    while (!check()) {
        if (Date.now() > until) {
            throw new Error(
                `Timed out after ${MANY_TICKETS_WAIT_MS} ms waiting for ${what}.`
            )
        }
        await Bun.sleep(20)
    }
}

/** The journal's records so far, read straight from its file. */
export const journalRecords = (file: string): JournalRecord[] =>
    existsSync(file)
        ? readFileSync(file, 'utf8')
              .split('\n')
              .filter((line) => line.trim() !== '')
              .map((line) => JournalRecordSchema.parse(JSON.parse(line)))
        : []

const journalHas = ({
    file,
    found,
}: {
    file: string
    found: (record: JournalRecord) => boolean
}): boolean => journalRecords(file).some(found)

/**
 * The scripted turns of the many-ticket run. Their waits read the journal at
 * `journal_file`.
 */
export const manyTicketTurns = ({
    journal_file,
}: {
    journal_file: string
}): ScriptedTurn[] => {
    const started = new Set<number>()
    return [
        {
            role: 'test-writer',
            ticket: 11,
            files: { 'src/sum.test.ts': SUM_TEST },
            act: async () => {
                started.add(11)
                await waitUntil({
                    check: () => started.has(12),
                    what: "#12's test-writer to start",
                })
            },
            result: TEST_WRITER_RESULT,
        },
        {
            role: 'test-writer',
            ticket: 12,
            files: { 'src/product.test.ts': PRODUCT_TEST },
            act: async () => {
                started.add(12)
                await waitUntil({
                    check: () => started.has(11),
                    what: "#11's test-writer to start",
                })
            },
            result: mapping({
                file: 'src/product.test.ts',
                first: 'product > multiplies two numbers',
                second: 'product > of no numbers is one',
                assumption: 'The product of no numbers is one.',
            }),
        },
        {
            role: 'implementer',
            ticket: 11,
            files: {
                'src/sum.ts': SUM,
                'src/index.ts': "export { sum } from './sum'\n",
            },
            result: IMPLEMENTER_RESULT,
        },
        {
            role: 'implementer',
            ticket: 12,
            files: {
                'src/product.ts': PRODUCT,
                'src/index.ts': "export { product } from './product'\n",
            },
            result: {
                ...IMPLEMENTER_RESULT,
                summary: 'Added product and exported it.',
            },
        },
        {
            role: 'ticket-reviewer',
            ticket: 11,
            act: async () =>
                waitUntil({
                    check: () =>
                        journalHas({
                            file: journal_file,
                            found: (record) =>
                                record.kind === 'agent_finished' &&
                                record.ticket === 12 &&
                                record.content.role === 'ticket-reviewer',
                        }),
                    what: "#12's approving review",
                }),
            result: APPROVE,
        },
        { role: 'ticket-reviewer', ticket: 12, result: APPROVE },
        // #11's clash follow-up: keep both exports.
        {
            role: 'implementer',
            ticket: 11,
            files: { 'src/index.ts': SUM_AND_PRODUCT_INDEX },
            result: {
                ...IMPLEMENTER_RESULT,
                summary: 'Kept both exports in src/index.ts.',
            },
        },
        // #11's re-review of the new changes.
        { role: 'ticket-reviewer', ticket: 11, result: APPROVE },
        {
            role: 'test-writer',
            ticket: 13,
            files: { 'src/average.test.ts': AVERAGE_TEST },
            result: mapping({
                file: 'src/average.test.ts',
                first: 'average > of two numbers is the one between them',
                second: 'average > of no numbers is zero',
                assumption: 'The average of no numbers is zero, not NaN.',
            }),
        },
        {
            role: 'implementer',
            ticket: 13,
            files: {
                'src/average.ts': AVERAGE,
                'src/index.ts': ALL_THREE_INDEX,
            },
            result: {
                ...IMPLEMENTER_RESULT,
                summary: 'Added average on top of sum and exported it.',
            },
        },
        { role: 'ticket-reviewer', ticket: 13, result: APPROVE },
    ]
}

/** Spec #10 with #11 (sum), #12 (product), and #13 (average, blocked by both). */
export const manyTicketsTracker = (): InMemoryTracker =>
    createInMemoryTracker({
        issues: [
            specIssue({ number: 10, title: 'Practice spec' }),
            ticketIssue({
                number: 11,
                title: 'Add sum',
                criteria: ['sum adds two numbers', 'sum of no numbers is zero'],
            }),
            ticketIssue({
                number: 12,
                title: 'Add product',
                criteria: [
                    'product multiplies two numbers',
                    'product of no numbers is one',
                ],
            }),
            ticketIssue({
                number: 13,
                title: 'Add average',
                criteria: [
                    'average of two numbers is the one between them',
                    'average of no numbers is zero',
                ],
                blocked_by_section: '- #11\n- #12',
                blocked_by: [11, 12],
            }),
        ],
        sub_tickets: { 10: [11, 12, 13] },
    })

/**
 * One many-ticket practice run: its tracker, its scripted turns (whose waits
 * read the journal at `journal_file`), and any files the repo starts with.
 */
export type ManyTicketsScenario = {
    tracker: () => InMemoryTracker
    turns: (args: { journal_file: string }) => ScriptedTurn[]
    /** More files for the practice repo's first commit. */
    files?: Record<string, string>
}

/** The three-ticket run: #11 and #12 at once, clashing, and #13 after both. */
export const SUM_PRODUCT_AVERAGE: ManyTicketsScenario = {
    tracker: () => manyTicketsTracker(),
    turns: manyTicketTurns,
}

/** What a many-ticket run left behind. */
export type ManyTicketsRun = {
    action: EngineAction
    tracker: InMemoryTracker
    records: JournalRecord[]
    launches: ScriptedCall[]
    repo: string
    origin: string
    /** The run's folder: its journal, and where its worktrees were. */
    run_dir: string
    journal_file: string
}

/**
 * Makes the practice repo in `root` and runs the engine on a many-ticket
 * scenario to its end (`SUM_PRODUCT_AVERAGE` unless told otherwise), with
 * Jev in shadow mode if given. The journal is `<root>/runs/run-1/journal.jsonl`.
 *
 * @example
 * const { action, records } = await runManyTickets({ root, scenario: BROKEN_JOIN })
 */
export const runManyTickets = async ({
    root,
    jev,
    scenario,
    clock,
}: {
    root: string
    jev?: JevShadow
    /** Defaults to `SUM_PRODUCT_AVERAGE`. */
    scenario?: ManyTicketsScenario
    /** Limit waits sleep by it; tests fake it. */
    clock?: EngineClock
}): Promise<ManyTicketsRun> => {
    const chosen = scenario ?? SUM_PRODUCT_AVERAGE
    const { repo, origin } = await makePracticeRepo({
        root,
        files: chosen.files,
    })
    const run_dir = join(root, 'runs', 'run-1')
    const journal = createJournal({
        file: runJournalPath({ runs_dir: join(root, 'runs'), run_id: 'run-1' }),
    })
    const loaded = await loadEngineConfig({ repo_root: repo })
    if (!loaded.ok) throw new Error(loaded.error)
    const tracker = chosen.tracker()
    const launcher = createScriptedLauncher({
        turns: chosen.turns({ journal_file: journal.file }),
    })
    startRun({
        journal,
        spec_number: 10,
        config: loaded.config,
        base_branch: 'main',
    })
    const action = await runEngine({
        journal,
        tracker,
        git: createGitAdapter({ repo_root: repo }),
        launcher,
        jev,
        clock,
    })
    return {
        action,
        tracker,
        records: journal.read(),
        launches: launcher.launches(),
        repo,
        origin,
        run_dir,
        journal_file: journal.file,
    }
}

const UTIL = 'export const helper = (value: number): number => value\n'

const DOUBLE_TEST = `import { describe, expect, test } from 'bun:test'

import { double } from './double'

describe('double', () => {
    test('of two is four', () => {
        expect(double({ value: 2 })).toBe(4)
    })

    test('of zero is zero', () => {
        expect(double({ value: 0 })).toBe(0)
    })
})
`

const DOUBLE = `import { helper } from './util'

export const double = ({ value }: { value: number }): number =>
    helper(value) * 2
`

const IDENTITY_TEST = `import { describe, expect, test } from 'bun:test'

import { identity } from './util'

describe('identity', () => {
    test('gives back three', () => {
        expect(identity(3)).toBe(3)
    })

    test('gives back zero', () => {
        expect(identity(0)).toBe(0)
    })
})
`

/** #22's util.ts: `helper` renamed, and nothing else changed. */
const RENAMED_UTIL =
    'export const identity = (value: number): number => value\n'

/** #22's fix on top of the run branch: the old name kept for `double`. */
const FIXED_UTIL = `export const identity = (value: number): number => value

/** The old name, which double still uses. */
export const helper = identity
`

/**
 * Two tickets that don't clash in git but break each other: #21 "Add
 * double" imports `helper` from `src/util.ts`; #22 "Rename helper to
 * identity" renames it. Each passes its gates alone. #22's reviewer waits
 * until #21 has pushed, so #21 joins first and #22's join fails the types
 * gate on the run branch. #22's second implementer turn (the gate fix) keeps
 * the old name, and its second reviewer turn (the re-review) approves.
 */
export const BROKEN_JOIN: ManyTicketsScenario = {
    files: { 'src/util.ts': UTIL },
    tracker: () =>
        createInMemoryTracker({
            issues: [
                specIssue({ number: 10, title: 'Practice spec' }),
                ticketIssue({
                    number: 21,
                    title: 'Add double',
                    criteria: [
                        'double of two is four',
                        'double of zero is zero',
                    ],
                }),
                ticketIssue({
                    number: 22,
                    title: 'Rename helper to identity',
                    criteria: [
                        'identity gives back three',
                        'identity gives back zero',
                    ],
                }),
            ],
            sub_tickets: { 10: [21, 22] },
        }),
    turns: ({ journal_file }): ScriptedTurn[] => [
        {
            role: 'test-writer',
            ticket: 21,
            files: { 'src/double.test.ts': DOUBLE_TEST },
            result: mapping({
                file: 'src/double.test.ts',
                first: 'double > of two is four',
                second: 'double > of zero is zero',
                assumption: 'double takes one number.',
            }),
        },
        {
            role: 'implementer',
            ticket: 21,
            files: {
                'src/double.ts': DOUBLE,
                'src/index.ts': "export { double } from './double'\n",
            },
            result: {
                ...IMPLEMENTER_RESULT,
                summary: 'Added double on top of helper.',
            },
        },
        { role: 'ticket-reviewer', ticket: 21, result: APPROVE },
        {
            role: 'test-writer',
            ticket: 22,
            files: { 'src/util.test.ts': IDENTITY_TEST },
            result: mapping({
                file: 'src/util.test.ts',
                first: 'identity > gives back three',
                second: 'identity > gives back zero',
                assumption: 'Nothing else uses helper.',
            }),
        },
        {
            role: 'implementer',
            ticket: 22,
            files: { 'src/util.ts': RENAMED_UTIL },
            result: { ...IMPLEMENTER_RESULT, summary: 'Renamed helper.' },
        },
        {
            role: 'ticket-reviewer',
            ticket: 22,
            act: async () =>
                waitUntil({
                    check: () =>
                        journalHas({
                            file: journal_file,
                            found: (record) =>
                                record.kind === 'run_branch_pushed' &&
                                record.ticket === 21,
                        }),
                    what: "#21's push",
                }),
            result: APPROVE,
        },
        // The gate fix on top of the run branch: keep the old name.
        {
            role: 'implementer',
            ticket: 22,
            files: { 'src/util.ts': FIXED_UTIL },
            result: {
                ...IMPLEMENTER_RESULT,
                summary: 'Kept helper as the old name of identity.',
            },
        },
        // The re-review of the new changes.
        { role: 'ticket-reviewer', ticket: 22, result: APPROVE },
    ],
}

/** The five-hour window's reset in `LIMIT_HIT`. */
export const LIMIT_HIT_RESET = '2026-09-23T14:00:00.000Z'

/** A test-writer's turn cut off by the plan: a rejected five-hour limit. */
const cutOff = ({
    ticket,
    act,
}: {
    ticket: number
    act: () => Promise<void>
}): ScriptedTurn => ({
    role: 'test-writer',
    ticket,
    act,
    failure: 'plan',
    error: 'The plan said no.',
    session: AgentSessionSchema.parse({
        session_id: `cut-${ticket}`,
        rate_limit_events: [
            rateLimitReading({
                status: 'rejected',
                rate_limit_type: 'five_hour',
                resets_at: LIMIT_HIT_RESET,
            }),
        ],
    }),
})

/**
 * `SUM_PRODUCT_AVERAGE` with a plan limit hit while #11 and #12 are both in
 * flight: #11's first test-writer waits until #12's has started, then the
 * plan cuts it off; #12's waits until #11's cut-off session is journaled,
 * then the plan cuts it off too. After the limit wait, both test-writers
 * start again and the run goes on as usual.
 */
export const LIMIT_HIT: ManyTicketsScenario = {
    tracker: () => manyTicketsTracker(),
    turns: ({ journal_file }): ScriptedTurn[] => {
        const started = new Set<number>()
        return [
            cutOff({
                ticket: 11,
                act: async () => {
                    started.add(11)
                    await waitUntil({
                        check: () => started.has(12),
                        what: "#12's first test-writer to start",
                    })
                },
            }),
            cutOff({
                ticket: 12,
                act: async () => {
                    started.add(12)
                    await waitUntil({
                        check: () =>
                            journalHas({
                                file: journal_file,
                                found: (record) =>
                                    record.kind === 'agent_session' &&
                                    record.ticket === 11,
                            }),
                        what: "#11's cut-off session",
                    })
                },
            }),
            ...manyTicketTurns({ journal_file }),
        ]
    },
}

/**
 * A repo with a local workspace package that nothing depends on yet. Bun
 * installs workspace packages offline, and auto-install is off, so nothing
 * here reaches the network.
 */
const WORKSPACE_FILES = {
    'package.json': JSON.stringify(
        { name: 'practice', private: true, workspaces: ['packages/*'] },
        null,
        4
    ),
    'bunfig.toml': '[install]\nauto = "disable"\n',
    'packages/math/package.json': JSON.stringify(
        { name: '@practice/math', version: '1.0.0', main: 'index.ts' },
        null,
        4
    ),
    'packages/math/index.ts':
        'export const add = (a: number, b: number): number => a + b\n',
}

const MANIFEST_WITH_MATH = JSON.stringify(
    {
        name: 'practice',
        private: true,
        workspaces: ['packages/*'],
        dependencies: { '@practice/math': 'workspace:*' },
    },
    null,
    4
)

const SUM_ON_MATH = `import { add } from '@practice/math'

export const sum = ({ numbers }: { numbers: number[] }): number =>
    numbers.reduce(add, 0)
`

/**
 * A rebase that crosses a dependency change: #21 "Add sum" makes the repo
 * depend on its workspace package (its gates install, and its green commit
 * takes the new lockfile), and joins first. #22 "Add product" clashes with
 * it on `src/index.ts`, so its change is moved onto a run branch whose
 * manifest and lockfile moved: its worktree gets the frozen install again
 * before its clash is fixed.
 */
export const REINSTALL: ManyTicketsScenario = {
    files: WORKSPACE_FILES,
    tracker: () =>
        createInMemoryTracker({
            issues: [
                specIssue({ number: 10, title: 'Practice spec' }),
                ticketIssue({
                    number: 21,
                    title: 'Add sum',
                    criteria: [
                        'sum adds two numbers',
                        'sum of no numbers is zero',
                    ],
                }),
                ticketIssue({
                    number: 22,
                    title: 'Add product',
                    criteria: [
                        'product multiplies two numbers',
                        'product of no numbers is one',
                    ],
                }),
            ],
            sub_tickets: { 10: [21, 22] },
        }),
    turns: ({ journal_file }): ScriptedTurn[] => [
        {
            role: 'test-writer',
            ticket: 21,
            files: { 'src/sum.test.ts': SUM_TEST },
            result: TEST_WRITER_RESULT,
        },
        {
            role: 'implementer',
            ticket: 21,
            files: {
                'package.json': MANIFEST_WITH_MATH,
                'src/sum.ts': SUM_ON_MATH,
                'src/index.ts': "export { sum } from './sum'\n",
            },
            result: {
                ...IMPLEMENTER_RESULT,
                summary: 'Added sum on the math package.',
            },
        },
        { role: 'ticket-reviewer', ticket: 21, result: APPROVE },
        {
            role: 'test-writer',
            ticket: 22,
            files: { 'src/product.test.ts': PRODUCT_TEST },
            result: mapping({
                file: 'src/product.test.ts',
                first: 'product > multiplies two numbers',
                second: 'product > of no numbers is one',
                assumption: 'The product of no numbers is one.',
            }),
        },
        {
            role: 'implementer',
            ticket: 22,
            files: {
                'src/product.ts': PRODUCT,
                'src/index.ts': "export { product } from './product'\n",
            },
            result: {
                ...IMPLEMENTER_RESULT,
                summary: 'Added product and exported it.',
            },
        },
        {
            role: 'ticket-reviewer',
            ticket: 22,
            act: async () =>
                waitUntil({
                    check: () =>
                        journalHas({
                            file: journal_file,
                            found: (record) =>
                                record.kind === 'run_branch_pushed' &&
                                record.ticket === 21,
                        }),
                    what: "#21's push",
                }),
            result: APPROVE,
        },
        // #22's clash follow-up: keep both exports.
        {
            role: 'implementer',
            ticket: 22,
            files: { 'src/index.ts': SUM_AND_PRODUCT_INDEX },
            result: {
                ...IMPLEMENTER_RESULT,
                summary: 'Kept both exports in src/index.ts.',
            },
        },
        { role: 'ticket-reviewer', ticket: 22, result: APPROVE },
    ],
}
