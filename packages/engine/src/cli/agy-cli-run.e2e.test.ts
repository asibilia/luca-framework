import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterEach, describe, expect, test } from 'bun:test'

import { readRunStart } from './read-run'
import { parseRunArgs, RUN_USAGE } from './run-args'

import { decideUsageLine } from '../core/decide-usage-line'
import { startRun } from '../core/execute'
import { createJournal, runJournalPath } from '../journal/journal'
import { replayRun } from '../journal/replay'
import { DEFAULT_USAGE_LINES } from '../limits/usage-line'
import {
    cleanupDir,
    createTempRoot,
    makeAgyConfig,
} from '../testing/agy-e2e-helpers'
import {
    agentSession,
    epochSeconds,
    intakePassed,
    practiceTicket,
    pullRequestOpened,
    RUN_BRANCH_PATH,
    runBranchCreated,
    storyOff,
    ticketBuilt,
    withInstalls,
    worktreesRemoved,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * E2E contract tests for Spec #777 Feature F13 (`run-args.ts`, `read-run.ts`,
 * `decide-usage-line.ts`, and `luca-run.ts` subprocess CLI smoke checks).
 * (`run-modes.ts` `runSpec`/`resumeRun` provider wiring is tested in
 * `agy-cli-run-modes.e2e.test.ts`.)
 */

const LUCA_RUN = join(import.meta.dir, 'luca-run.ts')
const roots: string[] = []

afterEach(() => {
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) cleanupDir({ dir })
    }
})

const makeTempDir = (): string => {
    const dir = createTempRoot({ prefix: 'luca-agy-cli-' })
    roots.push(dir)
    return dir
}

const makeReading = ({
    window,
    fill,
    resets_at = '2026-01-04T11:00:00.000Z',
    arrived_at = '2026-01-01T00:05:00.000Z',
}: {
    window: 'seven_day' | 'five_hour'
    fill: number
    resets_at?: string
    arrived_at?: string
}): Record<string, unknown> => ({
    status: 'allowed',
    rateLimitType: window,
    isUsingOverage: false,
    overageStatus: 'rejected',
    unifiedWindows: {
        [window]: {
            utilization: fill,
            resetsAt: epochSeconds(resets_at),
        },
    },
    arrived_at,
})

const makeStateForProvider = ({
    provider,
    records_extra = [],
}: {
    provider?: 'claude' | 'agy'
    records_extra?: Parameters<typeof recordsFrom>[0]['entries']
}) => {
    const config = makeAgyConfig({ provider: provider ?? 'claude' })
    const baseEntries = [
        ...intakePassed({ tickets: [practiceTicket({ number: 11 })] }),
        ...withInstalls({
            entries: [
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 2),
                ...records_extra,
            ],
        }),
    ]
    const entries = baseEntries.map((entry) =>
        entry.kind === 'run_started'
            ? {
                  ...entry,
                  content: {
                      ...entry.content,
                      config:
                          provider === undefined
                              ? entry.content.config
                              : config,
                  },
              }
            : entry
    )
    const records = recordsFrom({ entries })
    const state = replayRun({ records })
    return { state, records }
}

