/**
 * What the journal says about one stuck item, as the `/luca-unstick`
 * helper prints it: its retry history, a stuck ticket's last results and
 * failed checks, and the stuck final review's open findings and failures.
 * Pure; it imports nothing but the helper's own journal reading.
 */
import {
    clip,
    clipEnd,
    indent,
    lastOf,
    listOf,
    nest,
    numberOr,
    objectOf,
    ofKind,
    retryHistory,
    seqText,
    text,
    type LooseRecord,
    type StuckItem,
} from './stuck-records'

/**
 * A stuck item's retry history, for `/luca-watch`: the engine's own
 * retries of it, and how its failed tries since its last retry failed (a
 * ticket or the final review) or the `run_budget` stucks before it (the
 * run). Pure.
 *
 * @example
 * historyLines({ records, item })
 * // ['Retried by the engine itself (auto_retried): 1', 'Failed tries since its last retry: implementer agent, guard']
 */
export const historyLines = ({
    records,
    item,
}: {
    records: LooseRecord[]
    item: StuckItem
}): string[] => {
    const history = retryHistory({ records, item })
    const failed = history.failed_kinds
        .map(([role, kinds]) => `${role} ${kinds.join(', ')}`)
        .join('; ')
    return [
        `Retried by the engine itself (auto_retried): ${history.auto_retried}`,
        item.what === 'run'
            ? `Earlier run_budget stucks in this run: ${history.budget_stucks_before}`
            : `Failed tries since its last retry: ${failed || 'none'}`,
    ]
}

/** A failed check's lines: its name, command, how it ended, its output's end. */
const checkLines = (check: Record<string, unknown>): string[] => {
    const exit = numberOr(check.exit_code)
    return [
        `${text(check.name) || 'check'} \`${text(check.command)}\` ${exit === null ? 'timed out (no exit code)' : `exit ${exit}`}`,
        indent(clipEnd(text(check.output)).trim() || '(no output)'),
    ]
}

/** A reviewer's blocking findings (blockers and should-fixes), one per line. */
const findingLines = (result: Record<string, unknown>): string[] =>
    listOf(result.findings)
        .map(objectOf)
        .filter((finding) => finding.severity !== 'nit')
        .map(
            (finding) =>
                `- ${text(finding.severity)} (${text(finding.kind)})${text(finding.file) === '' ? '' : ` ${text(finding.file)}`}: ${clip(text(finding.title), 300)}`
        )

/** What the journal says about the stuck final review. Pure. */
export const finalReviewLines = ({
    records,
}: {
    records: LooseRecord[]
}): string[] => {
    const lines: string[] = []
    const run_level = records.filter((record) => record.ticket === null)
    const lenses = new Map<string, LooseRecord>()
    for (const record of ofKind(run_level, 'agent_finished')) {
        const role = text(record.content.role)
        if (role.endsWith('-lens')) lenses.set(role, record)
    }
    for (const [role, record] of lenses) {
        const findings = findingLines(objectOf(record.content.result))
        if (findings.length > 0) {
            lines.push(
                `${role}'s open findings (${seqText(record.seq)}):`,
                ...findings
            )
        }
    }
    const failed = lastOf(run_level, 'agent_failed')
    if (failed !== undefined) {
        lines.push(
            `Last failed try (${seqText(failed.seq)}): ${text(failed.content.role)} (${text(failed.content.failure) || 'agent'})`,
            indent(clip(text(failed.content.error), 800))
        )
    }
    const gates = lastOf(run_level, 'gates_run')
    if (gates !== undefined && gates.content.ok === false) {
        lines.push(
            `Last gates on the run branch failed (${seqText(gates.seq)}):`,
            ...listOf(gates.content.checks)
                .map(objectOf)
                .filter((check) => check.ok === false)
                .flatMap(checkLines)
        )
    }
    return lines
}

