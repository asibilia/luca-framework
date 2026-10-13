#!/usr/bin/env bun
/**
 * Prints what is stuck in a Luca run, and why, from its journal, for the
 * `/luca-unstick` skill:
 *
 *   bun stuck-summary.ts [run id] [#ticket] [--repo <path>] [--runs-dir <dir>] [--registry <file>]
 *
 * With no run id, it lists the runs of the repo (`--repo`, else the git repo
 * of the current folder), newest first, and sums up the newest one that
 * needs you. With `#ticket`, it sums up only that ticket (and the run).
 *
 * It only reads: the journal (`<runs folder>/<run id>/journal.jsonl`), the
 * board's run registry (never its tokens), the engine's log, and `ps`. It
 * changes nothing.
 *
 * It imports nothing but Bun's and Node's own modules: it runs from
 * `~/.claude/skills/luca-unstick/`, where no packages are installed. So it
 * reads records loosely, not with the engine's Zod schemas.
 * `stuck-summary.test.ts` checks it against journals built with the
 * engine's own fixtures, and every kind in `KINDS_READ` against the
 * journal's kinds, so the two can't drift apart unseen.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Every journal record kind this script reads. */
export const KINDS_READ = [
    'run_started',
    'engine_resumed',
    'intake_read',
    'spec_snapshot',
    'ticket_snapshot',
    'intake_refused',
    'nothing_to_do',
    'run_branch_created',
    'ticket_worktree_created',
    'baseline_prepared',
    'agent_finished',
    'agent_failed',
    'red_check',
    'already_done_checked',
    'leftover_scan',
    'gates_run',
    'ticket_rebased',
    'tests_sent_back',
    'ticket_stuck',
    'run_stuck',
    'final_review_stuck',
    'stuck_reported',
    'comment_read',
    'reply_received',
    'reply_ignored',
    'ticket_retried',
    'ticket_skipped',
    'final_review_retried',
    'final_review_shipped',
    'run_stopped',
    'pull_request_opened',
    'limit_wait_started',
    'limit_wait_ended',
    'step_started',
    'step_ended',
] as const

type KindRead = (typeof KINDS_READ)[number]

/** One journal line, read loosely. */
export type LooseRecord = {
    seq: number
    time: string
    kind: string
    ticket: number | null
    content: Record<string, unknown>
}

/** Longest text quoted from a record, such as a stuck detail. */
const DETAIL_MAX = 2000

/** Longest command output quoted: its end, where the error usually is. */
const OUTPUT_MAX = 1500

/** Engine log lines shown for a crash. */
const LOG_LINES = 25

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string =>
    typeof value === 'string' ? value : ''

const numberOr = (value: unknown): number | null =>
    typeof value === 'number' ? value : null

const listOf = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : []

const objectOf = (value: unknown): Record<string, unknown> =>
    isObject(value) ? value : {}

/** The first `max` characters, marked when cut. */
const clip = (value: string, max = DETAIL_MAX): string =>
    value.length > max ? `${value.slice(0, max)} ... (clipped)` : value

/** The last `max` characters, marked when cut. */
const clipEnd = (value: string, max = OUTPUT_MAX): string =>
    value.length > max ? `(clipped) ... ${value.slice(-max)}` : value

/** Each line of each entry, after `by`. */
const nest = (entries: string[], by: string): string[] =>
    entries.flatMap((entry) => entry.split('\n')).map((line) => `${by}${line}`)

const indent = (value: string, by = '    '): string =>
    value
        .split('\n')
        .map((line) => `${by}${line}`)
        .join('\n')

/** One journal line as a loose record, or `null` when it isn't one. */
const toRecord = (line: string): LooseRecord | null => {
    let json: unknown
    try {
        json = JSON.parse(line)
    } catch {
        return null
    }
    if (!isObject(json)) return null
    const seq = numberOr(json.seq)
    if (seq === null || typeof json.kind !== 'string') return null
    return {
        seq,
        time: text(json.time),
        kind: json.kind,
        ticket: numberOr(json.ticket),
        content: objectOf(json.content),
    }
}

/**
 * A run's records, oldest first. Lines that aren't records (such as a
 * half-written last line) are skipped. No journal gives none.
 */
export const readRecords = ({ file }: { file: string }): LooseRecord[] =>
    existsSync(file)
        ? readFileSync(file, 'utf8')
              .split('\n')
              .filter((line) => line.trim() !== '')
              .map(toRecord)
              .filter((record): record is LooseRecord => record !== null)
        : []

