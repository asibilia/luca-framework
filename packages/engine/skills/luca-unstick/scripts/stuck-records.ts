/**
 * The `/luca-unstick` helper's journal reading: the record kinds it reads,
 * records read loosely, what waits on the owner (`openStuck`), a stuck
 * item's retry history (`retryHistory`), how the run stands (`runState`),
 * the board's registry entry, and whether the engine runs.
 * `stuck-summary.ts` prints them.
 *
 * Like the rest of the helper, it imports nothing but Bun's and Node's own
 * modules: it runs from `~/.claude/skills/luca-unstick/`, where no packages
 * are installed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Every journal record kind the helper reads. */
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
    'final_review_started',
    'ticket_stuck',
    'run_stuck',
    'final_review_stuck',
    'stuck_reported',
    'auto_retried',
    'comment_read',
    'reply_received',
    'reply_ignored',
    'ticket_retried',
    'ticket_skipped',
    'final_review_retried',
    'final_review_shipped',
    'run_stopped',
    'pull_request_opened',
    'run_ended',
    'limit_wait_started',
    'limit_wait_ended',
    'step_started',
    'step_ended',
] as const

export type KindRead = (typeof KINDS_READ)[number]

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

export const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

export const text = (value: unknown): string =>
    typeof value === 'string' ? value : ''

export const numberOr = (value: unknown): number | null =>
    typeof value === 'number' ? value : null

export const listOf = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : []

export const objectOf = (value: unknown): Record<string, unknown> =>
    isObject(value) ? value : {}

/** The first `max` characters, marked when cut. */
export const clip = (value: string, max = DETAIL_MAX): string =>
    value.length > max ? `${value.slice(0, max)} ... (clipped)` : value

/** The last `max` characters, marked when cut. */
export const clipEnd = (value: string, max = OUTPUT_MAX): string =>
    value.length > max ? `(clipped) ... ${value.slice(-max)}` : value

/** A journal record's seq as `seq 123`, never `#123`, which GitHub links. */
export const seqText = (seq: number): string => `seq ${seq}`

/** Each line of each entry, after `by`. */
export const nest = (entries: string[], by: string): string[] =>
    entries.flatMap((entry) => entry.split('\n')).map((line) => `${by}${line}`)

export const indent = (value: string, by = '    '): string =>
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

export const ofKind = (records: LooseRecord[], kind: KindRead): LooseRecord[] =>
    records.filter((record) => record.kind === kind)

