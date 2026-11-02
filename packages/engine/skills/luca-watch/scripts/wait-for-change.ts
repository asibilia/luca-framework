#!/usr/bin/env bun
/**
 * Waits for the next thing a watcher must act on in a Luca run, for the
 * `/luca-watch` skill:
 *
 *   bun wait-for-change.ts <run id> <last seq> [--runs-dir <dir>]
 *
 * Every five seconds it reads the run's journal after `<last seq>` and
 * prints one JSON line, `{ event, last_seq, detail }`, on the first of:
 *
 * - `stuck`: the oldest `stuck_reported` after the cursor; its body is the
 *   detail.
 * - `ended`: the oldest ending after the cursor (`run_ended`, or a legacy
 *   one: `pull_request_opened`, `intake_refused`, `nothing_to_do`, a `stop`
 *   reply, a billing or crash `run_stopped`), or one before it.
 * - `engine_gone`: no live engine names the run, and it has not ended.
 * - `quiet`: five minutes with none of these. Call it again.
 * - `error`: the process list or the journal can't be read.
 *
 * Several new records come back one call at a time, oldest first: the
 * caller passes the returned `last_seq` as the next cursor, so none is
 * skipped. A missing journal, an unknown run, an invalid cursor or bad
 * arguments print an `error` line and exit 2; every other event exits 0.
 *
 * It only reads: the journal and the process list. It imports nothing but
 * Bun's and Node's own modules, since it runs from
 * `~/.claude/skills/luca-watch/`, where no packages are installed.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** One running process: its pid, its parent's, its command line. */
export type ProcessRow = { pid: number; ppid: number; command: string }

/** What the helper prints. */
export type WaitResult = {
    event: 'stuck' | 'ended' | 'engine_gone' | 'quiet' | 'error'
    last_seq: number
    detail: string
}

/** How often the journal is read again. */
export const POLL_MS = 5_000

/** How long a call waits before it says `quiet`. */
export const QUIET_MS = 5 * 60_000

/** One journal line, read loosely. */
type LooseRecord = {
    seq: number
    kind: string
    content: Record<string, unknown>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string =>
    typeof value === 'string' ? value : ''

/** One journal line as a loose record, or `null` when it isn't one. */
const toRecord = (line: string): LooseRecord | null => {
    let json: unknown
    try {
        json = JSON.parse(line)
    } catch {
        return null
    }
    if (!isObject(json)) return null
    if (typeof json.seq !== 'number' || typeof json.kind !== 'string') {
        return null
    }
    return {
        seq: json.seq,
        kind: json.kind,
        content: isObject(json.content) ? json.content : {},
    }
}

/** The journal file of `run_id` in `runs_dir`. */
export const journalFile = ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): string => join(runs_dir, run_id, 'journal.jsonl')

const readRecords = async (file: string): Promise<LooseRecord[]> =>
    (await Bun.file(file).text())
        .split('\n')
        .map(toRecord)
        .filter((record) => record !== null)

/** A run_ended's or legacy ending's detail; `null` when `record` is none. */
const endingDetail = (record: LooseRecord): string | null => {
    const { kind, content } = record
    if (kind === 'run_ended') {
        const url = text(content.url)
        return [text(content.outcome), text(content.detail), url]
            .filter((part) => part !== '')
            .join(': ')
    }
    if (kind === 'pull_request_opened') {
        return `pull_request: the run opened its PR: ${text(content.url)}`
    }
    if (kind === 'intake_refused') return 'refused: intake refused the spec.'
    if (kind === 'nothing_to_do') return 'nothing_to_do: nothing to do.'
    if (kind === 'reply_received' && content.word === 'stop') {
        return 'stopped: the owner replied stop.'
    }
    if (kind === 'run_stopped' && content.billing === true) {
        return `failed: it stopped for good on a billing sign: ${text(content.reason)}`
    }
    if (kind === 'run_stopped' && content.crashed === true) {
        return `failed: it stopped for good after crashes: ${text(content.reason)}`
    }
    return null
}