const ofKind = (records: LooseRecord[], kind: KindRead): LooseRecord[] =>
    records.filter((record) => record.kind === kind)

const lastOf = (
    records: LooseRecord[],
    kind: KindRead,
    where: (record: LooseRecord) => boolean = () => true
): LooseRecord | undefined => ofKind(records, kind).filter(where).at(-1)

/** Something that waits on the spec owner's reply. */
export type StuckItem = {
    /** The stuck ticket, or `null` for the final review or the whole run. */
    ticket: number | null
    what: 'ticket' | 'final_review' | 'run'
    /** The record that made it stuck, such as `ticket_stuck`. */
    kind: string
    reason: string
    detail: string
    seq: number
    /** A `retry` the engine refused (the edited ticket isn't ready). */
    refused: string[]
}

/**
 * What waits on the owner now: stuck tickets not yet retried or skipped,
 * a stuck final review not yet retried or shipped, and the run stuck on its
 * budget until a bare `retry`. Pure.
 */
export const openStuck = ({
    records,
}: {
    records: LooseRecord[]
}): StuckItem[] => {
    const tickets = new Map<number, StuckItem>()
    let final: StuckItem | null = null
    let run: StuckItem | null = null
    for (const record of records) {
        const { kind, ticket, content, seq } = record
        const item = (what: StuckItem['what']): StuckItem => ({
            ticket,
            what,
            kind,
            reason: text(content.reason),
            detail: text(content.detail),
            seq,
            refused: [],
        })
        if (kind === 'ticket_stuck' && ticket !== null) {
            tickets.set(ticket, item('ticket'))
        } else if (kind === 'ticket_retried' && ticket !== null) {
            const stuck = tickets.get(ticket)
            if (content.mode === 'refused' && stuck !== undefined) {
                stuck.refused = listOf(content.problems).map(text)
            } else {
                tickets.delete(ticket)
            }
        } else if (kind === 'ticket_skipped' && ticket !== null) {
            tickets.delete(ticket)
        } else if (kind === 'final_review_stuck') {
            final = item('final_review')
        } else if (
            kind === 'final_review_retried' ||
            kind === 'final_review_shipped'
        ) {
            final = null
        } else if (kind === 'run_stuck') {
            run = item('run')
        } else if (
            kind === 'reply_received' &&
            content.word === 'retry' &&
            content.ticket === null &&
            run !== null
        ) {
            run = null
        }
    }
    return [
        ...(run === null ? [] : [run]),
        ...[...tickets.values()],
        ...(final === null ? [] : [final]),
    ]
}

/** How the run stands, from its last records. Pure. */
export const runState = ({
    records,
}: {
    records: LooseRecord[]
}): { over: boolean; line: string } => {
    const pr = lastOf(records, 'pull_request_opened')
    if (pr !== undefined) {
        return { over: true, line: `It opened its PR: ${text(pr.content.url)}` }
    }
    const refused = lastOf(records, 'intake_refused')
    if (refused !== undefined) {
        const problems = listOf(refused.content.problems)
            .map(objectOf)
            .map(
                (problem) =>
                    `${problem.ticket === null ? 'the run' : `#${String(problem.ticket)}`} misses ${listOf(problem.missing).map(text).join(', ')}`
            )
        return {
            over: true,
            line: `Intake refused it: ${problems.join('; ') || 'see the spec issue'}.`,
        }
    }
    if (lastOf(records, 'nothing_to_do') !== undefined) {
        return { over: true, line: 'It ended with nothing to do.' }
    }
    const stopped = lastOf(records, 'run_stopped')
    const resumed = lastOf(records, 'engine_resumed')
    if (stopped !== undefined) {
        const reason = text(stopped.content.reason)
        if (stopped.content.billing === true) {
            return {
                over: true,
                line: `It stopped for good on a billing sign: ${reason}`,
            }
        }
        if (stopped.content.crashed === true) {
            return {
                over: true,
                line: `It stopped for good: the same step crashed again and again. ${reason}`,
            }
        }
        if (resumed === undefined || resumed.seq < stopped.seq) {
            return {
                over: false,
                line: `The launcher stopped it: ${reason}`,
            }
        }
    }
    const stop = lastOf(
        records,
        'reply_received',
        ({ content }) => content.word === 'stop'
    )
    if (stop !== undefined) {
        return {
            over: true,
            line: `The owner replied stop (${text(stop.content.author)}), so it ends without a PR.`,
        }
    }
    const wait = lastOf(records, 'limit_wait_started')
    const waited = lastOf(records, 'limit_wait_ended')
    if (wait !== undefined && (waited === undefined || waited.seq < wait.seq)) {
        return {
            over: false,
            line: `It waits for a plan limit until ${text(wait.content.until)}. That is not stuck: it goes on by itself.`,
        }
    }
    return { over: false, line: 'It is not over.' }
}

