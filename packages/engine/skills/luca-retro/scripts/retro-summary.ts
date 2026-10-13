#!/usr/bin/env bun
/**
 * Prints what went wrong in finished Luca runs, from their journals, for the
 * `/luca-retro` skill:
 *
 *   bun retro-summary.ts [run id ...] [--repo <path>] [--runs-dir <dir>]
 *
 * With no run id, it sums up the newest finished run of the repo (`--repo`,
 * else the git repo of the current folder, or the main checkout of the
 * worktree it is in). With several, it sums up each, then the patterns that
 * repeat across them.
 *
 * Each summary names the journal's seq numbers (`#123`), so the skill can
 * cite them: what got stuck and why, fix loops that hit their cap, leftover
 * scan hits, agents out of turns, failed agent turns, Jev calls that failed,
 * checks and tests that failed again and again, setup changes agents asked
 * for, joins and rebases, the run budget, replies, the agents' assumptions,
 * the findings fixers declined, slow steps, and tokens.
 *
 * It only reads the journal (`<runs folder>/<run id>/journal.jsonl`). It
 * changes nothing.
 *
 * It imports nothing but Bun's and Node's own modules: it runs from
 * `~/.claude/skills/luca-retro/`, where no packages are installed. So it
 * reads records loosely, not with the engine's Zod schemas.
 * `retro-summary.test.ts` checks it against journals built with the engine's
 * own fixtures, and every kind in `KINDS_READ` against the journal's kinds,
 * so the two can't drift apart unseen.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Every journal record kind this script reads. */
