/**
 * The stuck details for a ticket that needs a change only the owner may make, or
 * whose test was sent back as bad.
 */
import upperFirst from 'lodash/upperFirst'

import type { AgentRole, BadTest, BadTestSource } from '../agents/role-results'
import { clipOutput } from '../shell/run-command'

/**
 * The detail of a ticket or the final review stuck on a change only the
 * owner may make (#617): the file, why, and what to do. It says "test setup
 * file" only when the file is one of the config's.
 */
export const setupChangeDetail = ({
    role,
    file,
    reason,
    setup_files,
}: {
    role: AgentRole
    file: string
    reason: string
    /** The config's test setup files. */
    setup_files: string[]
}): string =>
    `The ${role} needs a change only you may make, to \`${file || 'unnamed'}\`: ${reason || 'no reason given'}\n` +
    `${setup_files.includes(file) ? 'It is a test setup file, which agents may never change.' : 'No agent may make it.'} Make the change yourself in the worktree, then reply retry.`

/**
 * A test sent back as bad, for a stuck detail: its file and name, then the
 * reason (the implementer's, or the engine's finding that it checks nothing,
 * #581), clipped like other outputs (#490). "no reason given" only when
 * there is none.
 *
 * @example
 * badTestDetail({ bad_test: { file: 'src/sum.test.ts', name: 'sum > adds', reason: 'Wrong sum.' } })
 * // 'src/sum.test.ts > sum > adds: Wrong sum.'
 */
export const badTestDetail = ({
    bad_test,
}: {
    bad_test: BadTest | null
}): string => {
    const reason =
        bad_test === null || bad_test.reason.trim() === ''
            ? 'no reason given'
            : clipOutput({ text: bad_test.reason })
    const where =
        bad_test === null
            ? ''
            : [bad_test.file, bad_test.name].filter(Boolean).join(' > ')
    return where === '' ? reason : `${where}: ${reason}`
}

/** What each source did when it sent a test back as bad (#581). */
const BOUNCE_CLAUSES: Record<BadTestSource, string> = {
    implementer: 'the implementer sent a test back as bad',
    engine: 'the engine found a mapped test that checks nothing',
}

/**
 * The start of a stuck detail for a test sent back as bad a second time
 * (#581): who sent the first back, and who the second. A test can be sent
 * back by the implementer, or by the engine when a mapped test passes with no
 * `expect()`; the two share one cap, so the second may have another source
 * than the first.
 *
 * @example
 * badTestTwiceText({ earlier: 'engine', latest: 'implementer' })
 * // 'The engine found a mapped test that checks nothing, and then, after a
 * // fresh test-writer, the implementer sent a test back as bad'
 */
export const badTestTwiceText = ({
    earlier,
    latest,
}: {
    earlier: BadTestSource
    latest: BadTestSource
}): string => {
    if (earlier === latest) {
        return latest === 'engine'
            ? 'A mapped test still checks nothing after a fresh test-writer'
            : 'The implementer sent a test back as bad a second time'
    }
    return upperFirst(
        `${BOUNCE_CLAUSES[earlier]}, and then, after a fresh test-writer, ${BOUNCE_CLAUSES[latest]}`
    )
}
