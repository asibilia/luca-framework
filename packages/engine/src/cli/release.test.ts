import { existsSync, realpathSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runRelease } from './release'

import { startRun } from '../core/execute'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalEntry } from '../journal/journal-record'
import {
    git,
    makePracticeRepo,
    PRACTICE_ENGINE_CONFIG,
} from '../testing/practice-repo'

/**
 * `luca-release` end to end (seam 4): a throwaway working copy with a local
 * bare `origin`, a pinned clone in a temp folder, a fake Paseo CLI, and run
 * state (journals and a board registry) written to temp folders.
 */

/** Noon UTC, so the date is 2026-09-25 in any nearby time zone. */
const NOON = Date.parse('2026-09-25T12:00:00Z')
const TODAY_TAG = 'luca-2026.09.25'

/** A workspace repo shaped like luca-framework, with one passing test. */
const RELEASE_FILES = {
    'package.json': JSON.stringify(
        {
            name: 'practice-luca',
            private: true,
            workspaces: ['packages/*'],
        },
        null,
        4
    ),
    'packages/board/package.json': JSON.stringify(
        { name: '@practice/board', version: '0.0.0', private: true },
        null,
        4
    ),
    'packages/board/paseo-plugin.json': '{}\n',
    'packages/engine/package.json': JSON.stringify(
        { name: '@practice/engine', version: '0.0.0', private: true },
        null,
        4
    ),
    'packages/engine/src/cli/luca-run.ts': '// A stand-in for the engine.\n',
    'src/ok.test.ts': `import { expect, test } from 'bun:test'

test('ok', () => {
    expect(1 + 1).toBe(2)
})
`,
}

/** A Paseo CLI that keeps every call. */
const fakePaseo = () => {
    const installs: { path: string; id: string }[] = []
    const engine_paths: { plugin_id: string; engine_path: string }[] = []
    return {
        paseo: {
            installPlugin: async ({
                path,
                id,
            }: {
                path: string
                id: string
            }) => {
                installs.push({ path, id })
            },
            setEnginePath: async ({
                plugin_id,
                engine_path,
            }: {
                plugin_id: string
                engine_path: string
            }) => {
                engine_paths.push({ plugin_id, engine_path })
            },
        },
        installs: () => installs,
        engine_paths: () => engine_paths,
    }
}

let root = ''
let repo = ''
let origin = ''
let pinned_dir = ''
let runs_dir = ''
let registry_path = ''
const logs: string[] = []
const log = (line: string) => {
    logs.push(line)
}