/** The event `record` is for a watcher, or `null` when it is none. */
const eventOf = (record: LooseRecord): WaitResult | null => {
    if (record.kind === 'stuck_reported') {
        return {
            event: 'stuck',
            last_seq: record.seq,
            detail: text(record.content.body),
        }
    }
    const ended = endingDetail(record)
    return ended === null
        ? null
        : { event: 'ended', last_seq: record.seq, detail: ended }
}

/** The last record of `kind` in `records`. */
const lastOf = (
    records: LooseRecord[],
    kind: string
): LooseRecord | undefined => records.findLast((record) => record.kind === kind)

/** Why the engine is gone, as far as the journal says. Pure. */
const goneDetail = (records: LooseRecord[]): string => {
    const resumed = lastOf(records, 'engine_resumed')?.seq ?? 0
    const wait = records.findLast(({ kind }) => kind.startsWith('network_wait'))
    if (
        wait?.kind === 'network_wait_ended' &&
        wait.content.gave_up === true &&
        wait.seq > resumed
    ) {
        return `No live engine: it crashed after a network wait gave up (step ${text(wait.content.step)}, seq ${wait.seq}), with no engine_resumed since.`
    }
    const stopped = lastOf(records, 'run_stopped')
    if (stopped !== undefined && stopped.seq > resumed) {
        return `No live engine: the launcher stopped it (${text(stopped.content.reason)}).`
    }
    return 'No live engine, and the journal has no ending and no network wait that gave up.'
}

/**
 * Whether a live engine names `run_id` with `--run-id` or `--resume` (or
 * `--run-id=`/`--resume=`), as whole words, other than `own_pids`. The
 * same parsing as `liveRunIds` in `src/cli/live-runs.ts`. Pure.
 */
const engineLive = ({
    run_id,
    processes,
    own_pids,
}: {
    run_id: string
    processes: ProcessRow[]
    own_pids: number[]
}): boolean =>
    processes.some(({ pid, command }) => {
        if (own_pids.includes(pid)) return false
        const tokens = command.split(/\s+/)
        return tokens.some(
            (token, index) =>
                ((token === '--run-id' || token === '--resume') &&
                    tokens[index + 1] === run_id) ||
                token === `--run-id=${run_id}` ||
                token === `--resume=${run_id}`
        )
    })

/** `pid` and every parent above it, from `processes`. Pure. */
const ancestorPids = ({
    pid,
    processes,
}: {
    pid: number
    processes: ProcessRow[]
}): number[] => {
    const parents = new Map(
        processes.map(({ pid: child, ppid }): [number, number] => [child, ppid])
    )
    const pids = [pid]
    let parent = parents.get(pid)
    while (parent !== undefined && parent > 0 && !pids.includes(parent)) {
        pids.push(parent)
        parent = parents.get(parent)
    }
    return pids
}

const reason = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/**
 * Waits for the next event in run `run_id` after seq `last_seq`, reading
 * `runs_dir`, polling every `POLL_MS` by `sleep` and `now`, and listing
 * processes with `list_process_rows`. Never throws.
 */
