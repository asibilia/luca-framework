/**
 * End-to-end suite for the SessionStart handoff-inbox handler.
 *
 * Every case here SPAWNS the handler as a real process, the way the harness
 * invokes it: real stdin, real cwd, real `HOME`, real exit code. Driving the
 * process directly (rather than importing `main`) is deliberate — it is the
 * only way to observe the `main().then(ok, exit0)` catch-all, the exit code,
 * and the exact bytes on stdout, and it means no stage-gate or in-process stub
 * can make a case pass with the work undone.
 *
 * ## Hermetic by construction
 *
 * `HOME` is redirected to a temp directory in every case, so no probe can
 * read or write the developer's real `~/.luca/handoff/`. Envelope
 * `target.repoPath` values use `realpathSync` on the temp repo, because on
 * macOS `os.tmpdir()` returns a `/var/...` symlink while the spawned
 * process's `process.cwd()` reports the resolved `/private/var/...` — and the
 * transport matches `targetRepoPath` by exact string equality, so an
 * unresolved path would silently match nothing and turn every positive case
 * green-for-the-wrong-reason.
 *
 * ## The seven degradation paths
 *
 * Six of the seven are reachable by spawning: missing `.luca/`, missing
 * mailbox dir, corrupt envelope, malformed stdin, non-ok list result, and the
 * top-level throw. The seventh — an empty `os.homedir()` — is NOT: on POSIX
 * `homedir()` falls back to the passwd database when `HOME` is empty, so a
 * spawn with `HOME=''` gets the real home back. That path is covered here by
 * a deterministic probe of the extracted pure guard plus a demonstration of
 * exactly what it prevents. See the `empty homedir` describe block.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { mailboxDirFor } from '@alecsibilia/luca-core/handoff'

import { resolveMailboxDir } from './resolve-mailbox-dir.ts'

import type { HandoffEnvelope } from '@alecsibilia/luca-core/handoff'

const HANDLER = join(import.meta.dir, 'handler.ts')

/** Delimiter prefixes, built by CONCATENATION so this file holds no literal tag. */
const OPEN_PREFIX = '<' + 'luca-handoff-inbox'
const CLOSE_PREFIX = '<' + '/' + 'luca-handoff-inbox'

/** A well-formed SessionStart payload, as the harness supplies it. */
const STDIN_PAYLOAD = JSON.stringify({
    session_id: 'sess-1',
    hook_event_name: 'SessionStart',
    source: 'startup',
})

/** Temp roots created by the tests, torn down in afterEach. */
const created: string[] = []

function tempDir(prefix: string): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
    created.push(dir)
    return dir
}

afterEach(() => {
    while (created.length > 0) {
        const dir = created.pop() as string
        try {
            // Restore permissions first — the unreadable-mailbox case chmods
            // a directory to 0o000 and rm would otherwise fail.
            const mailbox = join(dir, '.luca', 'handoff')
            if (existsSync(mailbox)) chmodSync(mailbox, 0o700)
        } catch {
            // Best effort.
        }
        rmSync(dir, { recursive: true, force: true })
    }
})

/** A repo directory that looks like a luca repo (has `.luca/`). */
function makeRepo(): string {
    const repo = tempDir('hoi-repo-')
    mkdirSync(join(repo, '.luca'), { recursive: true })
    return repo
}

/** A home directory whose mailbox exists but is empty. */
function makeHome(): { home: string; mailboxDir: string } {
    const home = tempDir('hoi-home-')
    const mailboxDir = mailboxDirFor({ homedir: home })
    mkdirSync(mailboxDir, { recursive: true })
    return { home, mailboxDir }
}

function envelope(
    id: string,
    targetRepoPath: string,
    overrides: Partial<HandoffEnvelope> = {}
): HandoffEnvelope {
    return {
        schemaVersion: 1,
        id,
        createdAt: '2026-07-21T10:00:00.000Z',
        updatedAt: '2026-07-21T10:00:00.000Z',
        origin: {
            repoPath: '/repos/a',
            repoName: 'repo-a',
            runId: 'run-1',
            phaseSlug: '01-x',
        },
        target: { repoPath: targetRepoPath },
        intent: 'wire the shared auth client',
        acceptanceCriteria: [],
        context: { concepts: [], issueRefs: [], prRefs: [] },
        callback: { transport: 'local-mailbox', address: '' },
        status: 'pending',
        statusHistory: [],
        ...overrides,
    } as HandoffEnvelope
}