const runCliSubprocess = async ({
    argv,
    cwd,
    bin_dir,
    home_dir,
}: {
    argv: string[]
    cwd: string
    bin_dir: string
    home_dir: string
}): Promise<{ exit_code: number; stdout: string; stderr: string }> => {
    const fakeGh = join(bin_dir, 'gh')
    writeFileSync(
        fakeGh,
        [
            '#!/bin/sh',
            'case "$1 $2" in',
            '  "repo view") echo "acme/app" ;;',
            '  "api user") echo "octocat" ;;',
            '  "pr view") echo \'{"headRefOid":"b0","state":"OPEN","labels":[]}\' ;;',
            '  *) echo "" ;;',
            'esac',
            '',
        ].join('\n')
    )
    chmodSync(fakeGh, 0o755)
    const child = Bun.spawn([process.execPath, LUCA_RUN, ...argv], {
        cwd,
        env: {
            ...process.env,
            PATH: `${bin_dir}:${process.env.PATH ?? ''}`,
            HOME: home_dir,
            XDG_STATE_HOME: join(home_dir, 'xdg-state'),
            XDG_CONFIG_HOME: join(home_dir, 'xdg-config'),
            XDG_DATA_HOME: join(home_dir, 'xdg-data'),
            GH_TOKEN: '',
            GITHUB_TOKEN: '',
            LUCA_RUNS_DIR: join(home_dir, 'runs'),
            LUCA_STORIES_DIR: join(home_dir, 'stories'),
            LUCA_BOARD_STATE_DIR: '',
            LUCA_BOARD_TOKEN: '',
            CLOUDFLARE_ACCOUNT_ID: '',
            CLOUDFLARE_API_TOKEN: '',
            LUCA_MUNINN_URL: '',
            LUCA_MUNINN_TOKEN: '',
        },
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [exit_code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ])
    return { exit_code, stdout, stderr }
}

describe('F13: luca-run CLI, readRunStart & decideUsageLine — Tier 1 equivalence classes', () => {
    test('parseRunArgs accepts --provider agy and --provider claude, and omits provider key when absent', () => {
        const agy = parseRunArgs({
            argv: ['--spec', '12', '--provider', 'agy'],
            cwd: '/code/app',
            env: {},
        })
        const claude = parseRunArgs({
            argv: ['--spec', '12', '--provider', 'claude'],
            cwd: '/code/app',
            env: {},
        })
        const omitted = parseRunArgs({
            argv: ['--spec', '12'],
            cwd: '/code/app',
            env: {},
        })

        expect(agy).toMatchObject({
            ok: true,
            args: { mode: 'spec', spec_number: 12, provider: 'agy' },
        })
        expect(claude).toMatchObject({
            ok: true,
            args: { mode: 'spec', spec_number: 12, provider: 'claude' },
        })
        expect(omitted.ok).toBe(true)
        if (omitted.ok) {
            expect('provider' in omitted.args).toBe(false)
        }
        expect(RUN_USAGE).toContain('[--provider <claude|agy>]')
        expect(RUN_USAGE).toContain('--provider <id>')
    })

    test('readRunStart reads provider from journal config and defaults legacy journals to claude', () => {
        const dir = makeTempDir()
        const runs_dir = join(dir, 'runs')

        const agyJournal = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-agy' }),
        })
        startRun({
            journal: agyJournal,
            spec_number: 77,
            config: makeAgyConfig({ provider: 'agy' }),
            repo: '/code/app',
        })
        const agyStart = readRunStart({ runs_dir, run_id: 'run-agy' })
        expect(agyStart).toMatchObject({
            ok: true,
            start: { spec_number: 77, provider: 'agy' },
        })

        const legacyJournal = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'run-legacy' }),
        })
        startRun({
            journal: legacyJournal,
            spec_number: 88,
            config: {
                checks: { test: 'bun test' },
                test_file_patterns: ['**/*.test.ts'],
                test_setup_files: [],
                rule_files: [],
            },
            repo: '/code/app',
        })
        const legacyStart = readRunStart({ runs_dir, run_id: 'run-legacy' })
        expect(legacyStart).toMatchObject({
            ok: true,
            start: { spec_number: 88, provider: 'claude' },
        })
    })

    test('decideUsageLine returns start_usage_line_wait for claude and null for agy on identical readings', () => {
        const shared_readings = [
            makeReading({ window: 'seven_day', fill: 0.92 }),
        ]
        const claude = makeStateForProvider({ provider: 'claude' })
        const agy = makeStateForProvider({ provider: 'agy' })

        const claudeAction = decideUsageLine({
            state: claude.state,
            records: claude.records,
            spec_number: 10,
            next: [{ type: 'launch_agent' }],
            usage_lines: DEFAULT_USAGE_LINES,
            shared_readings,
        })
        const agyAction = decideUsageLine({
            state: agy.state,
            records: agy.records,
            spec_number: 10,
            next: [{ type: 'launch_agent' }],
            usage_lines: DEFAULT_USAGE_LINES,
            shared_readings,
        })

        expect(claudeAction).toMatchObject({
            type: 'start_usage_line_wait',
            window: 'seven_day',
            percent: 92,
        })
        expect(agyAction).toBeNull()
    })

    test('luca-run subprocess with isolated HOME/XDG_* and fake agy on PATH handles --provider agy and invalid provider', async () => {
        const dir = makeTempDir()
        const home_dir = join(dir, 'home')
        const bin_dir = join(dir, 'bin')
        const repo_dir = join(dir, 'repo')
        mkdirSync(home_dir, { recursive: true })
        mkdirSync(bin_dir, { recursive: true })
        mkdirSync(repo_dir, { recursive: true })

        const fakeAgy = join(bin_dir, 'agy')
        writeFileSync(fakeAgy, '#!/bin/sh\nexit 0\n')
        chmodSync(fakeAgy, 0o755)

        await $`git init -q -b main ${repo_dir}`.quiet()
        await $`git -C ${repo_dir} remote add origin https://github.com/acme/app.git`.quiet()

        const badProvider = await runCliSubprocess({
            argv: ['--spec', '12', '--provider', 'invalid'],
            cwd: dir,
            bin_dir,
            home_dir,
        })
        expect(badProvider.exit_code).toBe(2)
        expect(badProvider.stderr).toContain(
            'Invalid --provider "invalid": expected claude or agy.'
        )

        const missingConfig = await runCliSubprocess({
            argv: [
                '--spec',
                '12',
                '--provider',
                'agy',
                '--repo',
                repo_dir,
                '--run-id',
                'smoke-agy-1',
            ],
            cwd: dir,
            bin_dir,
            home_dir,
        })
        expect(missingConfig.exit_code).toBe(1)
        expect(missingConfig.stdout).toContain('No engine config found')
    }, 30_000)

    test('luca-run --resume <agy-run-id> subprocess resumes agy journal cleanly (#16)', async () => {
        const dir = makeTempDir()
        const home_dir = join(dir, 'home')
        const bin_dir = join(dir, 'bin')
        const repo_dir = join(dir, 'repo')
        const runs_dir = join(home_dir, 'runs')
        mkdirSync(home_dir, { recursive: true })
        mkdirSync(bin_dir, { recursive: true })
        mkdirSync(join(repo_dir, '.luca'), { recursive: true })

        await $`git init -q -b main ${repo_dir}`.quiet()
        await $`git -C ${repo_dir} remote add origin https://github.com/acme/app.git`.quiet()
        await $`git -C ${repo_dir} config user.email luca@example.com`.quiet()
        await $`git -C ${repo_dir} config user.name Luca`.quiet()
        writeFileSync(
            join(repo_dir, '.luca', 'config.json'),
            JSON.stringify(makeAgyConfig({ provider: 'agy' }))
        )
        await $`git -C ${repo_dir} add -A`.quiet()
        await $`git -C ${repo_dir} commit -q -m init`.quiet()

        const journal = createJournal({
            file: runJournalPath({ runs_dir, run_id: 'agy-resume-smoke' }),
        })
        startRun({
            journal,
            spec_number: 10,
            config: makeAgyConfig({ provider: 'agy' }),
            repo: repo_dir,
        })
        for (const entry of [
            ...intakePassed({
                tickets: [practiceTicket({ number: 11 })],
            }).slice(1),
            ...withInstalls({
                entries: [
                    runBranchCreated(),
                    pullRequestOpened(),
                    storyOff(),
                    worktreesRemoved({ paths: [RUN_BRANCH_PATH] }),
                ],
            }),
        ]) {
            journal.append(entry)
        }

        const fakeGh = join(bin_dir, 'gh')
        writeFileSync(
            fakeGh,
            `#!/usr/bin/env bun
const args = process.argv.slice(2)
const joined = args.join(' ')
if (args[0] === 'repo' && args[1] === 'view') console.log('acme/app')
else if (args[0] === 'api' && joined.includes('/dependencies/blocked_by')) console.log('[]')
else if (args[0] === 'api' && joined.includes('/comments')) console.log('[]')
else if (args[0] === 'api' && args[1] === 'user') console.log('octocat')
else if (args[0] === 'pr' && args[1] === 'list') console.log('[]')
`
        )
        chmodSync(fakeGh, 0o755)

        const resumed = Bun.spawn(
            [
                process.execPath,
                LUCA_RUN,
                '--resume',
                'agy-resume-smoke',
                '--repo',
                repo_dir,
            ],
            {
                cwd: dir,
                env: {
                    ...process.env,
                    PATH: `${bin_dir}:${process.env.PATH ?? ''}`,
                    HOME: home_dir,
                    XDG_STATE_HOME: join(home_dir, 'xdg-state'),
                    XDG_CONFIG_HOME: join(home_dir, 'xdg-config'),
                    XDG_DATA_HOME: join(home_dir, 'xdg-data'),
                    GH_TOKEN: '',
                    GITHUB_TOKEN: '',
                    LUCA_RUNS_DIR: runs_dir,
                    LUCA_STORIES_DIR: join(home_dir, 'stories'),
                    LUCA_BOARD_STATE_DIR: '',
                    LUCA_BOARD_TOKEN: '',
                    CLOUDFLARE_ACCOUNT_ID: '',
                    CLOUDFLARE_API_TOKEN: '',
                    LUCA_MUNINN_URL: '',
                    LUCA_MUNINN_TOKEN: '',
                },
                stdout: 'pipe',
                stderr: 'pipe',
            }
        )
        const [exit_code, stdout, stderr] = await Promise.all([
            resumed.exited,
            new Response(resumed.stdout).text(),
            new Response(resumed.stderr).text(),
        ])

        expect(stderr).toBe('')
        expect(stdout).toContain('[luca-run] resuming the run from its journal')
        expect(exit_code).toBe(0)
        const after = journal.read()
        expect(after.some((record) => record.kind === 'engine_resumed')).toBe(
            true
        )
        expect(after.some((record) => record.kind === 'run_ended')).toBe(true)
    }, 30_000)
})

