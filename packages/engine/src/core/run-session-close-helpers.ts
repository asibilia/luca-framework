import { expect } from 'bun:test'

import {
    createScriptedLauncher,
    type ScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    CLEAN_LENS_TURNS,
    EMPTY_LEARNER_TURN,
    IMPLEMENTER_RESULT,
    SUM_TEST,
} from '../testing/practice-repo'

/**
 * Helpers shared by the end-to-end tests for closing finished agents'
 * sessions (`run-session-close.e2e.test.ts`,
 * `run-session-close-ticket-ends.e2e.test.ts`, and
 * `run-session-close-interruptions.e2e.test.ts`).
 */

/**
 * A scripted launcher with these turns, then a clean final review of spec
 * #10 and an empty learner to fall back on.
 */
export const scriptedWith = (turns: ScriptedTurn[]): ScriptedLauncher =>
    createScriptedLauncher({
        turns: [...turns, ...CLEAN_LENS_TURNS(10), EMPTY_LEARNER_TURN(10)],
    })

type SessionOf = { role: string | null; session_id: string }

export const byId = (a: SessionOf, b: SessionOf) =>
    a.session_id.localeCompare(b.session_id)

/** Every session a scripted launcher started, with its agent's role. */
export const launchedBy = (launcher: ScriptedLauncher): SessionOf[] =>
    launcher
        .launches()
        .filter(({ kind }) => kind === 'launch')
        .map(({ role, session_id }) => ({ role, session_id }))

/** Every session close the journal records, with its agent's role. */
export const closedIn = (records: JournalRecord[]): SessionOf[] =>
    records
        .flatMap((record) =>
            record.kind === 'agent_session_closed'
                ? [{ role: record.role, session_id: record.content.session_id }]
                : []
        )
        .toSorted(byId)

/** The journal's close of `session_id`, if any. */
export const closeOf = (records: JournalRecord[], session_id: string) =>
    records.find(
        (record) =>
            record.kind === 'agent_session_closed' &&
            record.content.session_id === session_id
    )

/**
 * No session the launcher started is still open, and the journal records
 * each one's close exactly once.
 */
export const expectEveryoneClosed = ({
    launcher,
    records,
}: {
    launcher: ScriptedLauncher
    records: JournalRecord[]
}) => {
    expect(launcher.openSessions()).toEqual([])
    expect(closedIn(records)).toEqual(launchedBy(launcher).toSorted(byId))
}

/** A ticket's launches and follow-ups, in order. */
export const callsOf = (launcher: ScriptedLauncher, ticket: number) =>
    launcher.launches().filter((call) => call.ticket === ticket)

/** A sum test that defines sum itself, so it passes before any code exists. */
export const PASSING_SUM_TEST = SUM_TEST.replace(
    "import { sum } from './sum'",
    'const sum = ({ numbers }: { numbers: number[] }) =>\n    numbers.reduce((a, b) => a + b, 0)'
)

/** An implementer of `ticket` whose code fails the tests. */
export const wrongImplementer = (ticket: number): ScriptedTurn => ({
    role: 'implementer',
    ticket,
    files: {
        'src/sum.ts': 'export const sum = (): number => 42\n',
        'src/index.ts': "export { sum } from './sum'\n",
    },
    result: IMPLEMENTER_RESULT,
})