/** The steps a crash cut off: started, never ended. Pure. */
export const cutOffSteps = ({
    records,
}: {
    records: LooseRecord[]
}): { key: string; step: string; seq: number }[] => {
    const open = new Map<string, { key: string; step: string; seq: number }>()
    for (const { kind, content, seq } of records) {
        const key = text(content.key)
        if (kind === 'step_started') {
            open.set(key, { key, step: text(content.step), seq })
        } else if (kind === 'step_ended') {
            open.delete(key)
        }
    }
    return [...open.values()]
}

/** `owner/repo` from a GitHub issue URL, or `null`. Pure. */
export const repoOfUrl = (url: string): string | null =>
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\//.exec(url)?.[1] ?? null

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
const finalReviewLines = ({
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
            lines.push(`${role}'s open findings (#${record.seq}):`, ...findings)
        }
    }
    const failed = lastOf(run_level, 'agent_failed')
    if (failed !== undefined) {
        lines.push(
            `Last failed try (#${failed.seq}): ${text(failed.content.role)} (${text(failed.content.failure) || 'agent'})`,
            indent(clip(text(failed.content.error), 800))
        )
    }
    const gates = lastOf(run_level, 'gates_run')
    if (gates !== undefined && gates.content.ok === false) {
        lines.push(
            `Last gates on the run branch failed (#${gates.seq}):`,
            ...listOf(gates.content.checks)
                .map(objectOf)
                .filter((check) => check.ok === false)
                .flatMap(checkLines)
        )
    }
    return lines
}