beforeEach(async () => {
    root = realpathSync(await mkdtemp(join(tmpdir(), 'luca-release-')))
    logs.length = 0
    const made = await makePracticeRepo({ root, files: RELEASE_FILES })
    repo = made.repo
    origin = made.origin
    await git(repo, 'config', 'tag.gpgsign', 'false')
    pinned_dir = join(root, 'share', 'luca')
    runs_dir = join(root, 'runs')
    registry_path = join(root, 'board', 'runs.json')
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const release = async ({
    paseo,
    now = NOON,
}: {
    paseo: ReturnType<typeof fakePaseo>['paseo']
    now?: number
}) =>
    runRelease({
        repo,
        pinned_dir,
        runs_dir,
        registry_path,
        paseo,
        now: () => now,
        log,
    })

/** Everything the command printed, its end message included. */
const printed = (end: { message: string }): string =>
    [...logs, end.message].join('\n')

/** The `luca-*` tags in a repo. */
const lucaTags = async (cwd: string): Promise<string[]> =>
    (await git(cwd, 'tag', '--list', 'luca-*'))
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')

/** Commits a change on `main` and pushes it to `origin`. */
const commitAndPush = async ({
    path,
    text,
}: {
    path: string
    text: string
}) => {
    await Bun.write(join(repo, path), text)
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', `change ${path}`)
    await git(repo, 'push', '-q', 'origin', 'main')
}

/** Checks the refused release left no trace. */
const expectNothingChanged = async ({
    paseo,
}: {
    paseo: ReturnType<typeof fakePaseo>
}) => {
    expect(await lucaTags(repo)).toEqual([])
    expect(await lucaTags(origin)).toEqual([])
    expect(existsSync(pinned_dir)).toBe(false)
    expect(paseo.installs()).toEqual([])
    expect(paseo.engine_paths()).toEqual([])
}

/** A run journal that started spec `spec_number` in `run_repo`, then got `entries`. */
const writeRun = ({
    run_id,
    spec_number,
    run_repo,
    entries,
}: {
    run_id: string
    spec_number: number
    run_repo: string
    entries: JournalEntry[]
}) => {
    const journal = createJournal({
        file: runJournalPath({ runs_dir, run_id }),
    })
    startRun({
        journal,
        spec_number,
        config: PRACTICE_ENGINE_CONFIG,
        repo: run_repo,
    })
    for (const entry of entries) journal.append(entry)
}

/** A board registry entry; `ended` is `null` while its run may still go. */
const registryEntry = ({
    run_id,
    spec,
    run_repo,
    ended,
}: {
    run_id: string
    spec: number
    run_repo: string
    ended: { ok: boolean; message: string } | null
}) => ({
    run_id,
    token: 'secret',
    agent_id: 'agent-1',
    workspace_id: 'workspace-1',
    repo: run_repo,
    spec,
    demo: false,
    started_at: '2026-09-25T10:00:00.000Z',
    log_path: `/tmp/${run_id}.log`,
    ended,
    restarts: 0,
})

const writeRegistry = async ({ runs }: { runs: object[] }) => {
    await Bun.write(
        registry_path,
        JSON.stringify({ version: 1, runs }, null, 2)
    )
}

describe('luca-release refuses on a working copy that is not a clean, current main', () => {
    test('a dirty main is refused and nothing changes', async () => {
        const paseo = fakePaseo()
        await Bun.write(join(repo, 'README.md'), '# Half-done edit\n')

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(false)
        await expectNothingChanged({ paseo })
        expect(await Bun.file(join(repo, 'README.md')).text()).toBe(
            '# Half-done edit\n'
        )
    }, 60_000)

    test('a main with a commit origin does not have is refused and nothing changes', async () => {
        const paseo = fakePaseo()
        await Bun.write(join(repo, 'README.md'), '# Not pushed\n')
        await git(repo, 'commit', '-q', '-am', 'not pushed')

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(false)
        await expectNothingChanged({ paseo })
    }, 60_000)

    test('a main behind origin/main is refused and nothing changes', async () => {
        const paseo = fakePaseo()
        const other = join(root, 'other')
        await $`git clone -q ${origin} ${other}`.quiet()
        await git(other, 'config', 'user.name', 'Other')
        await git(other, 'config', 'user.email', 'other@example.com')
        await git(other, 'config', 'commit.gpgsign', 'false')
        await git(other, 'config', 'core.hooksPath', join(root, 'no-hooks'))
        await Bun.write(join(other, 'README.md'), '# Merged elsewhere\n')
        await git(other, 'commit', '-q', '-am', 'merged elsewhere')
        await git(other, 'push', '-q', 'origin', 'main')

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(false)
        await expectNothingChanged({ paseo })
    }, 60_000)

    test('a working copy on another branch is refused and nothing changes', async () => {
        const paseo = fakePaseo()
        await git(repo, 'checkout', '-q', '-b', 'feature')

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(false)
        await expectNothingChanged({ paseo })
    }, 60_000)

    test('a failing gate is refused, names the gate, and nothing changes', async () => {
        const paseo = fakePaseo()
        // The practice lint gate fails on any console.log under src/.
        await commitAndPush({
            path: 'src/noisy.ts',
            text: 'console.log("noisy")\nexport {}\n',
        })

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(false)
        expect(printed(end)).toContain('lint')
        await expectNothingChanged({ paseo })
    }, 60_000)
})

describe('luca-release refuses while a run is going', () => {
    test('runs in a limit wait, waiting for a reply, or in the board registry are listed by spec and repo, and nothing changes', async () => {
        const paseo = fakePaseo()
        writeRun({
            run_id: 'run-limit',
            spec_number: 10,
            run_repo: '/code/app',
            entries: [
                {
                    kind: 'limit_wait_started',
                    ticket: null,
                    role: null,
                    content: {
                        resets_at: '2026-09-25T15:00:00.000Z',
                        until: '2026-09-25T15:01:00.000Z',
                        rate_limit_type: 'five_hour',
                        hit_ticket: 11,
                        hit_role: 'implementer',
                    },
                },
            ],
        })
        writeRun({
            run_id: 'run-stuck',
            spec_number: 20,
            run_repo: '/code/other',
            entries: [
                {
                    kind: 'ticket_stuck',
                    ticket: 21,
                    role: null,
                    content: {
                        reason: 'gates_failed',
                        detail: 'lint failed',
                    },
                },
                {
                    kind: 'stuck_reported',
                    ticket: 21,
                    role: null,
                    content: { comment_id: 5, body: 'Ticket #21 is stuck.' },
                },
            ],
        })
        await writeRegistry({
            runs: [
                registryEntry({
                    run_id: 'run-board',
                    spec: 42,
                    run_repo: '/code/tmnb',
                    ended: null,
                }),
            ],
        })

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(false)
        const text = printed(end)
        expect(text).toContain('#10')
        expect(text).toContain('/code/app')
        expect(text).toContain('#20')
        expect(text).toContain('/code/other')
        expect(text).toContain('#42')
        expect(text).toContain('/code/tmnb')
        await expectNothingChanged({ paseo })
    }, 60_000)

    test('a run waiting for a reply alone is enough to refuse', async () => {
        const paseo = fakePaseo()
        writeRun({
            run_id: 'run-stuck',
            spec_number: 20,
            run_repo: '/code/other',
            entries: [
                {
                    kind: 'ticket_stuck',
                    ticket: 21,
                    role: null,
                    content: {
                        reason: 'gates_failed',
                        detail: 'lint failed',
                    },
                },
                {
                    kind: 'stuck_reported',
                    ticket: 21,
                    role: null,
                    content: { comment_id: 5, body: 'Ticket #21 is stuck.' },
                },
            ],
        })

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(false)
        expect(printed(end)).toContain('#20')
        expect(printed(end)).toContain('/code/other')
        await expectNothingChanged({ paseo })
    }, 60_000)

    test('finished runs, in journals or the board registry, do not stop a release', async () => {
        const paseo = fakePaseo()
        writeRun({
            run_id: 'run-done',
            spec_number: 10,
            run_repo: '/code/app',
            entries: [
                {
                    kind: 'nothing_to_do',
                    ticket: null,
                    role: null,
                    content: { closed_tickets: [] },
                },
            ],
        })
        await writeRegistry({
            runs: [
                registryEntry({
                    run_id: 'run-done',
                    spec: 10,
                    run_repo: '/code/app',
                    ended: { ok: true, message: 'Nothing to do.' },
                }),
            ],
        })

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(true)
        expect(await lucaTags(origin)).toEqual([TODAY_TAG])
    }, 60_000)
})

describe('luca-release makes a release and switches to it', () => {
    test("the tag is today's luca-YYYY.MM.DD, whatever older tags exist", async () => {
        const paseo = fakePaseo()
        await git(repo, 'tag', 'luca-2026.09.24')
        await git(repo, 'tag', 'v13.0.0')
        await git(repo, 'push', '-q', 'origin', '--tags')

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(true)
        expect(await lucaTags(repo)).toEqual(['luca-2026.09.24', TODAY_TAG])
    }, 60_000)

    test('the tag is pushed to origin at the tip of main', async () => {
        const paseo = fakePaseo()
        const main = (await git(repo, 'rev-parse', 'main')).trim()

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(true)
        expect(await lucaTags(origin)).toEqual([TODAY_TAG])
        expect(
            (await git(origin, 'rev-parse', `${TODAY_TAG}^{commit}`)).trim()
        ).toBe(main)
    }, 60_000)

    test('the first release creates the pinned clone, checked out at the tag and installed from the lockfile', async () => {
        const paseo = fakePaseo()
        expect(existsSync(pinned_dir)).toBe(false)

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(true)
        // A clone of its own, not a worktree of the working copy.
        expect(statSync(join(pinned_dir, '.git')).isDirectory()).toBe(true)
        expect((await git(pinned_dir, 'rev-parse', 'HEAD')).trim()).toBe(
            (await git(origin, 'rev-parse', `${TODAY_TAG}^{commit}`)).trim()
        )
        expect(
            (
                await git(pinned_dir, 'describe', '--tags', '--exact-match')
            ).trim()
        ).toBe(TODAY_TAG)
        expect(existsSync(join(pinned_dir, 'bun.lock'))).toBe(true)
        expect(
            existsSync(join(pinned_dir, 'node_modules', '@practice', 'board'))
        ).toBe(true)
        expect(
            existsSync(join(pinned_dir, 'node_modules', '@practice', 'engine'))
        ).toBe(true)
    }, 60_000)

    test('the plugin is installed from the pinned clone as luca-board, and engine_path is the pinned luca-run', async () => {
        const paseo = fakePaseo()

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(true)
        expect(paseo.installs()).toEqual([
            { path: join(pinned_dir, 'packages', 'board'), id: 'luca-board' },
        ])
        expect(paseo.engine_paths()).toEqual([
            {
                plugin_id: 'luca-board',
                engine_path: join(
                    pinned_dir,
                    'packages',
                    'engine',
                    'src',
                    'cli',
                    'luca-run.ts'
                ),
            },
        ])
    }, 60_000)

    test('it prints the live release and the /reload-skills reminder', async () => {
        const paseo = fakePaseo()

        const end = await release({ paseo: paseo.paseo })

        expect(end.ok).toBe(true)
        expect(printed(end)).toContain(TODAY_TAG)
        expect(printed(end)).toContain('/reload-skills')
    }, 60_000)

    test('a second release the same day is tagged .2 and moves the existing pinned clone to it', async () => {
        const paseo = fakePaseo()
        const first = await release({ paseo: paseo.paseo })
        expect(first.ok).toBe(true)
        const first_sha = (await git(repo, 'rev-parse', 'main')).trim()

        await commitAndPush({ path: 'src/more.ts', text: 'export {}\n' })
        const second_sha = (await git(repo, 'rev-parse', 'main')).trim()
        logs.length = 0
        const second = await release({
            paseo: paseo.paseo,
            now: NOON + 60 * 60 * 1000,
        })

        expect(second.ok).toBe(true)
        const second_tag = `${TODAY_TAG}.2`
        expect(await lucaTags(origin)).toEqual([TODAY_TAG, second_tag])
        expect(
            (await git(origin, 'rev-parse', `${TODAY_TAG}^{commit}`)).trim()
        ).toBe(first_sha)
        expect(
            (await git(origin, 'rev-parse', `${second_tag}^{commit}`)).trim()
        ).toBe(second_sha)
        expect((await git(pinned_dir, 'rev-parse', 'HEAD')).trim()).toBe(
            second_sha
        )
        expect(existsSync(join(pinned_dir, 'src', 'more.ts'))).toBe(true)
        expect(paseo.installs()).toHaveLength(2)
        expect(printed(second)).toContain(second_tag)
        expect(printed(second)).toContain('/reload-skills')
    }, 120_000)
})

describe('the engine README', () => {
    test('has a "Releasing Luca" section about luca-release', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()
        const start = readme.indexOf('\n## Releasing Luca')
        expect(start).toBeGreaterThan(-1)
        const rest = readme.slice(start + 1)
        const next = rest.indexOf('\n## ')
        const section = next === -1 ? rest : rest.slice(0, next)
        expect(section).toContain('luca-release')
        expect(section).toContain('/reload-skills')
    })
})