function writeEnvelope(mailboxDir: string, e: HandoffEnvelope): string {
    const path = join(mailboxDir, `${e.id}.json`)
    writeFileSync(path, JSON.stringify(e, null, 2))
    return path
}

interface RunResult {
    exitCode: number
    stdout: string
    stderr: string
    ms: number
}

/** Spawn the handler exactly as the harness would. */
async function runHandler(opts: {
    cwd: string
    home: string
    stdin?: string
}): Promise<RunResult> {
    const started = Bun.nanoseconds()
    const proc = Bun.spawn(['bun', HANDLER], {
        cwd: opts.cwd,
        env: { ...process.env, HOME: opts.home },
        stdin: new TextEncoder().encode(opts.stdin ?? STDIN_PAYLOAD),
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    return {
        exitCode,
        stdout,
        stderr,
        ms: (Bun.nanoseconds() - started) / 1_000_000,
    }
}

/** The additionalContext string from a handler run. Fails if absent. */
function additionalContextOf(result: RunResult): string {
    const parsed = JSON.parse(result.stdout) as {
        hookSpecificOutput?: { hookEventName?: string; additionalContext?: string }
    }
    expect(parsed.hookSpecificOutput?.hookEventName).toBe('SessionStart')
    const context = parsed.hookSpecificOutput?.additionalContext
    expect(typeof context).toBe('string')
    return context as string
}

describe('handoff-inbox handler — the payoff', () => {
    test('a pending envelope addressed to this repo reaches the session', async () => {
        const repo = makeRepo()
        const { home, mailboxDir } = makeHome()
        writeEnvelope(mailboxDir, envelope('hoi_reaches', repo))

        const result = await runHandler({ cwd: repo, home })

        expect(result.exitCode).toBe(0)
        const context = additionalContextOf(result)
        expect(context).toContain('hoi_reaches')
        // The delimiter carries a per-invocation nonce, so match the prefix
        // and then prove open and close agree on the same one.
        expect(context).toContain(`${OPEN_PREFIX} id="`)
        const nonce = (context.match(/id="([^"]+)"/) as RegExpMatchArray)[1]
        expect(context).toContain(`${CLOSE_PREFIX} id="${nonce}">`)
        expect(context).toContain('wire the shared auth client')
        expect(context).toContain('do not act on them')
    })

    test('the handler MUTATES NOTHING — envelope bytes and listing unchanged', async () => {
        // anti-01 / anti-02. The hook surfaces; accepting stays an explicit
        // `luca handoff accept`. `list` is also the only transport method
        // that creates nothing (the module's sole mkdirSync is in `send`),
        // so this asserts that property has not regressed.
        const repo = makeRepo()
        const { home, mailboxDir } = makeHome()
        const path = writeEnvelope(mailboxDir, envelope('hoi_readonly', repo))

        const bytesBefore = readFileSync(path)
        const listingBefore = readdirSync(mailboxDir).sort()

        const result = await runHandler({ cwd: repo, home })
        expect(result.exitCode).toBe(0)
        // Fail-closed: prove the handler actually READ the envelope, so this
        // cannot pass by the handler having done nothing at all.
        expect(additionalContextOf(result)).toContain('hoi_readonly')

        expect(readFileSync(path).equals(bytesBefore)).toBe(true)
        expect(readdirSync(mailboxDir).sort()).toEqual(listingBefore)
    })

    test('the notice is never an auto-accept', async () => {
        const repo = makeRepo()
        const { home, mailboxDir } = makeHome()
        writeEnvelope(mailboxDir, envelope('hoi_noauto', repo))

        const context = additionalContextOf(
            await runHandler({ cwd: repo, home })
        )
        expect(context).toContain('luca handoff accept')
        expect(context).not.toContain('auto-accept')
        // The envelope is still pending on disk.
        const onDisk = JSON.parse(
            readFileSync(join(mailboxDirFor({ homedir: home }), 'hoi_noauto.json'), 'utf-8')
        ) as HandoffEnvelope
        expect(onDisk.status).toBe('pending')
    })
})

describe('handoff-inbox handler — silence when there is nothing to say', () => {
    test('an envelope addressed to a DIFFERENT repo is not surfaced', async () => {
        const repo = makeRepo()
        const other = makeRepo()
        const { home, mailboxDir } = makeHome()
        writeEnvelope(mailboxDir, envelope('hoi_other', other))

        const result = await runHandler({ cwd: repo, home })

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe('')
    })

    test('an ACCEPTED envelope addressed to this repo is not surfaced', async () => {
        // Only `pending` is news. Re-announcing work already taken on would
        // make the notice noise, and noise gets ignored.
        const repo = makeRepo()
        const { home, mailboxDir } = makeHome()
        writeEnvelope(
            mailboxDir,
            envelope('hoi_accepted', repo, { status: 'accepted' })
        )

        const result = await runHandler({ cwd: repo, home })

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe('')
    })
})

describe('handoff-inbox handler — degrades silently', () => {
    // This hook fires at EVERY session start in EVERY repo the user opens.
    // An error banner in an unrelated repo is the worst possible regression
    // of this feature, so each entry path gets its own case and each asserts
    // BOTH an empty stdout and a zero exit.

    test('path 1: cwd has no .luca/ directory', async () => {
        const repo = tempDir('hoi-bare-') // deliberately no .luca/
        const { home, mailboxDir } = makeHome()
        // A matching envelope EXISTS — so this proves the fast-exit fires
        // before any mailbox I/O, not that there was simply nothing to find.
        writeEnvelope(mailboxDir, envelope('hoi_noluca', repo))

        const result = await runHandler({ cwd: repo, home })

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe('')
    })

    test('path 2: the mailbox directory does not exist', async () => {
        const repo = makeRepo()
        const home = tempDir('hoi-nomailbox-') // no .luca/handoff/ under it

        const result = await runHandler({ cwd: repo, home })

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe('')
        // And the handler created nothing: `list` must never mkdir.
        expect(existsSync(mailboxDirFor({ homedir: home }))).toBe(false)
    })

    test('path 3: the only envelope in the mailbox is corrupt', async () => {
        const repo = makeRepo()
        const { home, mailboxDir } = makeHome()
        writeFileSync(join(mailboxDir, 'hoi_corrupt.json'), 'not json')

        const result = await runHandler({ cwd: repo, home })

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe('')
        expect(result.stderr).not.toContain('SyntaxError')
    })

    test('path 5: stdin is malformed', async () => {
        // Path 4 (empty homedir) is unreachable by spawn — see the block
        // below. Numbering follows the handler docstring.
        const repo = makeRepo()
        const { home, mailboxDir } = makeHome()
        writeEnvelope(mailboxDir, envelope('hoi_badstdin', repo))

        const result = await runHandler({
            cwd: repo,
            home,
            stdin: 'not json',
        })

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe('')
    })

    test('path 6: the mailbox is unreadable, so list() returns non-ok', async () => {
        const repo = makeRepo()
        const { home, mailboxDir } = makeHome()
        writeEnvelope(mailboxDir, envelope('hoi_locked', repo))
        // readdir now fails EACCES -> `io-error`, one of the 8 failure
        // reasons. All 8 must collapse to silence.
        chmodSync(mailboxDir, 0o000)

        try {
            const result = await runHandler({ cwd: repo, home })

            expect(result.exitCode).toBe(0)
            expect(result.stdout.trim()).toBe('')
            // No stack trace: the user must never see this hook's internals.
            expect(result.stderr).not.toContain('at ')
            expect(result.stderr).not.toContain('Error:')
        } finally {
            chmodSync(mailboxDir, 0o700)
        }
    })

    test('path 7: the top-level catch-all is wired', async () => {
        // The `main().then(ok, () => process.exit(0))` tail is what turns any
        // unanticipated throw into silence instead of a session-start banner.
        const source = readFileSync(HANDLER, 'utf-8')
        expect(source).toContain('process.exit(0)')
        expect(source).toContain('main().then(')
    })

    test('path 7 reaches MODULE EVALUATION too: luca-core loads dynamically', () => {
        // MF-4. `main().then(ok, exit0)` cannot catch a throw during module
        // EVALUATION, so a static import of the luca-core handoff graph would
        // put a bad bundle or a version skew OUTSIDE the catch-all — an
        // uncaught stack trace at every session start in every repo. Both
        // paths that can reach that graph must therefore be dynamic.
        const source = readFileSync(HANDLER, 'utf-8')

        // Positive: the deferred forms are present (whitespace-tolerant, so
        // a reformat does not silently turn this green-for-nothing).
        expect(source).toMatch(
            /await import\(\s*'@alecsibilia\/luca-core\/handoff'\s*\)/
        )
        expect(source).toMatch(
            /await import\(\s*'\.\/resolve-mailbox-dir\.ts'\s*\)/
        )

        // Fail-closed: no STATIC import in the module-eval phase can reach
        // luca-core. Only the two dynamic sites above may mention it, and
        // `resolve-mailbox-dir.ts` is the module that statically imports
        // `mailboxDirFor`, so it must not be statically imported either.
        const staticImports = source
            .split(String.fromCharCode(10))
            .filter((l) => /^import[\s{]/.test(l) || /^} from /.test(l))
            .join(String.fromCharCode(10))
        expect(staticImports).not.toContain('luca-core')
        expect(staticImports).not.toContain('resolve-mailbox-dir')
        // And the handler still WORKS with the deferred imports — proven by
        // every positive case above, which would go red on a broken specifier.
    })
})

describe('handoff-inbox handler — empty homedir (path 4)', () => {
    // DEVIATION, recorded deliberately. The plan specified this case as a
    // spawn with `HOME=''`. That does not work: on POSIX `os.homedir()` falls
    // back to the passwd database when `HOME` is unset or empty, so the
    // spawned process receives the developer's REAL home and the guard never
    // runs. Verified directly: `HOME= bun -e "homedir()"` prints the real
    // home path, not the empty string. A spawn-based case would therefore be
    // green whether or not the guard exists — precisely the trivially-passing
    // shape this suite must avoid.
    //
    // The guard is instead extracted into a pure function and probed with the
    // input that matters, plus a demonstration of the exact failure it
    // prevents.

    test('the guard bails out on an empty or whitespace homedir', () => {
        expect(resolveMailboxDir('')).toBeNull()
        expect(resolveMailboxDir('   ')).toBeNull()
    })

    test('MF-2: the guard bails out on any RELATIVE homedir', () => {
        // Empty was only the most obvious way to get a relative join. The
        // property that matters is ABSOLUTENESS: on POSIX `os.homedir()`
        // returns `$HOME` when set, so `HOME="."` is enough to make the
        // mailbox resolve to the CURRENT REPO's `.luca/handoff/` — a
        // repo-local directory writable by the agent's own Write tool and by
        // anything that lands in a checkout, which would turn a checked-in
        // `.luca/handoff/*.json` into a prompt-injection delivery vector.
        expect(resolveMailboxDir('.')).toBeNull()
        expect(resolveMailboxDir('tmp')).toBeNull()
        expect(resolveMailboxDir('./sub')).toBeNull()
        expect(resolveMailboxDir('../up')).toBeNull()
    })

    test('MF-2 fail-closed: an ABSOLUTE homedir still resolves', () => {
        // Without this arm, a guard that returned null unconditionally would
        // pass every case above while disabling the feature entirely.
        const { home } = makeHome()
        expect(resolveMailboxDir(home)).toBe(mailboxDirFor({ homedir: home }))
        expect(resolveMailboxDir(home)?.startsWith('/')).toBe(true)
    })

    test('MF-2 end-to-end: HOME="." does not surface the repo-local decoy', async () => {
        // The spawn half. A decoy mailbox is planted in the repo and HOME is
        // pointed at a relative path, which is the whole exploit; the handler
        // must still say nothing.
        const repo = makeRepo()
        const decoy = join(repo, '.luca', 'handoff')
        mkdirSync(decoy, { recursive: true })
        writeEnvelope(decoy, envelope('hoi_reldecoy', repo))
        // Prove the decoy IS reachable via the relative path, so this test
        // cannot pass because there was nothing to find.
        expect(existsSync(join(repo, '.luca', 'handoff', 'hoi_reldecoy.json'))).toBe(
            true
        )

        const result = await runHandler({ cwd: repo, home: '.' })

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe('')
    })

    test('the guard is load-bearing: an unguarded join is RELATIVE', () => {
        // This is what the guard prevents. `mailboxDirFor` simply joins, so
        // an empty homedir yields a RELATIVE path, which resolves against
        // process.cwd() — turning any repo-local `.luca/handoff/` into the
        // machine-global mailbox.
        const unguarded = mailboxDirFor({ homedir: '' })
        expect(unguarded.startsWith('/')).toBe(false)
        expect(unguarded).toBe('.luca/handoff')
    })

    test('a decoy repo-local mailbox would be read by an unguarded handler', () => {
        // Plant the decoy the plan describes and resolve the unguarded
        // relative path against it, showing the decoy IS reachable that way —
        // so the guard is closing a real hole, not a hypothetical one.
        const repo = makeRepo()
        const decoy = join(repo, '.luca', 'handoff')
        mkdirSync(decoy, { recursive: true })
        writeEnvelope(decoy, envelope('hoi_decoy', repo))

        const unguardedResolved = join(repo, mailboxDirFor({ homedir: '' }))
        expect(existsSync(join(unguardedResolved, 'hoi_decoy.json'))).toBe(true)
        // And the guarded path refuses to produce any directory at all.
        expect(resolveMailboxDir('')).toBeNull()
    })

    test('the decoy is NOT surfaced when the handler actually runs there', async () => {
        // The spawn half of the criterion, kept for its observational value:
        // a repo carrying its own `.luca/handoff/` must not have it treated
        // as the mailbox. `HOME` points at a real (empty) temp mailbox here,
        // so the only way the decoy could surface is via the relative-path
        // bug.
        const repo = makeRepo()
        const decoy = join(repo, '.luca', 'handoff')
        mkdirSync(decoy, { recursive: true })
        writeEnvelope(decoy, envelope('hoi_decoy2', repo))
        const { home } = makeHome()

        const result = await runHandler({ cwd: repo, home })

        expect(result.exitCode).toBe(0)
        expect(result.stdout.trim()).toBe('')
    })
})

describe('handoff-inbox handler — performance', () => {
    // The stated budget is < 150 ms p50. The 2000 ms bound asserted here is
    // deliberately generous: it is a catastrophic-regression guard, not the
    // budget. Both observations are printed and recorded in the execution
    // summary, because a number no one looks at is not a measurement.

    test('fast-exit path (no .luca/) completes well under budget', async () => {
        const repo = tempDir('hoi-perf-bare-')
        const { home } = makeHome()

        const result = await runHandler({ cwd: repo, home })

        console.log(
            `[perf] fast-exit (no .luca/): ${result.ms.toFixed(1)} ms`
        )
        expect(result.exitCode).toBe(0)
        expect(result.ms).toBeLessThan(2000)
    })

    test('realistic path (10-envelope mailbox) completes well under budget', async () => {
        const repo = makeRepo()
        const { home, mailboxDir } = makeHome()
        for (let i = 0; i < 10; i++) {
            writeEnvelope(mailboxDir, envelope(`hoi_perf_${i}`, repo))
        }

        const result = await runHandler({ cwd: repo, home })

        console.log(
            `[perf] full read (10 envelopes): ${result.ms.toFixed(1)} ms`
        )
        expect(result.exitCode).toBe(0)
        // Fail-closed: this must be the path that actually did the work.
        expect(additionalContextOf(result)).toContain('hoi_perf_0')
        expect(result.ms).toBeLessThan(2000)
    })
})