/** What the journal says about one stuck ticket. Pure. */
const ticketLines = ({
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
        lines.push(`Last agent result (#${agent.seq}): ${role} ${outcome}`)
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
            `Last failed try (#${failed.seq}): ${text(failed.content.role)} (${text(failed.content.failure) || 'agent'})`,
            indent(clip(text(failed.content.error), 800))
        )
    }
    const prepared = lastOf(mine, 'baseline_prepared')
    const prepare_check = objectOf(prepared?.content.check)
    if (prepared !== undefined && prepare_check.ok === false) {
        lines.push(
            `Prepare failed (#${prepared.seq}):`,
            ...checkLines(prepare_check)
        )
    }
    const red = lastOf(mine, 'red_check')
    if (red !== undefined && red.content.ok === false) {
        lines.push(
            `Last red check failed (#${red.seq}):`,
            ...listOf(red.content.problems).map(
                (p) => `  - ${clip(text(p), 600)}`
            )
        )
    }
    const evidence = lastOf(mine, 'already_done_checked')
    if (evidence !== undefined && evidence.content.ok === false) {
        lines.push(
            `already_done evidence did not check out (#${evidence.seq}):`,
            ...listOf(evidence.content.problems).map(
                (p) => `  - ${clip(text(p), 600)}`
            )
        )
    }
    const gates = lastOf(mine, 'gates_run')
    if (gates !== undefined && gates.content.ok === false) {
        lines.push(
            `Last gates failed (#${gates.seq}, on the ${text(gates.content.target) === 'run_branch' ? 'run branch' : 'ticket worktree'}):`,
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
            `Rebased onto the run branch (#${rebased.seq}, ${text(rebased.content.cause)}): clashed tests ${listOf(rebased.content.tests).map(text).join(', ') || 'none'}; clashed code ${listOf(rebased.content.code).map(text).join(', ') || 'none'}`
        )
    }
    const sent = lastOf(mine, 'tests_sent_back')
    if (sent !== undefined) {
        const bad = objectOf(sent.content.bad_test)
        lines.push(
            `tests_sent_back round ${String(sent.content.round)} (#${sent.seq}): ${text(bad.file)} > ${text(bad.name)}`,
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

/** The replies and answers since something got stuck. Pure. */
const replyLines = ({
    records,
    since,
}: {
    records: LooseRecord[]
    since: number
}): string[] =>
    records
        .filter((record) => record.seq > since)
        .flatMap((record): string[] => {
            const { kind, content, seq } = record
            if (kind === 'stuck_reported') {
                return [
                    `#${seq} stuck_reported: comment ${String(content.comment_id)}`,
                ]
            }
            if (kind === 'comment_read') {
                return [
                    `#${seq} comment_read by ${text(content.author)}: ${clip(text(content.body).replace(/\s+/g, ' '), 200)}`,
                ]
            }
            if (kind === 'reply_received') {
                return [
                    `#${seq} reply_received: ${text(content.word)}${content.ticket === null ? '' : ` #${String(content.ticket)}`} from ${text(content.author)}`,
                ]
            }
            if (kind === 'reply_ignored') {
                return [`#${seq} reply_ignored: ${text(content.reason)}`]
            }
            if (kind === 'ticket_retried') {
                return [
                    `#${seq} ticket_retried #${String(record.ticket)}: ${text(content.mode)}${listOf(content.problems).length === 0 ? '' : ` (${listOf(content.problems).map(text).join('; ')})`}`,
                ]
            }
            if (
                kind === 'ticket_skipped' ||
                kind === 'final_review_retried' ||
                kind === 'final_review_shipped'
            ) {
                return [
                    `#${seq} ${kind}${record.ticket === null ? '' : ` #${record.ticket}`}`,
                ]
            }
            return []
        })

/** The board's registry entry for a run, without its token. */
export type RegistryEntry = {
    spec: number | null
    repo: string | null
    log_path: string | null
    ended: { ok: boolean; message: string } | null
    restarts: number | null
}

/** A run's entry in the board's run registry, or `null`. */
export const registryEntry = ({
    registry,
    run_id,
}: {
    registry: string
    run_id: string
}): RegistryEntry | null => {
    if (!existsSync(registry)) return null
    let json: unknown
    try {
        json = JSON.parse(readFileSync(registry, 'utf8'))
    } catch {
        return null
    }
    const entry = listOf(objectOf(json).runs)
        .map(objectOf)
        .find((run) => run.run_id === run_id)
    if (entry === undefined) return null
    const ended = objectOf(entry.ended)
    return {
        spec: numberOr(entry.spec),
        repo: text(entry.repo) || null,
        log_path: text(entry.log_path) || null,
        ended: isObject(entry.ended)
            ? { ok: ended.ok === true, message: text(ended.message) }
            : null,
        restarts: numberOr(entry.restarts),
    }
}

/** Whether a run's engine is running now, from `ps`; `null` when unknown. */
export const engineRunning = ({
    run_id,
    command_lines,
}: {
    run_id: string
    command_lines: string[] | null
}): boolean | null => {
    if (command_lines === null) return null
    return command_lines.some((line) => {
        const tokens = line.split(/\s+/)
        return tokens.some(
            (token, index) =>
                ((token === '--run-id' || token === '--resume') &&
                    tokens[index + 1] === run_id) ||
                token === `--run-id=${run_id}` ||
                token === `--resume=${run_id}`
        )
    })
}

/** Every process's command line, or `null` when `ps` fails. */
const commandLines = (): string[] | null => {
    const ps = Bun.spawnSync(['ps', '-axww', '-o', 'command='])
    return ps.exitCode === 0 ? ps.stdout.toString().split('\n') : null
}

/** The last lines of the engine's log, or `null` when it can't be read. */
const logTail = (path: string | null): string | null => {
    if (path === null || !existsSync(path)) return null
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n')
    return lines.slice(-LOG_LINES).join('\n')
}

/**
 * The summary of one run, as plain text: the run, how its engine stands,
 * then each stuck item with what the journal says about it and the replies
 * since. `ticket` limits it to that ticket. Pure.
 */
export const formatSummary = ({
    run_id,
    records,
    ticket = null,
    registry = null,
    running = null,
    log_tail = null,
}: {
    run_id: string
    records: LooseRecord[]
    ticket?: number | null
    registry?: RegistryEntry | null
    running?: boolean | null
    log_tail?: string | null
}): string => {
    if (records.length === 0) return `Run ${run_id}: no journal records.`
    const started = objectOf(lastOf(records, 'run_started')?.content)
    // The snapshot once intake passed, else the spec as intake read it.
    const spec = objectOf(
        objectOf(
            (lastOf(records, 'spec_snapshot') ?? lastOf(records, 'intake_read'))
                ?.content
        ).spec
    )
    const resumed = lastOf(records, 'engine_resumed')
    const branch = lastOf(records, 'run_branch_created')
    const state = runState({ records })
    const stuck = openStuck({ records }).filter(
        (item) =>
            ticket === null || item.ticket === ticket || item.what !== 'ticket'
    )
    const cut = cutOffSteps({ records })
    const lines: string[] = [
        `Run ${run_id}: spec #${String(started.spec_number ?? spec.number ?? '?')}${text(spec.title) === '' ? '' : ` "${text(spec.title)}"`}`,
        `Repo: ${text(started.repo) || registry?.repo || '?'}${repoOfUrl(text(spec.url)) === null ? '' : ` (${repoOfUrl(text(spec.url))})`}`,
        `Spec owner: ${text(spec.author) || '? (read it with gh issue view)'}`,
        `Luca: started on ${text(started.luca_version) || '?'}${resumed === undefined ? '' : `, last resumed on ${text(resumed.content.luca_version)}`}`,
    ]
    if (branch !== undefined) {
        lines.push(
            `Run branch: ${text(branch.content.branch)} at ${text(branch.content.path)}`
        )
    }
    const last = records.at(-1)
    if (last !== undefined) {
        lines.push(`Last record: #${last.seq} ${last.kind} at ${last.time}`)
    }
    lines.push(`State: ${state.line}`)
    lines.push(
        `Engine: ${running === null ? 'unknown (ps failed)' : running ? 'running now, so it will read a reply within about a minute' : 'not running, so nothing reads replies until the run is resumed'}`
    )
    if (registry !== null) {
        lines.push(
            `Board: started by the board${registry.ended === null ? '' : `; it ended: ${registry.ended.message}`}${registry.restarts === null ? '' : `; automatic restarts: ${registry.restarts}`}`
        )
        if (registry.log_path !== null) {
            lines.push(`Engine log: ${registry.log_path}`)
        }
    } else {
        lines.push(
            'Board: not in the board registry (started from a terminal?)'
        )
    }
    if (running === false && !state.over && cut.length > 0) {
        lines.push(
            `Cut off (started, never ended): ${cut.map((step) => `${step.step} on ${step.key} (#${step.seq})`).join('; ')}`
        )
    }
    if (log_tail !== null && registry?.ended?.ok === false && !state.over) {
        lines.push('Engine log, last lines:', indent(log_tail))
    }
    if (stuck.length === 0) {
        lines.push(
            ticket === null
                ? 'Stuck now: nothing waits on a reply.'
                : `Stuck now: #${ticket} doesn't wait on a reply.`
        )
        return lines.join('\n')
    }
    lines.push('Stuck now:')
    for (const item of stuck) {
        const title =
            item.ticket === null
                ? ''
                : text(
                      lastOf(
                          records,
                          'ticket_snapshot',
                          ({ content }) => content.number === item.ticket
                      )?.content.title
                  )
        const head =
            item.what === 'ticket'
                ? `Ticket #${String(item.ticket)}${title === '' ? '' : ` "${title}"`}`
                : item.what === 'final_review'
                  ? 'The final review'
                  : 'The whole run'
        lines.push(
            '',
            `${head}: ${item.reason} (${item.kind} #${item.seq})`,
            indent(`detail: ${clip(item.detail)}`)
        )
        if (item.refused.length > 0) {
            lines.push(`  A retry was refused: ${item.refused.join('; ')}`)
        }
        if (item.what === 'ticket') {
            lines.push(...nest(ticketLines({ records, item }), '  '))
        } else if (item.what === 'final_review') {
            lines.push(...nest(finalReviewLines({ records }), '  '))
        }
        const replies = replyLines({ records, since: item.seq })
        lines.push(
            replies.length === 0
                ? '  Replies since: none yet'
                : '  Since then:',
            ...nest(replies, '    ')
        )
    }
    return lines.join('\n')
}

/** One run of a repo, for picking the one that needs you. */
export type RunChoice = {
    run_id: string
    started: string
    spec: number | null
    over: boolean
    stuck: number
}

/**
 * The runs of `repo` in `runs_dir`, newest first, with how many things
 * wait on a reply in each. A run's repo is its `run_started` repo; it
 * matches any of `repos`, symlinks followed.
 */
export const repoRuns = ({
    runs_dir,
    repos,
}: {
    runs_dir: string
    repos: string[]
}): RunChoice[] => {
    if (!existsSync(runs_dir)) return []
    const want = new Set(repos.map(realPath))
    return readdirSync(runs_dir)
        .map((run_id) => ({
            run_id,
            records: readRecords({
                file: join(runs_dir, run_id, 'journal.jsonl'),
            }),
        }))
        .filter(({ records }) => {
            const started = records.find((r) => r.kind === 'run_started')
            return (
                started !== undefined &&
                want.has(realPath(text(started.content.repo) || '/'))
            )
        })
        .map(({ run_id, records }) => ({
            run_id,
            started: records[0]?.time ?? '',
            spec: numberOr(
                records.find((r) => r.kind === 'run_started')?.content
                    .spec_number
            ),
            over: runState({ records }).over,
            stuck: openStuck({ records }).length,
        }))
        .toSorted((a, b) => b.started.localeCompare(a.started))
}

/** The flags, read. */
export type SummaryArgs = {
    run_id: string | null
    ticket: number | null
    repo: string | null
    runs_dir: string
    registry: string
    /** `--watch <seq>`: wait for the engine to take a reply posted after it. */
    watch: number | null
    /** How long `--watch` waits, in seconds. */
    timeout_s: number
}

/** How long `--watch` waits by default: the engine reads replies every minute. */
const WATCH_TIMEOUT_S = 180

/** How often `--watch` reads the journal again. */
const WATCH_POLL_MS = 5000

/** Reads the flags; `env` gives the default folders. Pure. */
export const parseArgs = ({
    argv,
    env,
    home,
}: {
    argv: string[]
    env: Record<string, string | undefined>
    home: string
}): SummaryArgs => {
    const args: SummaryArgs = {
        run_id: null,
        ticket: null,
        repo: null,
        runs_dir:
            env.LUCA_RUNS_DIR ?? join(home, '.local', 'state', 'luca', 'runs'),
        registry: join(
            env.LUCA_BOARD_STATE_DIR || join(home, '.local/state/luca/board'),
            'runs.json'
        ),
        watch: null,
        timeout_s: WATCH_TIMEOUT_S,
    }
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i] ?? ''
        const value = argv[i + 1]
        if (arg === '--repo' && value !== undefined) {
            args.repo = value
            i += 1
        } else if (arg === '--runs-dir' && value !== undefined) {
            args.runs_dir = value
            i += 1
        } else if (arg === '--registry' && value !== undefined) {
            args.registry = value
            i += 1
        } else if (arg === '--watch' && value !== undefined) {
            args.watch = Number(value)
            i += 1
        } else if (arg === '--timeout-s' && value !== undefined) {
            args.timeout_s = Number(value)
            i += 1
        } else if (/^#?\d+$/.test(arg)) {
            args.ticket = Number(arg.replace('#', ''))
        } else if (arg !== '' && !arg.startsWith('-')) {
            args.run_id = arg
        }
    }
    return args
}

/**
 * How the engine took a reply posted after record `after`: `done` once it
 * took it and acted (a retry, a skip, a ship, a stop, or an answer that it
 * can't use), `taken` once it only took it, `waiting` before that. `lines`
 * are the records that tell. Pure.
 */
export const replyOutcome = ({
    records,
    after,
}: {
    records: LooseRecord[]
    after: number
}): { status: 'waiting' | 'taken' | 'done'; lines: string[] } => {
    const since = records.filter((record) => record.seq > after)
    const lines = replyLines({ records: since, since: after })
    const acted = since.find((record) =>
        [
            'reply_ignored',
            'ticket_retried',
            'ticket_skipped',
            'final_review_retried',
            'final_review_shipped',
        ].includes(record.kind)
    )
    const taken = since.find((record) => record.kind === 'reply_received')
    const run_level =
        taken !== undefined &&
        (taken.content.word === 'stop' ||
            (taken.content.word === 'retry' && taken.content.ticket === null))
    return {
        status:
            acted !== undefined || run_level
                ? 'done'
                : taken !== undefined
                  ? 'taken'
                  : 'waiting',
        lines,
    }
}

/**
 * Reads the journal every few seconds until the engine took the reply and
 * acted, or `timeout_s` passed. Returns the exit code: 0 when done.
 */
const watchReply = async ({
    file,
    after,
    timeout_s,
}: {
    file: string
    after: number
    timeout_s: number
}): Promise<number> => {
    const until = Date.now() + timeout_s * 1000
    for (;;) {
        const outcome = replyOutcome({ records: readRecords({ file }), after })
        if (outcome.status === 'done' || Date.now() >= until) {
            console.log(
                outcome.status === 'done'
                    ? 'The engine took the reply:'
                    : outcome.status === 'taken'
                      ? `The engine took the reply, but hasn't acted on it yet after ${timeout_s} s:`
                      : `The engine hasn't taken a reply after ${timeout_s} s.`
            )
            for (const line of outcome.lines) console.log(`  ${line}`)
            return outcome.status === 'done' ? 0 : 1
        }
        await Bun.sleep(WATCH_POLL_MS)
    }
}

/**
 * A path with its symlinks followed (`/tmp` is `/private/tmp` on macOS), or
 * just made absolute when it doesn't exist.
 */
const realPath = (path: string): string => {
    try {
        return realpathSync(path)
    } catch {
        return resolve(path)
    }
}

/**
 * The repos a run started from `cwd` may name, real paths, main first: the
 * main checkout (a run's repo is the main checkout), then the git top folder
 * (a worktree's own, or a subfolder's repo). Outside git, `cwd` itself. A
 * bare repo or a submodule has no `<checkout>/.git` common dir, so it adds
 * no main checkout, only its top folder.
 *
 * Its twin is `currentRepos` in `luca-retro/scripts/retro-summary.ts`: each skill folder is installed
 * to `~/.claude/skills/` on its own, so they can't share a file. Keep the two
 * the same; a test in each pins it.
 *
 * @example
 * currentRepos({ cwd: '/code/app-worktree' }) // ['/code/app', '/code/app-worktree']
 */
export const currentRepos = ({ cwd }: { cwd: string }): string[] => {
    const git = (...args: string[]) => {
        const out = Bun.spawnSync(['git', '-C', cwd, ...args])
        const said = out.stdout.toString().trim()
        return out.exitCode === 0 && said !== '' ? said : null
    }
    const top = git('rev-parse', '--show-toplevel')
    const common = git(
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir'
    )
    const main =
        common !== null && basename(common) === '.git' ? dirname(common) : null
    return [main, top ?? cwd]
        .filter((repo) => repo !== null)
        .map(realPath)
        .filter((repo, index, all) => all.indexOf(repo) === index)
}

const main = async () => {
    const args = parseArgs({
        argv: Bun.argv.slice(2),
        env: process.env,
        home: homedir(),
    })
    if (args.watch !== null) {
        if (args.run_id === null || Number.isNaN(args.watch)) {
            console.error('Usage: stuck-summary.ts <run id> --watch <seq>')
            process.exit(2)
        }
        process.exit(
            await watchReply({
                file: join(args.runs_dir, args.run_id, 'journal.jsonl'),
                after: args.watch,
                timeout_s: args.timeout_s,
            })
        )
    }
    let run_id = args.run_id
    if (run_id === null) {
        const repos =
            args.repo === null
                ? currentRepos({ cwd: process.cwd() })
                : [args.repo]
        const runs = repoRuns({ runs_dir: args.runs_dir, repos })
        if (runs.length === 0) {
            console.log(
                `No Luca runs of ${repos.join(' or ')} in ${args.runs_dir}.`
            )
            return
        }
        console.log(`Runs of ${repos[0]}, newest first:`)
        for (const run of runs.slice(0, 10)) {
            console.log(
                `- ${run.run_id}: spec #${run.spec ?? '?'}, started ${run.started}, ${run.over ? 'over' : 'not over'}, ${run.stuck} waiting on a reply`
            )
        }
        const pick =
            runs.find((run) => run.stuck > 0 && !run.over) ??
            runs.find((run) => !run.over) ??
            runs[0]
        if (pick === undefined) return
        run_id = pick.run_id
        console.log(`\nThe one that needs you most: ${run_id}\n`)
    }
    const records = readRecords({
        file: join(args.runs_dir, run_id, 'journal.jsonl'),
    })
    const registry = registryEntry({ registry: args.registry, run_id })
    console.log(
        formatSummary({
            run_id,
            records,
            ticket: args.ticket,
            registry,
            running: engineRunning({ run_id, command_lines: commandLines() }),
            log_tail: logTail(registry?.log_path ?? null),
        })
    )
}

if (import.meta.main) await main()