export const waitForChange = async ({
    run_id,
    last_seq,
    runs_dir,
    list_process_rows,
    now,
    sleep,
    own_pids = [process.pid, process.ppid],
}: {
    run_id: string
    last_seq: number
    runs_dir: string
    list_process_rows: () => Promise<ProcessRow[]>
    now: () => number
    sleep: (ms: number) => Promise<void>
    /** This process and its parent, left out of the live engines. */
    own_pids?: number[]
}): Promise<WaitResult> => {
    const file = journalFile({ runs_dir, run_id })
    const start = now()
    let highest = last_seq
    for (;;) {
        if (!existsSync(file)) {
            return {
                event: 'error',
                last_seq,
                detail: `No journal for run ${run_id} at ${file}.`,
            }
        }
        let records: LooseRecord[]
        try {
            records = await readRecords(file)
        } catch (error) {
            return {
                event: 'error',
                last_seq: highest,
                detail: `Couldn't read the journal: ${reason(error)}`,
            }
        }
        highest = Math.max(highest, ...records.map(({ seq }) => seq))
        const next = records
            .filter(({ seq }) => seq > last_seq)
            .map(eventOf)
            .find((event) => event !== null)
        if (next !== undefined) return next
        const ended = records.map(eventOf).findLast((e) => e?.event === 'ended')
        if (ended) return { ...ended, last_seq: highest }
        let processes: ProcessRow[]
        try {
            processes = await list_process_rows()
        } catch (error) {
            return {
                event: 'error',
                last_seq: highest,
                detail: `Couldn't list the processes: ${reason(error)}`,
            }
        }
        const own = own_pids.flatMap((pid) => ancestorPids({ pid, processes }))
        if (!engineLive({ run_id, processes, own_pids: own })) {
            return {
                event: 'engine_gone',
                last_seq: highest,
                detail: goneDetail(records),
            }
        }
        if (now() - start >= QUIET_MS) {
            return {
                event: 'quiet',
                last_seq: highest,
                detail: 'Nothing new for five minutes.',
            }
        }
        await sleep(POLL_MS)
    }
}

/** Every running process, from `ps -axww -o pid=,ppid=,command=`. */
const listProcessRows = async (): Promise<ProcessRow[]> => {
    const child = Bun.spawn(['ps', '-axww', '-o', 'pid=,ppid=,command='], {
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [stdout, stderr, exit_code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ])
    if (exit_code !== 0) {
        throw new Error(`ps exited with ${exit_code}: ${stderr.trim()}`)
    }
    return stdout.split('\n').flatMap((line) => {
        const [, pid, ppid, command] =
            /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line) ?? []
        return pid && ppid && command !== undefined
            ? [{ pid: Number(pid), ppid: Number(ppid), command }]
            : []
    })
}

/** Prints `result` as one JSON line and exits with `code`. */
const finish = (result: WaitResult, code: number): never => {
    console.log(JSON.stringify(result))
    process.exit(code)
}

const main = async () => {
    const argv = Bun.argv.slice(2)
    let runs_dir =
        process.env.LUCA_RUNS_DIR ??
        join(homedir(), '.local', 'state', 'luca', 'runs')
    const positional: string[] = []
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i] ?? ''
        if (arg === '--runs-dir' && argv[i + 1] !== undefined) {
            runs_dir = argv[i + 1] ?? runs_dir
            i += 1
        } else {
            positional.push(arg)
        }
    }
    const [run_id, cursor] = positional
    const fail = (detail: string) =>
        finish({ event: 'error', last_seq: 0, detail }, 2)
    if (positional.length !== 2 || !run_id || !cursor) {
        return fail(
            'Usage: wait-for-change.ts <run id> <last seq> [--runs-dir <dir>]'
        )
    }
    if (!/^\d+$/.test(cursor)) return fail(`Invalid cursor: ${cursor}`)
    const last_seq = Number(cursor)
    const file = journalFile({ runs_dir, run_id })
    if (!existsSync(file)) {
        return fail(`No journal for run ${run_id} at ${file}.`)
    }
    const highest = Math.max(0, ...(await readRecords(file)).map((r) => r.seq))
    if (last_seq > highest) {
        return fail(
            `Invalid cursor: ${last_seq} is past the journal's last seq ${highest}.`
        )
    }
    const result = await waitForChange({
        run_id,
        last_seq,
        runs_dir,
        list_process_rows: listProcessRows,
        now: Date.now,
        sleep: (ms) => Bun.sleep(ms),
    })
    finish(result, 0)
}

if (import.meta.main) await main()