export const lastOf = (
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
 * budget until a bare `retry`. The engine's own retry (`auto_retried`,
 * #705) counts as the owner's: the run's carries it on at once, and a
 * ticket or the final review waits for its usual retry record. Pure.
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
            (kind === 'reply_received' &&
                content.word === 'retry' &&
                content.ticket === null &&
                run !== null) ||
            (kind === 'auto_retried' && content.item === 'run')
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

/** What `/luca-watch` counts before it answers a stuck item itself (#702). */
export type RetryHistory = {
    /** The item's `auto_retried` records, in the whole run. */
    auto_retried: number
    /**
     * How each failed try since the item's last retry failed, per role,
     * oldest first; an `engine` failure is no try. Empty for the run.
     */
    failed_kinds: [role: string, kinds: string[]][]
    /** The run's `run_budget` stucks before this one; 0 for a ticket or the final review. */
    budget_stucks_before: number
}

/**
 * How each failed try of `item` failed since its last retry, per role: a
 * ticket's since its last `ticket_retried` that wasn't refused (a failed
 * `already_done` check is an `evidence` try for the test-writer), the final
 * review's since its last `final_review_retried`. Pure.
 */
const failedKindsSinceRetry = ({
    records,
    item,
}: {
    records: LooseRecord[]
    item: StuckItem
}): RetryHistory['failed_kinds'] => {
    const kinds = new Map<string, string[]>()
    const failed = (role: string, failure: string) =>
        kinds.set(role, [...(kinds.get(role) ?? []), failure])
    let final_started = false
    for (const { kind, ticket, content } of records) {
        if (kind === 'final_review_started') final_started = true
        const mine =
            item.what === 'ticket'
                ? ticket === item.ticket
                : item.what === 'final_review' && ticket === null
        if (!mine) continue
        if (
            kind === 'agent_failed' &&
            content.failure !== 'engine' &&
            (item.what === 'ticket' || final_started)
        ) {
            failed(text(content.role), text(content.failure) || 'agent')
        } else if (
            kind === 'already_done_checked' &&
            content.ok === false &&
            item.what === 'ticket'
        ) {
            failed('test-writer', 'evidence')
        } else if (
            (kind === 'ticket_retried' && content.mode !== 'refused') ||
            kind === 'final_review_retried'
        ) {
            kinds.clear()
        }
    }
    return [...kinds.entries()]
}

/**
 * A stuck item's retry history, for `/luca-watch`'s budget of two
 * unattended retries per item and its first-`run_budget` rule: the
 * engine's own retries of it, how its failed tries since its last retry
 * failed, and the `run_budget` stucks before it. Pure.
 */
export const retryHistory = ({
    records,
    item,
}: {
    records: LooseRecord[]
    item: StuckItem
}): RetryHistory => ({
    auto_retried: ofKind(records, 'auto_retried').filter(
        ({ ticket, content }) =>
            content.item === item.what &&
            (item.what !== 'ticket' || ticket === item.ticket)
    ).length,
    failed_kinds: failedKindsSinceRetry({ records, item }),
    budget_stucks_before:
        item.what === 'run'
            ? ofKind(records, 'run_stuck').filter(
                  ({ content, seq }) =>
                      content.reason === 'run_budget' && seq < item.seq
              ).length
            : 0,
})

/**
 * How the run stands, from its last records: its one `run_ended` (#706)
 * first, then the endings of runs from before it. Pure.
 */
export const runState = ({
    records,
}: {
    records: LooseRecord[]
}): { over: boolean; line: string } => {
    const ended = lastOf(records, 'run_ended')
    if (ended !== undefined) {
        const url = text(ended.content.url)
        return {
            over: true,
            line: `It ended (${text(ended.content.outcome)}): ${text(ended.content.detail)}${url === '' ? '' : ` ${url}`}`,
        }
    }
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

/**
 * A live file written at most this long ago means a live engine: the
 * board's `LIVE_STALE_MS` (`packages/board/shared/board-state-live.ts`).
 * The engine writes it at least every 5 seconds while it runs.
 */
export const LIVE_STALE_MS = 60_000

/**
 * Whether a run's engine is running now; `null` when unknown. It runs when
 * its live file was written at most `LIVE_STALE_MS` before `now`, or a
 * command line from `ps` names the run. An engine started with
 * `luca-run --spec <n>` and no `--run-id` names no run id (#727), so only
 * its live file shows it, as the board checks.
 */
export const engineRunning = ({
    run_id,
    command_lines,
    live_written_at,
    now,
}: {
    run_id: string
    command_lines: string[] | null
    /** The live file's `written_at` (`liveWrittenAt`), or `null`. */
    live_written_at: string | null
    now: number
}): boolean | null => {
    const written =
        live_written_at === null ? Number.NaN : Date.parse(live_written_at)
    if (Number.isFinite(written) && now - written <= LIVE_STALE_MS) return true
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

/**
 * The `written_at` of run `run_id`'s live file (`live.json`, kept by the
 * engine while it runs), or `null` when it is missing or unreadable.
 */
export const liveWrittenAt = ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): string | null => {
    const file = join(runs_dir, run_id, 'live.json')
    if (!existsSync(file)) return null
    try {
        const live: unknown = JSON.parse(readFileSync(file, 'utf8'))
        return isObject(live) && typeof live.written_at === 'string'
            ? live.written_at
            : null
    } catch {
        return null
    }
}

/** Every process's command line, or `null` when `ps` fails. */
export const commandLines = (): string[] | null => {
    const ps = Bun.spawnSync(['ps', '-axww', '-o', 'command='])
    return ps.exitCode === 0 ? ps.stdout.toString().split('\n') : null
}

/** The last lines of the engine's log, or `null` when it can't be read. */
export const logTail = (path: string | null): string | null => {
    if (path === null || !existsSync(path)) return null
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n')
    return lines.slice(-LOG_LINES).join('\n')
}
