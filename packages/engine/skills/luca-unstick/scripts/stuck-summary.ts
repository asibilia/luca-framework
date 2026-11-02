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
 * It imports nothing but Bun's and Node's own modules, and the scripts
 * beside it: it runs from `~/.claude/skills/luca-unstick/`, where no
 * packages are installed. So it reads records loosely, not with the
 * engine's Zod schemas. Its journal reading is in `stuck-records.ts`, and
 * what it says about a stuck ticket or final review in `stuck-lines.ts`.
 * `stuck-summary.test.ts` checks it against journals built with the
 * engine's own fixtures, and every kind in `KINDS_READ` against the
 * journal's kinds, so the two can't drift apart unseen.
 */
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { finalReviewLines, ticketLines } from './stuck-lines'
import {
    clip,
    commandLines,
    cutOffSteps,
    engineRunning,
    indent,
    lastOf,
    listOf,
    logTail,
    nest,
    numberOr,
    objectOf,
    openStuck,
    readRecords,
    registryEntry,
    repoOfUrl,
    runState,
    seqText,
    text,
    type LooseRecord,
    type RegistryEntry,
} from './stuck-records'

export {
    cutOffSteps,
    engineRunning,
    KINDS_READ,
    openStuck,
    readRecords,
    registryEntry,
    repoOfUrl,
    runState,
    type LooseRecord,
    type RegistryEntry,
    type StuckItem,
} from './stuck-records'

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
                    `${seqText(seq)} stuck_reported: comment ${String(content.comment_id)}`,
                ]
            }
            if (kind === 'auto_retried') {
                return [
                    `${seqText(seq)} auto_retried: the engine retried it by itself after ${text(content.reason)} (comment ${String(content.comment_id)})`,
                ]
            }
            if (kind === 'comment_read') {
                return [
                    `${seqText(seq)} comment_read by ${text(content.author)}: ${clip(text(content.body).replace(/\s+/g, ' '), 200)}`,
                ]
            }
            if (kind === 'reply_received') {
                return [
                    `${seqText(seq)} reply_received: ${text(content.word)}${content.ticket === null ? '' : ` #${String(content.ticket)}`} from ${text(content.author)}`,
                ]
            }
            if (kind === 'reply_ignored') {
                return [
                    `${seqText(seq)} reply_ignored: ${text(content.reason)}`,
                ]
            }
            if (kind === 'ticket_retried') {
                return [
                    `${seqText(seq)} ticket_retried #${String(record.ticket)}: ${text(content.mode)}${listOf(content.problems).length === 0 ? '' : ` (${listOf(content.problems).map(text).join('; ')})`}`,
                ]
            }
            if (
                kind === 'ticket_skipped' ||
                kind === 'final_review_retried' ||
                kind === 'final_review_shipped'
            ) {
                return [
                    `${seqText(seq)} ${kind}${record.ticket === null ? '' : ` #${record.ticket}`}`,
                ]
            }
            return []
        })

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
        lines.push(
            `Last record: ${seqText(last.seq)} ${last.kind} at ${last.time}`
        )
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
            `Cut off (started, never ended): ${cut.map((step) => `${step.step} on ${step.key} (${seqText(step.seq)})`).join('; ')}`
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
            `${head}: ${item.reason} (${item.kind} ${seqText(item.seq)})`,
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
