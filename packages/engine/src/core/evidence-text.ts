import type { TicketProgress, ReplayedSnapshot } from '../journal/replay'
import { REFACTOR_LABEL } from '../tracker/tracker'

/** The most test names one ticket's Evidence line lists (#513). */
export const MAX_EVIDENCE_TESTS = 5

/** The longest test name an Evidence line shows; a longer one is clipped. */
export const MAX_EVIDENCE_NAME = 80

const EVIDENCE_INTRO =
    "Each ticket's new tests failed before its code was written (the red check), and pass now (the gates)."

const clipName = (name: string): string =>
    name.length > MAX_EVIDENCE_NAME
        ? `${name.slice(0, MAX_EVIDENCE_NAME - 1)}…`
        : name

/** Up to `MAX_EVIDENCE_TESTS` names, then how many more. */
const namesText = (names: string[]): string => {
    const shown = names.slice(0, MAX_EVIDENCE_TESTS).map(clipName)
    const more = names.length - shown.length
    return more > 0 ? `${shown.join(', ')}, and ${more} more` : shown.join(', ')
}

/** One ticket's Evidence line. */
const evidenceLine = ({
    number,
    progress,
    refactor,
}: {
    number: number
    progress: TicketProgress | undefined
    refactor: boolean
}): string => {
    if ((progress?.already_done ?? null) !== null) {
        return `- #${number}: already done on the base branch, so no new tests.`
    }
    if (refactor) {
        return `- #${number}: a refactor, so no new tests; the old tests still pass.`
    }
    const red_tests = progress?.red_tests ?? []
    if (red_tests.length === 0) return `- #${number}: no red check recorded.`
    const one = red_tests.length === 1
    const count = `${red_tests.length} new ${one ? 'test' : 'tests'} failed first`
    const passed =
        progress?.gates?.ok === true || progress?.join_gates?.ok === true
    const how = passed
        ? `, now ${one ? 'passes' : 'pass'}`
        : `; the gates have not passed ${one ? 'it' : 'them'} yet`
    return `- #${number}: ${count}${how}: ${namesText(red_tests.map(({ name }) => name))}`
}

/**
 * The PR's Evidence section (#513), from the journal alone: for each ticket
 * in the run (not the skipped ones), the new tests its red check proved
 * fail first, and whether the gates pass them now. An already-done ticket
 * and a refactor ticket say why they have no new tests. Each line names at
 * most `MAX_EVIDENCE_TESTS` tests. With no ticket in the run, `''`.
 *
 * @example
 * evidenceSection({ snapshot, tickets })
 * // "## Evidence\n\n...\n\n- #11: 1 new test failed first, now passes: sum adds two numbers"
 */
export const evidenceSection = ({
    snapshot,
    tickets,
}: {
    snapshot: ReplayedSnapshot
    tickets: Record<number, TicketProgress>
}): string => {
    const lines = snapshot.ticket_order
        .filter((number) => (tickets[number]?.skipped ?? null) === null)
        .map((number) =>
            evidenceLine({
                number,
                progress: tickets[number],
                refactor:
                    snapshot.tickets[number]?.labels.includes(REFACTOR_LABEL) ??
                    false,
            })
        )
    if (lines.length === 0) return ''
    return `## Evidence\n\n${EVIDENCE_INTRO}\n\n${lines.join('\n')}`
}