describe('F13: luca-run CLI & decideUsageLine — Tier 2 boundaries & negatives', () => {
    test('parseRunArgs rejects unknown provider and case-variant AGY (case-sensitive CLI)', () => {
        for (const bad of ['openai', 'AGY', 'Claude', 'gemini', '']) {
            const parsed = parseRunArgs({
                argv: ['--spec', '12', '--provider', bad],
                cwd: '/code/app',
                env: {},
            })
            expect(parsed.ok).toBe(false)
            if (!parsed.ok) {
                expect(parsed.error).toContain(
                    `Invalid --provider "${bad}": expected claude or agy.`
                )
            }
        }
    })

    test('parseRunArgs rejects --provider combined with --demo, --resume, or --unfinished', () => {
        const demo = parseRunArgs({
            argv: ['--demo', '--provider', 'agy'],
            cwd: '/code/app',
            env: {},
        })
        expect(demo.ok).toBe(false)
        if (!demo.ok) {
            expect(demo.error).toContain(
                '--provider is for a run of a spec (--spec).'
            )
        }

        const resume = parseRunArgs({
            argv: ['--resume', 'run-1', '--provider', 'agy'],
            cwd: '/code/app',
            env: {},
        })
        expect(resume.ok).toBe(false)
        if (!resume.ok) {
            expect(resume.error).toContain(
                '--resume takes the provider from the journal.'
            )
        }

        const unfinished = parseRunArgs({
            argv: ['--unfinished', '--provider', 'agy'],
            cwd: '/code/app',
            env: {},
        })
        expect(unfinished.ok).toBe(false)
        if (!unfinished.ok) {
            expect(unfinished.error).toContain(
                '--unfinished takes no other flags.'
            )
        }
    })

    test('decideUsageLine returns null for agy even with active usage_wait and >100% readings', () => {
        const overReadings = [
            makeReading({ window: 'seven_day', fill: 1.05 }),
            makeReading({ window: 'five_hour', fill: 1.1 }),
        ]
        const { state, records } = makeStateForProvider({
            provider: 'agy',
            records_extra: [
                agentSession({
                    ticket: 11,
                    role: 'test-writer',
                    rate_limit_events: overReadings,
                }),
            ],
        })
        const stateWithWait = {
            ...state,
            plan: {
                ...state.plan,
                usage_wait: {
                    window: 'seven_day' as const,
                    line: 80,
                    percent: 95,
                    resets_at: '2026-01-04T11:00:00.000Z',
                    until: '2026-01-04T11:01:00.000Z',
                },
            },
        }

        expect(
            decideUsageLine({
                state: stateWithWait,
                records,
                spec_number: 10,
                next: [{ type: 'launch_agent' }],
                usage_lines: DEFAULT_USAGE_LINES,
                shared_readings: overReadings,
            })
        ).toBeNull()
    })
})