/** What the journal says about one stuck ticket. Pure. */
export const ticketLines = ({
    records,
    item,
}: {
    records: LooseRecord[]
    item: StuckItem
}): string[] => {
    const n = item.ticket
    const mine = records.filter((record) => record.ticket === n)
    const lines: string[] = []
    const worktree = lastOf(mine, 'ticket_worktree_created')
    if (worktree !== undefined) {
        lines.push(
            `Worktree: ${text(worktree.content.path)} (branch ${text(worktree.content.branch)})`
        )
    }
    const agent = lastOf(mine, 'agent_finished')
    if (agent !== undefined) {
        const role = text(agent.content.role)
        const result = objectOf(agent.content.result)
        const outcome = text(result.outcome) || text(result.verdict)
        lines.push(
            `Last agent result (${seqText(agent.seq)}): ${role} ${outcome}`
        )
        const bad = objectOf(result.bad_test)
        if (text(bad.file) !== '') {
            lines.push(
                `  bad_test: ${text(bad.file)} > ${text(bad.name)}`,
                indent(`reason: ${clip(text(bad.reason))}`)
            )
        }
        lines.push(...nest(findingLines(result), '  '))
        const setup = objectOf(result.setup_change)
        if (text(setup.file) !== '') {
            lines.push(
                `  setup_change: ${text(setup.file)}: ${clip(text(setup.reason))}`
            )
        }
        const done_by = listOf(result.done_by).map(objectOf)
        if (done_by.length > 0) {
            lines.push(
                `  done_by: ${done_by.map((commit) => `${text(commit.sha).slice(0, 9)} ${text(commit.title)}`).join('; ')}`
            )
        }
        if (text(result.summary) !== '') {
            lines.push(indent(`summary: ${clip(text(result.summary), 600)}`))
        }
    }
    const failed = lastOf(mine, 'agent_failed')
    if (failed !== undefined) {
        lines.push(
            `Last failed try (${seqText(failed.seq)}): ${text(failed.content.role)} (${text(failed.content.failure) || 'agent'})`,
            indent(clip(text(failed.content.error), 800))
        )
    }
    const prepared = lastOf(mine, 'baseline_prepared')
    const prepare_check = objectOf(prepared?.content.check)
    if (prepared !== undefined && prepare_check.ok === false) {
        lines.push(
            `Prepare failed (${seqText(prepared.seq)}):`,
            ...checkLines(prepare_check)
        )
    }
    const red = lastOf(mine, 'red_check')
    if (red !== undefined && red.content.ok === false) {
        lines.push(
            `Last red check failed (${seqText(red.seq)}):`,
            ...listOf(red.content.problems).map(
                (p) => `  - ${clip(text(p), 600)}`
            )
        )
    }
    const evidence = lastOf(mine, 'already_done_checked')
    if (evidence !== undefined && evidence.content.ok === false) {
        lines.push(
            `already_done evidence did not check out (${seqText(evidence.seq)}):`,
            ...listOf(evidence.content.problems).map(
                (p) => `  - ${clip(text(p), 600)}`
            )
        )
    }
    const gates = lastOf(mine, 'gates_run')
    if (gates !== undefined && gates.content.ok === false) {
        lines.push(
            `Last gates failed (${seqText(gates.seq)}, on the ${text(gates.content.target) === 'run_branch' ? 'run branch' : 'ticket worktree'}):`,
            ...listOf(gates.content.checks)
                .map(objectOf)
                .filter((check) => check.ok === false)
                .flatMap(checkLines)
        )
    }
    const scan = lastOf(mine, 'leftover_scan')
    const hits = listOf(scan?.content.hits).map(objectOf)
    if (hits.length > 0) {
        lines.push(
            'Leftover scan hits:',
            ...hits.map((hit) => `  - ${text(hit.path)}: ${text(hit.reason)}`)
        )
    }
    const rebased = lastOf(mine, 'ticket_rebased')
    if (rebased !== undefined) {
        lines.push(
            `Rebased onto the run branch (${seqText(rebased.seq)},${text(rebased.content.cause)}): clashed tests ${listOf(rebased.content.tests).map(text).join(', ') || 'none'}; clashed code ${listOf(rebased.content.code).map(text).join(', ') || 'none'}`
        )
    }
    const sent = lastOf(mine, 'tests_sent_back')
    if (sent !== undefined) {
        const bad = objectOf(sent.content.bad_test)
        lines.push(
            `tests_sent_back round ${String(sent.content.round)} (${seqText(sent.seq)}): ${text(bad.file)} > ${text(bad.name)}`,
            `  joined since: ${
                listOf(sent.content.joined)
                    .map(objectOf)
                    .map((t) => `#${String(t.ticket)} ${text(t.title)}`)
                    .join('; ') || 'none'
            }`
        )
    }
    return lines
}
