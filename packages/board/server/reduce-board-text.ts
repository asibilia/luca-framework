/**
 * Words for the reducer: short pure functions that turn ids, counts and
 * record fields into the texts a card or row shows. They hold no board
 * state.
 */
import type { BoardRecord } from './board-vocabulary'

import type { FindingCounts } from '../shared/board-state'

/** Longest single "tried" line kept in state. */
export const LINE_MAX = 240

/**
 * A commit's short sha, as git and GitHub show it.
 *
 * @example
 * shortSha({ sha: '3559c25f5a1b' }) // '3559c25'
 */
export const shortSha = ({ sha }: { sha: string }): string => sha.slice(0, 7)

/**
 * An already-done ticket's activity (#484): calm, with the commits that
 * did its work.
 *
 * @example
 * alreadyDoneText({ shas: ['3559c25f5a1b'] }) // 'already done · 3559c25'
 */
export const alreadyDoneText = ({ shas }: { shas: string[] }): string =>
    ['already done', ...shas.map((sha) => shortSha({ sha }))].join(' · ')

/** Cuts `text` to `max` characters, ending in "…" when it was longer. */
export const clip = ({ text, max }: { text: string; max: number }): string =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text

export const firstLine = ({ text }: { text: string }): string =>
    clip({ text: text.split('\n')[0] ?? '', max: LINE_MAX })

/** How an agent turn failed, in words: `agent_failed`'s `failure`. */
const FAILURES: Record<string, string> = {
    agent: 'failed',
    result: 'gave no usable result',
    guard: "broke its role's rules (the changes were undone)",
    engine: 'could not run (an engine-side failure; a fresh agent starts)',
}

/** An `agent_failed` failure kind in words. */
export const failureText = ({ failure }: { failure: string }): string =>
    FAILURES[failure] ?? `failed (${failure})`

/** Issue numbers as `#12`, `#12 and #13`, or `#12, #13 and #14`. */
export const numbersText = ({ numbers }: { numbers: number[] }): string => {
    const refs = numbers.map((number) => `#${number}`)
    const last = refs.at(-1) ?? ''
    return refs.length <= 1
        ? last
        : `${refs.slice(0, -1).join(', ')} and ${last}`
}

/**
 * A role in words: a final review lens's role (`security-lens`) reads
 * "security lens"; any other role as it is.
 *
 * @example
 * roleWords({ role: 'security-lens' }) // 'security lens'
 */
export const roleWords = ({ role }: { role: string }): string =>
    role.endsWith('-lens') ? `${role.slice(0, -'-lens'.length)} lens` : role

/** A ticket review's findings counted by severity. */
export const countFindings = ({
    findings,
}: {
    findings: { severity: 'blocker' | 'should_fix' | 'nit' }[]
}): FindingCounts => ({
    blocker: findings.filter((finding) => finding.severity === 'blocker')
        .length,
    should_fix: findings.filter((finding) => finding.severity === 'should_fix')
        .length,
    nit: findings.filter((finding) => finding.severity === 'nit').length,
})

const plural = ({ count, word }: { count: number; word: string }) =>
    `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * A ticket review's finding counts in words, such as "1 blocker, 2
 * should-fix, 2 nits". Nits are left out unless `nits` is set; `null` when
 * nothing is left to say.
 *
 * @example
 * reviewCountsText({ findings: { blocker: 2, should_fix: 1, nit: 1 }, nits: false })
 * // '2 blockers, 1 should-fix'
 */
export const reviewCountsText = ({
    findings,
    nits,
}: {
    findings: FindingCounts
    nits: boolean
}): string | null => {
    const parts = [
        findings.blocker > 0
            ? plural({ count: findings.blocker, word: 'blocker' })
            : null,
        findings.should_fix > 0 ? `${findings.should_fix} should-fix` : null,
        nits && findings.nit > 0
            ? plural({ count: findings.nit, word: 'nit' })
            : null,
    ].filter((part) => part !== null)
    return parts.length > 0 ? parts.join(', ') : null
}

/** What happened when a ticket was sent back onto the run branch, in words. */
export const rebasedText = ({
    content,
}: {
    content: Extract<BoardRecord, { kind: 'ticket_rebased' }>['content']
}): string => {
    if (content.cause === 'join_gates') {
        return 'The checks failed after joining; fixing on top of the run branch'
    }
    const files = [...content.tests, ...content.code]
    return files.length === 0
        ? 'Clashed with the run branch; fixing on top of it'
        : `Clashed with the run branch in ${files.join(', ')}`
}

/** A test sent back to the test-writer after a rebase (#489), in words. */
export const testsSentBackText = ({
    content,
}: {
    content: Extract<BoardRecord, { kind: 'tests_sent_back' }>['content']
}): string => {
    const test = [content.bad_test.file, content.bad_test.name]
        .filter(Boolean)
        .join(' > ')
    const joined = content.joined.map(({ ticket }) => `#${ticket}`).join(', ')
    return `Test update ${content.round}: ${test || 'a test'} is wrong on the run branch${joined === '' ? '' : ` after ${joined} joined`}; back to the test-writer`
}