export const KINDS_READ = [
    'run_started',
    'engine_resumed',
    'config_reloaded',
    'run_resumed',
    'intake_read',
    'spec_snapshot',
    'ticket_snapshot',
    'intake_refused',
    'nothing_to_do',
    'agent_finished',
    'agent_failed',
    'agent_session',
    'red_check',
    'leftover_scan',
    'gates_run',
    'ticket_joined',
    'ticket_rebased',
    'tests_sent_back',
    'join_undone',
    'ticket_stuck',
    'run_stuck',
    'final_review_stuck',
    'reply_received',
    'reply_ignored',
    'run_stopped',
    'pull_request_opened',
    'jev_asked',
    'jev_failed',
    'usage_recorded',
    'shared_git_changed',
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

/** The most entries a list prints before "... and N more". */
const LIST_MAX = 8

/** Longest text quoted from a record, such as a stuck detail. */
const DETAIL_MAX = 300

/** How many step types the slow steps list shows. */
const SLOW_STEPS_MAX = 8

// NOTE: these small readers are copies of the ones in
// `../../luca-unstick/scripts/stuck-summary.ts`: each skill's script must
// stand alone. Keep the two in step.

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

/** One line, at most `max` characters, marked when cut. */
const clip = (value: string, max = DETAIL_MAX): string => {
    const line = value.replace(/\s+/g, ' ').trim()
    return line.length > max ? `${line.slice(0, max)} ...` : line
}

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

const msBetween = (from: string, to: string): number =>
    Math.max(0, Date.parse(to) - Date.parse(from)) || 0

/**
 * A duration in words: `1h 02m`, `4m 05s`, `12s`.
 *
 * @example
 * durationText(3_725_000) // '1h 02m'
 */
export const durationText = (ms: number): string => {
    const s = Math.round(ms / 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    if (s >= 3600)
        return `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m`
    if (s >= 60) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`
    return `${s}s`
}

/**
 * A token count in words: `9.48M`, `820k`, `512`.
 *
 * @example
 * tokensText(9_476_629) // '9.48M'
 */
export const tokensText = (n: number): string =>
    n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(2)}M`
        : n >= 1000
          ? `${Math.round(n / 1000)}k`
          : String(n)

/** One group of like things: how many, and the seqs of the records. */
export type Tally = { key: string; count: number; seqs: number[] }

/** Groups `items` by key, biggest group first. Pure. */
const tally = (items: { key: string; seq: number }[]): Tally[] => {
    const groups = new Map<string, Tally>()
    for (const { key, seq } of items) {
        const group = groups.get(key) ?? { key, count: 0, seqs: [] }
        group.count += 1
        group.seqs.push(seq)
        groups.set(key, group)
    }
    return [...groups.values()].toSorted((a, b) => b.count - a.count)
}

/** Seqs as `#1, #2, #3`, at most `max`. */
const seqsText = (seqs: number[], max = 6): string =>
    seqs.length > max
        ? `${seqs
              .slice(0, max)
              .map((seq) => `#${seq}`)
              .join(', ')}, +${seqs.length - max}`
        : seqs.map((seq) => `#${seq}`).join(', ')

/** The first `LIST_MAX` lines, then how many more there are. */
const capped = (lines: string[], max = LIST_MAX): string[] =>
    lines.length > max
        ? [...lines.slice(0, max), `... and ${lines.length - max} more`]
        : lines

/** Tokens as the run budget counts them: input, output, and cache writes. */
const countedTokens = (tokens: Record<string, unknown>): number =>
    (numberOr(tokens.input_tokens) ?? 0) +
    (numberOr(tokens.output_tokens) ?? 0) +
    (numberOr(tokens.cache_creation_input_tokens) ?? 0)

/** Something that got stuck, and the owner's reply to it. */
export type StuckEvent = {
    seq: number
    kind: string
    ticket: number | null
    reason: string
    detail: string
    /** The cap a fix loop hit, from the detail: `3 fix rounds`, `3 rebases`. */
    cap: string | null
    reply: { seq: number; word: string; wait_ms: number } | null
}

/** A test or check that failed, from failing gates. */
export type GateFailures = {
    runs: number
    failed: number
    /** By check name (`test`, `types`, `prepare (timed out)`, ...). */
    by_check: Tally[]
    /** By test name, from `(fail)` lines in a test check's output. */
    by_test: Tally[]
}

/** One step type's times, from `step_started` to `step_ended`. */
export type StepTimes = {
    step: string
    count: number
    total_ms: number
    max_ms: number
    max_seq: number
    max_ticket: number | null
}

/** One agent role's sessions: turns, tokens, time. */
export type RoleUse = {
    role: string
    sessions: number
    counted: number
    turns: number
    max_turns: number
    duration_ms: number
}

/** An agent turn's text, such as an assumption or a declined finding. */
export type AgentNote = {
    seq: number
    ticket: number | null
    role: string
    text: string
}

/** One kind of pattern, for spotting repeats across runs. */
export type Signal = { key: string; count: number }

/** Everything `/luca-retro` reads from one run's journal. */
export type RunSummary = {
    spec: { number: number | null; title: string; url: string }
    repo: string
    luca: string[]
    started: string
    ended: string
    last_seq: number
    over: boolean
    ending: string
    tickets: Map<number, string>
    stuck: StuckEvent[]
    leftovers: { scans: number; by_path: Tally[]; reasons: Tally[] }
    out_of_turns: AgentNote[]
    no_session: AgentNote[]
    other_failures: AgentNote[]
    jev: { asked: number; failed: Tally[]; jobs: Tally[] }
    gates: GateFailures
    red_checks: { runs: number; failed: number }
    setup_changes: AgentNote[]
    joins: {
        ok: number
        failed: { seq: number; ticket: number | null }[]
        rebases: Tally[]
        undone: { seq: number; ticket: number | null; shas: number }[]
        tests_sent_back: AgentNote[]
    }
    replies: { words: Tally[]; ignored: Tally[] }
    assumptions: {
        total: number
        by_role: Tally[]
        by_ticket: Tally[]
        notes: AgentNote[]
    }
    declined: { wont_fix: AgentNote[]; accepted: AgentNote[] }
    steps: StepTimes[]
    usage: {
        run: Record<string, unknown> | null
        agent_turns: number | null
        by_ticket: { ticket: number; counted: number }[]
        by_role: RoleUse[]
    }
    resumes: {
        seq: number
        version: string
        down_ms: number
        cut_off: number
    }[]
    config_reloaded: string[]
    shared_git_changed: number
    signals: Signal[]
}

/** How a run ended, from its last records; `over` when nothing more comes. */
const runEnding = ({
    records,
}: {
    records: LooseRecord[]
}): { over: boolean; line: string } => {
    const pr = lastOf(records, 'pull_request_opened')
    if (pr !== undefined) {
        return {
            over: true,
            line: `opened PR #${String(pr.content.number)} ${text(pr.content.url)} (#${pr.seq})`,
        }
    }
    const refused = lastOf(records, 'intake_refused')
    if (refused !== undefined) {
        return { over: true, line: `intake refused it (#${refused.seq})` }
    }
    const nothing = lastOf(records, 'nothing_to_do')
    if (nothing !== undefined) {
        return { over: true, line: `nothing to do (#${nothing.seq})` }
    }
    const stopped = lastOf(records, 'run_stopped')
    if (
        stopped !== undefined &&
        (stopped.content.billing === true || stopped.content.crashed === true)
    ) {
        return {
            over: true,
            line: `stopped for good (#${stopped.seq}): ${clip(text(stopped.content.reason))}`,
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
            line: `the owner replied stop (#${stop.seq}), no PR`,
        }
    }
    return { over: false, line: 'not over yet' }
}

/** Whether a run is over: a PR, a refusal, nothing to do, a stop. Pure. */
export const isFinished = ({ records }: { records: LooseRecord[] }): boolean =>
    runEnding({ records }).over

/**
 * The stuck records, each with the owner's reply to it: the next
 * `reply_received` for its ticket (or, for the final review or the run, the
 * next one naming no ticket).
 */
const stuckEvents = ({ records }: { records: LooseRecord[] }): StuckEvent[] =>
    records
        .filter(
            ({ kind }) =>
                kind === 'ticket_stuck' ||
                kind === 'final_review_stuck' ||
                kind === 'run_stuck'
        )
        .map((record) => {
            const detail = text(record.content.detail)
            const reply = records.find(
                (later) =>
                    later.seq > record.seq &&
                    later.kind === 'reply_received' &&
                    numberOr(later.content.ticket) === record.ticket
            )
            return {
                seq: record.seq,
                kind: record.kind,
                ticket: record.ticket,
                reason: text(record.content.reason),
                detail,
                cap:
                    /after (\d+ (?:fix rounds|rebases))/.exec(detail)?.[1] ??
                    null,
                reply:
                    reply === undefined
                        ? null
                        : {
                              seq: reply.seq,
                              word: text(reply.content.word),
                              wait_ms: msBetween(record.time, reply.time),
                          },
            }
        })

/** The tests a bun test output says failed, once each. */
const failedTests = (output: string): string[] => [
    ...new Set(
        [...output.matchAll(/^\(fail\) (.+?)(?: \[[\d.]+m?s\])?$/gm)].map(
            (match) => match[1] ?? ''
        )
    ),
]

/** Failing gates, by check and by test. Pure. */
const gateFailures = ({
    records,
}: {
    records: LooseRecord[]
}): GateFailures => {
    const gates = ofKind(records, 'gates_run')
    const checks: { key: string; seq: number }[] = []
    const tests: { key: string; seq: number }[] = []
    for (const gate of gates.filter(({ content }) => content.ok === false)) {
        for (const check of listOf(gate.content.checks).map(objectOf)) {
            if (check.ok !== false) continue
            const name = text(check.name) || 'check'
            checks.push({
                key: check.exit_code === null ? `${name} (timed out)` : name,
                seq: gate.seq,
            })
            for (const test of failedTests(text(check.output))) {
                tests.push({ key: test, seq: gate.seq })
            }
        }
    }
    return {
        runs: gates.length,
        failed: gates.filter(({ content }) => content.ok === false).length,
        by_check: tally(checks),
        by_test: tally(tests),
    }
}

/**
 * Each step type's times: from a `step_started` to the `step_ended` with the
 * same key. A step a crash cut off (no end) doesn't count. Slowest in total
 * first. Pure.
 */
export const stepTimes = ({
    records,
}: {
    records: LooseRecord[]
}): StepTimes[] => {
    const open = new Map<string, LooseRecord>()
    const times = new Map<string, StepTimes>()
    for (const record of records) {
        const key = text(record.content.key)
        if (record.kind === 'step_started') {
            open.set(key, record)
        } else if (record.kind === 'step_ended') {
            const start = open.get(key)
            if (start === undefined) continue
            open.delete(key)
            const step = text(start.content.step)
            const ms = msBetween(start.time, record.time)
            const entry = times.get(step) ?? {
                step,
                count: 0,
                total_ms: 0,
                max_ms: -1,
                max_seq: start.seq,
                max_ticket: start.ticket,
            }
            entry.count += 1
            entry.total_ms += ms
            if (ms > entry.max_ms) {
                entry.max_ms = ms
                entry.max_seq = start.seq
                entry.max_ticket = start.ticket
            }
            times.set(step, entry)
        }
    }
    return [...times.values()].toSorted((a, b) => b.total_ms - a.total_ms)
}

/** Each role's agent sessions: turns, counted tokens, and time. Pure. */
const roleUse = ({ records }: { records: LooseRecord[] }): RoleUse[] => {
    const roles = new Map<string, RoleUse>()
    for (const { content } of ofKind(records, 'agent_session')) {
        const role = text(content.role)
        const session = objectOf(content.session)
        const models = Object.values(objectOf(session.model_usage)).map(
            objectOf
        )
        const counted =
            models.length === 0
                ? countedTokens(objectOf(session.usage))
                : models.reduce((sum, tokens) => sum + countedTokens(tokens), 0)
        const turns = numberOr(session.num_turns) ?? 0
        const use = roles.get(role) ?? {
            role,
            sessions: 0,
            counted: 0,
            turns: 0,
            max_turns: 0,
            duration_ms: 0,
        }
        use.sessions += 1
        use.counted += counted
        use.turns += turns
        use.max_turns = Math.max(use.max_turns, turns)
        use.duration_ms += numberOr(session.duration_ms) ?? 0
        roles.set(role, use)
    }
    return [...roles.values()].toSorted((a, b) => b.counted - a.counted)
}

/** `#12` for a ticket, or `run` for none. */
const ticketText = (ticket: number | null): string =>
    ticket === null ? 'run' : `#${ticket}`

/** The folder of a repo-relative path, or `.` for the root. */
const folderOf = (path: string): string =>
    path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.'

/**
 * Everything `/luca-retro` reads from one run's records, oldest first.
 * Pure.
 *
 * @example
 * const summary = summarizeJournal({ records: readRecords({ file }) })
 * summary.stuck.map(({ reason }) => reason) // ['leftovers_found', 'run_budget']
 */
export const summarizeJournal = ({
    records,
}: {
    records: LooseRecord[]
}): RunSummary => {
    const started = objectOf(lastOf(records, 'run_started')?.content)
    const spec = objectOf(
        objectOf(
            (lastOf(records, 'spec_snapshot') ?? lastOf(records, 'intake_read'))
                ?.content
        ).spec
    )
    const ending = runEnding({ records })
    const tickets = new Map<number, string>()
    for (const { content } of ofKind(records, 'ticket_snapshot')) {
        const number = numberOr(content.number)
        if (number !== null) tickets.set(number, text(content.title))
    }

    const note = (
        record: LooseRecord,
        body: string,
        role = text(record.content.role)
    ): AgentNote => ({
        seq: record.seq,
        ticket: record.ticket,
        role,
        text: body,
    })

    // Leftover scans that blocked a commit.
    const scans = ofKind(records, 'leftover_scan').filter(
        ({ content }) => listOf(content.hits).length > 0
    )
    const hits = scans.flatMap((scan) =>
        listOf(scan.content.hits)
            .map(objectOf)
            .map((hit) => ({
                seq: scan.seq,
                path: text(hit.path),
                reason: text(hit.reason),
            }))
    )

    // Failed agent turns.
    const failed = ofKind(records, 'agent_failed')
    const error = (record: LooseRecord) => text(record.content.error)
    const out_of_turns = failed
        .filter((record) => error(record).includes('error_max_turns'))
        .map((record) =>
            note(
                record,
                /maximum number of turns \((\d+)\)/.exec(error(record))?.[1] ??
                    '?'
            )
        )
    const no_session = failed
        .filter((record) => error(record).startsWith('No open agent session'))
        .map((record) => note(record, clip(error(record))))
    const other_failures = failed
        .filter(
            (record) =>
                !error(record).includes('error_max_turns') &&
                !error(record).startsWith('No open agent session')
        )
        .map((record) =>
            note(
                record,
                `${text(record.content.failure) || 'agent'}: ${clip(error(record))}`
            )
        )

    // Jev calls that gave no answers.
    const jev_failed = ofKind(records, 'jev_failed')

    // What agents said in their results.
    const finished = ofKind(records, 'agent_finished')
    const results = finished.map((record) => ({
        record,
        result: objectOf(record.content.result),
    }))
    const setup_changes = results.flatMap(({ record, result }) => {
        const setup = objectOf(result.setup_change)
        return text(setup.file) === ''
            ? []
            : [note(record, `${text(setup.file)}: ${clip(text(setup.reason))}`)]
    })
    const assumptions = results.flatMap(({ record, result }) =>
        listOf(result.assumptions).map((line) =>
            note(record, clip(text(line), 200))
        )
    )
    const wont_fix = results.flatMap(({ record, result }) =>
        listOf(result.finding_responses)
            .map(objectOf)
            .filter(({ response }) => response === 'wont_fix')
            .map((answer) =>
                note(
                    record,
                    `${text(answer.finding_id)}: ${clip(text(answer.reason), 200)}`
                )
            )
    )
    const accepted = results.flatMap(({ record, result }) =>
        listOf(result.rulings)
            .map(objectOf)
            .filter(({ ruling }) => ruling === 'accepted')
            .map((ruling) =>
                note(
                    record,
                    `${text(ruling.finding_id)}: ${clip(text(ruling.reason), 200)}`
                )
            )
    )

    // Joins and rebases.
    const joins = ofKind(records, 'ticket_joined')
    const join_failed = joins
        .filter(({ content }) => content.ok === false)
        .map(({ seq, ticket }) => ({ seq, ticket }))

    // Usage: the run's record, and each ticket's latest.
    const usage = ofKind(records, 'usage_recorded')
    const run_usage = usage
        .filter(({ content }) => content.scope === 'run')
        .at(-1)
    const by_ticket = new Map<number, number>()
    for (const { content } of usage) {
        const ticket = numberOr(content.ticket)
        if (content.scope === 'ticket' && ticket !== null) {
            by_ticket.set(ticket, countedTokens(objectOf(content.tokens)))
        }
    }

    // Each time the engine started again, and how long it was down.
    const engine_resumed = ofKind(records, 'engine_resumed')
    const resumes = engine_resumed.map((record, index) => {
        const before = records.filter(({ seq }) => seq < record.seq).at(-1)
        const next = engine_resumed[index + 1]?.seq ?? Infinity
        // The steps a crash cut off, found before this resume's first step.
        const resumed = records.find(
            ({ seq, kind }) =>
                seq > record.seq && seq < next && kind === 'run_resumed'
        )
        return {
            seq: record.seq,
            version: text(record.content.luca_version),
            down_ms:
                before === undefined ? 0 : msBetween(before.time, record.time),
            cut_off: listOf(resumed?.content.interrupted).length,
        }
    })

    const stuck = stuckEvents({ records })
    const gates = gateFailures({ records })
    const red = ofKind(records, 'red_check')
    const rebases = tally(
        ofKind(records, 'ticket_rebased').map(({ seq, content }) => ({
            key: text(content.cause),
            seq,
        }))
    )

    const summary: RunSummary = {
        spec: {
            number: numberOr(started.spec_number) ?? numberOr(spec.number),
            title: text(spec.title),
            url: text(spec.url),
        },
        repo: text(started.repo),
        luca: [
            text(started.luca_version) || '?',
            ...ofKind(records, 'engine_resumed').map(({ content }) =>
                text(content.luca_version)
            ),
        ].filter((version, index, all) => all.indexOf(version) === index),
        started: records[0]?.time ?? '',
        ended: records.at(-1)?.time ?? '',
        last_seq: records.at(-1)?.seq ?? 0,
        over: ending.over,
        ending: ending.line,
        tickets,
        stuck,
        leftovers: {
            scans: scans.length,
            by_path: tally(hits.map(({ path, seq }) => ({ key: path, seq }))),
            reasons: tally(
                hits.map(({ reason, seq }) => ({ key: reason, seq }))
            ),
        },
        out_of_turns,
        no_session,
        other_failures,
        jev: {
            asked: ofKind(records, 'jev_asked').length,
            failed: tally(
                jev_failed.map(({ seq, content }) => ({
                    key: `${text(content.reason)}: ${clip(text(content.error), 120)}`,
                    seq,
                }))
            ),
            jobs: tally(
                jev_failed.map(({ seq, content }) => ({
                    key: text(content.job),
                    seq,
                }))
            ),
        },
        gates,
        red_checks: {
            runs: red.length,
            failed: red.filter(({ content }) => content.ok === false).length,
        },
        setup_changes,
        joins: {
            ok: joins.length - join_failed.length,
            failed: join_failed,
            rebases,
            undone: ofKind(records, 'join_undone').map(
                ({ seq, ticket, content }) => ({
                    seq,
                    ticket,
                    shas: listOf(content.shas).length,
                })
            ),
            tests_sent_back: ofKind(records, 'tests_sent_back').map(
                (record) => {
                    const bad = objectOf(record.content.bad_test)
                    return note(
                        record,
                        `round ${String(record.content.round)}: ${text(bad.file)} > ${clip(text(bad.name), 160)}`,
                        'implementer'
                    )
                }
            ),
        },
        replies: {
            words: tally(
                ofKind(records, 'reply_received').map(({ seq, content }) => ({
                    key: text(content.word),
                    seq,
                }))
            ),
            ignored: tally(
                ofKind(records, 'reply_ignored').map(({ seq, content }) => ({
                    key: text(content.reason),
                    seq,
                }))
            ),
        },
        assumptions: {
            total: assumptions.length,
            by_role: tally(
                assumptions.map(({ role, seq }) => ({ key: role, seq }))
            ),
            by_ticket: tally(
                assumptions.map(({ ticket, seq }) => ({
                    key: ticketText(ticket),
                    seq,
                }))
            ),
            notes: assumptions,
        },
        declined: { wont_fix, accepted },
        steps: stepTimes({ records }),
        usage: {
            run:
                run_usage === undefined
                    ? null
                    : objectOf(run_usage.content.tokens),
            agent_turns:
                run_usage === undefined
                    ? null
                    : numberOr(run_usage.content.agent_turns),
            by_ticket: [...by_ticket]
                .map(([ticket, counted]) => ({ ticket, counted }))
                .toSorted((a, b) => b.counted - a.counted),
            by_role: roleUse({ records }),
        },
        resumes,
        config_reloaded: ofKind(records, 'config_reloaded').flatMap(
            ({ content }) =>
                listOf(content.changes).map((change) =>
                    text(objectOf(change).field)
                )
        ),
        shared_git_changed: ofKind(records, 'shared_git_changed').length,
        signals: [],
    }
    summary.signals = signalsOf({ summary })
    return summary
}

/**
 * The patterns of one run, keyed so the same pattern in another run has
 * the same key: stuck reasons, leftover reasons and folders, failure kinds,
 * failing checks and tests, and the like. Pure.
 */
const signalsOf = ({ summary }: { summary: RunSummary }): Signal[] => {
    const signals = new Map<string, number>()
    const add = (key: string, count = 1) => {
        if (count > 0) signals.set(key, (signals.get(key) ?? 0) + count)
    }
    for (const event of summary.stuck) {
        add(`stuck: ${event.reason}`)
        if (event.cap !== null) add(`fix loop at its cap (${event.cap})`)
    }
    for (const { key, count } of summary.leftovers.reasons) {
        add(`leftover scan: ${key}`, count)
    }
    for (const { key, count } of summary.leftovers.by_path) {
        add(`leftover in folder: ${folderOf(key)}/`, count)
    }
    for (const { role, text: max } of summary.out_of_turns) {
        add(`out of turns: ${role} (max ${max})`)
    }
    for (const { role } of summary.no_session) {
        add(`No open agent session: ${role}`)
    }
    for (const { key, count } of summary.jev.failed) {
        add(`jev_failed ${key}`, count)
    }
    for (const { key, count } of summary.gates.by_check) {
        add(`failed check: ${key}`, count)
    }
    for (const { key, count } of summary.gates.by_test) {
        add(`failed test: ${key}`, count)
    }
    add('setup change asked for', summary.setup_changes.length)
    add('join failed (clash)', summary.joins.failed.length)
    add('join undone', summary.joins.undone.length)
    add('tests sent back after a rebase', summary.joins.tests_sent_back.length)
    for (const { key, count } of summary.replies.ignored) {
        add(`reply ignored: ${key}`, count)
    }
    add('fixer declined a finding (wont_fix)', summary.declined.wont_fix.length)
    add('shared .git changed during a turn', summary.shared_git_changed)
    return [...signals].map(([key, count]) => ({ key, count }))
}

/** `#12 "Its title"` for a ticket, or `run` for none. */
const titledTicket = (summary: RunSummary, ticket: number | null): string => {
    const title = ticket === null ? undefined : summary.tickets.get(ticket)
    return title === undefined || title === ''
        ? ticketText(ticket)
        : `${ticketText(ticket)} "${clip(title, 80)}"`
}

/** A list of agent notes, one per line, capped. */
const noteLines = (notes: AgentNote[]): string[] =>
    capped(
        notes.map(
            ({ seq, ticket, role, text: body }) =>
                `  #${seq} ${ticketText(ticket)} ${role}: ${body}`
        )
    )

/** A tally as `key ×n (#1, #2)` lines, capped. */
const tallyLines = (groups: Tally[], max = LIST_MAX): string[] =>
    capped(
        groups.map(
            ({ key, count, seqs }) => `  ${key} ×${count} (${seqsText(seqs)})`
        ),
        max
    )

/**
 * One run's summary as plain text, with seq numbers (`#123`) for evidence.
 * Sections with nothing in them are left out. Pure.
 */
export const formatRunSummary = ({
    run_id,
    summary: s,
}: {
    run_id: string
    summary: RunSummary
}): string => {
    const gh_repo = /^https:\/\/github\.com\/([^/]+\/[^/]+)\//.exec(
        s.spec.url
    )?.[1]
    const lines: string[] = [
        `== Run ${run_id}: spec #${s.spec.number ?? '?'}${s.spec.title === '' ? '' : ` "${s.spec.title}"`}`,
        `Repo: ${s.repo || '?'}${gh_repo === undefined ? '' : ` (${gh_repo})`}`,
        `Luca: ${s.luca.join(' -> ')}`,
        `Time: ${s.started} to ${s.ended} (${durationText(msBetween(s.started, s.ended))}), last record #${s.last_seq}`,
        `Ended: ${s.ending}`,
        `Tickets: ${s.tickets.size}`,
    ]
    for (const resume of s.resumes) {
        lines.push(
            `Engine resumed (#${resume.seq}) on ${resume.version} after ${durationText(resume.down_ms)} down${resume.cut_off === 0 ? '' : `, ${resume.cut_off} steps cut off`}`
        )
    }
    if (s.config_reloaded.length > 0) {
        lines.push(`Config reloaded on resume: ${s.config_reloaded.join(', ')}`)
    }

    const section = (title: string, body: string[]) => {
        if (body.length > 0) lines.push('', title, ...body)
    }

    const waited = s.stuck.reduce(
        (sum, { reply }) => sum + (reply?.wait_ms ?? 0),
        0
    )
    section(
        `Stuck (${s.stuck.length}; the owner took ${durationText(waited)} in all to reply):`,
        s.stuck.map(
            (event) =>
                `  #${event.seq} ${event.kind} ${titledTicket(s, event.ticket)}: ${event.reason}${event.reply === null ? ', no reply' : ` -> ${event.reply.word} (#${event.reply.seq}, after ${durationText(event.reply.wait_ms)})`}\n    ${clip(event.detail)}`
        )
    )
    section(
        'Fix loops that hit their cap:',
        s.stuck
            .filter(({ cap }) => cap !== null)
            .map(
                ({ seq, ticket, reason, cap }) =>
                    `  #${seq} ${ticketText(ticket)} ${reason} after ${cap}`
            )
    )
    section(`Leftover scan blocked a commit (${s.leftovers.scans} scans):`, [
        ...s.leftovers.reasons.map(
            ({ key, count }) => `  reason: ${key} ×${count}`
        ),
        ...tallyLines(s.leftovers.by_path),
    ])
    section(
        `Agents out of turns (error_max_turns, ${s.out_of_turns.length}):`,
        noteLines(
            s.out_of_turns.map((note) => ({
                ...note,
                text: `max ${note.text} turns`,
            }))
        )
    )
    section(
        `Agent turns lost to "No open agent session" (${s.no_session.length}):`,
        tallyLines(
            tally(s.no_session.map(({ role, seq }) => ({ key: role, seq })))
        )
    )
    section(
        `Other failed agent turns (${s.other_failures.length}):`,
        noteLines(s.other_failures)
    )
    if (s.jev.failed.length > 0) {
        section(
            `jev_failed: ${s.jev.failed.reduce((sum, { count }) => sum + count, 0)} of ${s.jev.asked} Jev calls gave no answer:`,
            [
                ...s.jev.failed.map(({ key, count }) => `  ${key} ×${count}`),
                `  by job: ${s.jev.jobs.map(({ key, count }) => `${key} ×${count}`).join(', ')}`,
            ]
        )
    }
    if (s.gates.failed > 0) {
        section(
            `Failed gates: ${s.gates.failed} of ${s.gates.runs} gates_run (red checks failed: ${s.red_checks.failed} of ${s.red_checks.runs}):`,
            [
                ...tallyLines(s.gates.by_check),
                ...(s.gates.by_test.length === 0
                    ? []
                    : [
                          '  tests that failed most:',
                          ...tallyLines(s.gates.by_test).map(
                              (line) => `  ${line}`
                          ),
                      ]),
            ]
        )
    }
    section(
        `Setup changes agents asked for (${s.setup_changes.length}):`,
        noteLines(s.setup_changes)
    )
    const j = s.joins
    if (
        j.failed.length +
            j.undone.length +
            j.rebases.length +
            j.tests_sent_back.length >
        0
    ) {
        section('Joins:', [
            `  ${j.ok} joined, ${j.failed.length} clashed (${seqsText(
                j.failed.map(({ seq }) => seq),
                10
            )})`,
            ...j.rebases.map(
                ({ key, count, seqs }) =>
                    `  rebased after ${key} ×${count} (${seqsText(seqs, 10)})`
            ),
            ...j.undone.map(
                ({ seq, ticket, shas }) =>
                    `  #${seq} join_undone ${ticketText(ticket)}: ${shas} commits taken off the run branch`
            ),
            ...noteLines(j.tests_sent_back).map((line) =>
                line.replace(/^ {2}/, '  tests_sent_back ')
            ),
        ])
    }
    section('Replies:', [
        ...(s.replies.words.length === 0
            ? []
            : [
                  `  ${s.replies.words.map(({ key, count }) => `${key} ×${count}`).join(', ')}`,
              ]),
        ...s.replies.ignored.map(
            ({ key, count, seqs }) =>
                `  reply_ignored ${key} ×${count} (${seqsText(seqs)})`
        ),
    ])
    section(
        `Assumptions agents made (${s.assumptions.total}; ${s.assumptions.by_role.map(({ key, count }) => `${key} ${count}`).join(', ')}):`,
        s.assumptions.total === 0
            ? []
            : [
                  `  by ticket: ${s.assumptions.by_ticket.map(({ key, count }) => `${key} ${count}`).join(', ')}`,
                  '  the first of each ticket:',
                  ...noteLines(
                      s.assumptions.notes.filter(
                          (note, index, all) =>
                              all.findIndex(
                                  ({ ticket }) => ticket === note.ticket
                              ) === index
                      )
                  ).map((line) => `  ${line}`),
                  `  all of them: jq -c 'select(.kind == "agent_finished") | {seq, ticket, role: .content.role, assumptions: .content.result.assumptions}' <journal>`,
              ]
    )
    section(
        `Findings fixers declined (wont_fix, ${s.declined.wont_fix.length}) and rulings that accepted a decline (${s.declined.accepted.length}):`,
        [
            ...noteLines(s.declined.wont_fix),
            ...noteLines(s.declined.accepted).map((line) =>
                line.replace(/^ {2}/, '  accepted ')
            ),
        ]
    )
    section(
        `Slow steps (top ${SLOW_STEPS_MAX} by total time; count, total, mean, max):`,
        s.steps
            .slice(0, SLOW_STEPS_MAX)
            .map(
                (step) =>
                    `  ${step.step}: ${step.count}, ${durationText(step.total_ms)}, ${durationText(step.total_ms / step.count)}, ${durationText(step.max_ms)} (#${step.max_seq} ${ticketText(step.max_ticket)})`
            )
    )
    const run = s.usage.run
    section(
        'Tokens (counted as the run budget counts them: input, output, cache writes):',
        [
            ...(run === null
                ? []
                : [
                      `  run: ${tokensText(countedTokens(run))} counted, ${tokensText(numberOr(run.cache_read_input_tokens) ?? 0)} cache reads, ${s.usage.agent_turns ?? '?'} agent turns`,
                  ]),
            ...s.usage.by_role.map(
                (use) =>
                    `  ${use.role}: ${use.sessions} sessions, ${tokensText(use.counted)}, ${use.turns} turns (max ${use.max_turns}), ${durationText(use.duration_ms)}`
            ),
            ...(s.usage.by_ticket.length === 0
                ? []
                : [
                      `  costliest tickets: ${s.usage.by_ticket
                          .slice(0, 5)
                          .map(
                              ({ ticket, counted }) =>
                                  `#${ticket} ${tokensText(counted)}`
                          )
                          .join(', ')}`,
                  ]),
        ]
    )
    if (s.shared_git_changed > 0) {
        section('Other:', [
            `  shared_git_changed ×${s.shared_git_changed}: something changed the shared .git during an agent's turn`,
        ])
    }
    return lines.join('\n')
}

/** A pattern seen in more than one run: its count in each. */
export type Repeat = { key: string; runs: { run_id: string; count: number }[] }

/** The patterns that show up in two runs or more, most runs first. Pure. */
export const repeatsAcross = ({
    runs,
}: {
    runs: { run_id: string; summary: RunSummary }[]
}): Repeat[] => {
    const seen = new Map<string, Repeat>()
    for (const { run_id, summary } of runs) {
        for (const { key, count } of summary.signals) {
            const repeat = seen.get(key) ?? { key, runs: [] }
            repeat.runs.push({ run_id, count })
            seen.set(key, repeat)
        }
    }
    const total = (repeat: Repeat) =>
        repeat.runs.reduce((sum, { count }) => sum + count, 0)
    return [...seen.values()]
        .filter((repeat) => repeat.runs.length > 1)
        .toSorted(
            (a, b) => b.runs.length - a.runs.length || total(b) - total(a)
        )
}

/** The repeats as plain text. Pure. */
export const formatRepeats = ({ repeats }: { repeats: Repeat[] }): string =>
    [
        '== Repeats across runs',
        ...(repeats.length === 0
            ? ['  none: no pattern shows up in more than one run']
            : capped(
                  repeats.map(
                      ({ key, runs }) =>
                          `  ${key}: ${runs.map(({ run_id, count }) => `${run_id} ×${count}`).join(', ')}`
                  ),
                  20
              )),
    ].join('\n')

/** One run of a repo, for picking the newest finished one. */
export type RunChoice = { run_id: string; started: string; over: boolean }

/**
 * The runs of any of `repos` in `runs_dir`, newest first. A run's repo is
 * its `run_started` repo.
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
            over: isFinished({ records }),
        }))
        .toSorted((a, b) => b.started.localeCompare(a.started))
}

/**
 * The newest finished run of `runs` (newest first, as `repoRuns` gives
 * them), or `null` when none is over. Pure.
 */
export const newestFinished = ({
    runs,
}: {
    runs: RunChoice[]
}): RunChoice | null => runs.find(({ over }) => over) ?? null

/** The flags, read. */
export type RetroArgs = {
    run_ids: string[]
    repo: string | null
    runs_dir: string
}

/** Reads the flags; `env` gives the default runs folder. Pure. */
export const parseArgs = ({
    argv,
    env,
    home,
}: {
    argv: string[]
    env: Record<string, string | undefined>
    home: string
}): RetroArgs => {
    const args: RetroArgs = {
        run_ids: [],
        repo: null,
        runs_dir:
            env.LUCA_RUNS_DIR ?? join(home, '.local', 'state', 'luca', 'runs'),
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
        } else if (arg !== '' && !arg.startsWith('-')) {
            args.run_ids.push(arg)
        }
    }
    return args
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
 * Its twin is `currentRepos` in `luca-unstick/scripts/stuck-summary.ts`: each skill folder is installed
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

const main = () => {
    const args = parseArgs({
        argv: Bun.argv.slice(2),
        env: process.env,
        home: homedir(),
    })
    let run_ids = args.run_ids
    if (run_ids.length === 0) {
        const repos =
            args.repo === null
                ? currentRepos({ cwd: process.cwd() })
                : [args.repo]
        const runs = repoRuns({ runs_dir: args.runs_dir, repos })
        const pick = newestFinished({ runs })
        if (pick === null) {
            console.log(
                runs.length === 0
                    ? `No Luca runs of ${repos.join(' or ')} in ${args.runs_dir}.`
                    : `No finished Luca runs of ${repos.join(' or ')} in ${args.runs_dir} (${runs.length} not over yet: ${runs.map(({ run_id }) => run_id).join(', ')}).`
            )
            return
        }
        console.log(`The newest finished run of ${repos[0]}: ${pick.run_id}\n`)
        run_ids = [pick.run_id]
    }
    const runs = run_ids.map((run_id) => ({
        run_id,
        records: readRecords({
            file: join(args.runs_dir, run_id, 'journal.jsonl'),
        }),
    }))
    const summed = runs.flatMap(({ run_id, records }) => {
        if (records.length === 0) {
            console.log(
                `== Run ${run_id}: no journal at ${join(args.runs_dir, run_id, 'journal.jsonl')}\n`
            )
            return []
        }
        const summary = summarizeJournal({ records })
        console.log(`${formatRunSummary({ run_id, summary })}\n`)
        return [{ run_id, summary }]
    })
    if (summed.length > 1) {
        console.log(formatRepeats({ repeats: repeatsAcross({ runs: summed }) }))
    }
}

if (import.meta.main) main()
