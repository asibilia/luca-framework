import {
    existsSync,
    mkdirSync,
    readFileSync,
    realpathSync,
    writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { buildContext } from './build-context'
import { executeFinalReviewAction } from './execute-final-review'

import { createAgyLauncher } from '../agents/agy-launcher'
import { LENS_NAMES, LENS_ROLES, lensRole } from '../agents/role-results'
import { createGitAdapter } from '../git/git-adapter'
import { createJournal } from '../journal/journal'
import type { JournalEntry } from '../journal/journal-record'
import type { EngineClock } from '../limits/limit-wait'
import { storyAnswer } from '../story/testing/story-fixtures'
import {
    cleanupDir,
    createFakeAgySpawner,
    createTempRoot,
    makeAgyConfig,
    type FakeAgyTurnSpec,
} from '../testing/agy-e2e-helpers'
import { finalReviewStarted } from '../testing/final-review-fixtures'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    APPROVE,
    IMPLEMENTER_RESULT,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
    createPracticeRepo,
    makePracticeRepo,
    practiceTracker,
} from '../testing/practice-repo'
import { practiceTicket } from '../testing/run-fixtures'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/** Tier 4 real-world E2E workflow scenarios for Spec #777 (Scenarios 3–4). */

const StateRoleSchema = z.object({
    role: z.string(),
    turn_index: z.number(),
    instructions: z.string(),
})
const HookHandlerSchema = z.object({
    type: z.literal('command'),
    command: z.string(),
})
const HookCmdSchema = z.object({
    luca: z.object({
        SessionStart: z.array(HookHandlerSchema),
        PreToolUse: z.array(
            z.object({
                matcher: z.string(),
                hooks: z.array(HookHandlerSchema),
            })
        ),
        PreInvocation: z.array(HookHandlerSchema),
    }),
})

const roots: string[] = []

afterEach(() => {
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) cleanupDir({ dir })
    }
})

const hookCall = async ({
    argv,
    env,
    event,
    payload,
}: {
    argv: string[]
    env: Record<string, string>
    event: 'SessionStart' | 'PreToolUse' | 'PreInvocation'
    payload: Record<string, unknown>
}) => {
    const addDir = argv[argv.indexOf('--add-dir') + 1] ?? ''
    const hooks = HookCmdSchema.parse(
        JSON.parse(readFileSync(join(addDir, '.agents/hooks.json'), 'utf8'))
    )
    const command =
        event === 'PreToolUse'
            ? (hooks.luca.PreToolUse[0]?.hooks[0]?.command ?? '')
            : (hooks.luca[event][0]?.command ?? '')
    const proc = Bun.spawn(['sh', '-c', command], {
        stdin: new TextEncoder().encode(JSON.stringify(payload)),
        stdout: 'pipe',
        stderr: 'pipe',
        env,
    })
    const [exit_code, stdout] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
    ])
    const json: unknown = JSON.parse(stdout)
    return { exit_code, json }
}

const agyLines = ({
    id,
    structured_output,
    error,
    model = 'gemini-4-neon-high',
}: {
    id: string
    structured_output?: unknown
    error?: string
    model?: string
}): Record<string, unknown>[] => [
    { event: 'init', conversation_id: id, init: { model } },
    {
        event: 'result',
        result: {
            conversation_id: id,
            status: error === undefined ? 'SUCCESS' : 'ERROR',
            ...(structured_output === undefined ? {} : { structured_output }),
            ...(error === undefined ? {} : { error }),
        },
    },
]

const fakeClock = ({ start }: { start: string }) => {
    let nowMs = Date.parse(start)
    const slept: number[] = []
    const clock: EngineClock = {
        now: () => nowMs,
        sleep: async (ms) => {
            slept.push(ms)
            nowMs += ms
        },
    }
    return { clock, slept, now: () => nowMs }
}

const lensSeed = ({
    config,
    repo,
}: {
    config: ReturnType<typeof makeAgyConfig>
    repo: string
}): JournalEntry[] => [
    {
        kind: 'run_started',
        ticket: null,
        role: null,
        content: { spec_number: 10, config, base_branch: 'main' },
    },
    {
        kind: 'spec_snapshot',
        ticket: 10,
        role: null,
        content: {
            spec: specIssue({ number: 10 }),
            ticket_order: [11],
            closed_tickets: [],
        },
    },
    {
        kind: 'ticket_snapshot',
        ticket: 11,
        role: null,
        content: practiceTicket({ number: 11 }),
    },
    {
        kind: 'run_branch_created',
        ticket: null,
        role: null,
        content: { branch: 'main', path: repo, base_sha: 'b0' },
    },
    finalReviewStarted({ round: 1 }),
]

const quotaTurns = (): FakeAgyTurnSpec[] => [
    {
        lines: agyLines({
            id: 'tw-quota',
            error: 'RESOURCE_EXHAUSTED: Resets in 10m',
        }),
    },
    {
        on_spawn: ({ cwd }) => {
            mkdirSync(join(cwd, 'src'), { recursive: true })
            writeFileSync(join(cwd, 'src/sum.test.ts'), SUM_TEST)
        },
        lines: agyLines({
            id: 'tw-retry',
            structured_output: TEST_WRITER_RESULT,
        }),
    },
    { lines: agyLines({ id: 'impl-f', structured_output: '{invalid-json' }) },
    {
        on_spawn: ({ cwd }) => {
            writeFileSync(join(cwd, 'src/sum.ts'), SUM)
            writeFileSync(
                join(cwd, 'src/index.ts'),
                "export { sum } from './sum'\n"
            )
        },
        lines: agyLines({
            id: 'impl-f',
            structured_output: IMPLEMENTER_RESULT,
        }),
    },
    { lines: agyLines({ id: 'rev-1', structured_output: APPROVE }) },
    ...Array.from({ length: 5 }, (_, idx) => ({
        lines: agyLines({ id: `lens-${idx}`, structured_output: APPROVE }),
    })),
    { lines: agyLines({ id: 'story-1', structured_output: storyAnswer() }) },
]

describe('Tier 4 — realistic multi-feature agy workflows (Scenarios 3–4)', () => {
    test('Scenario 3: concurrent 5-lens final review under agy uses isolated temp dirs and lockedPick', async () => {
        const root = createTempRoot({ prefix: 'luca-agy-w3-' })
        roots.push(root)
        const config = makeAgyConfig({
            provider: 'agy',
            rule_files: ['RULES.md'],
        })
        const { repo } = await makePracticeRepo({
            root,
            config,
            files: { 'RULES.md': '# Rules\nNo abbreviations.\n' },
        })
        const rawTemp = join(root, 'agy-tmp')
        mkdirSync(rawTemp, { recursive: true })
        const temp_root = realpathSync(rawTemp)
        const seenDirs = new Set<string>()
        const seenByRole = new Map<string, string>()
        const { spawner, calls } = createFakeAgySpawner({
            turns: LENS_NAMES.map((lens) => ({
                delay_ms: 15,
                on_spawn: async ({ argv, env }) => {
                    const dir = env.LUCA_AGY_STATE_DIR ?? ''
                    seenDirs.add(dir)
                    const raw = readFileSync(join(dir, 'state.json'), 'utf8')
                    const state = StateRoleSchema.parse(JSON.parse(raw))
                    seenByRole.set(state.role, state.instructions)
                    const ss = await hookCall({
                        argv,
                        env,
                        event: 'SessionStart',
                        payload: { hookEventName: 'SessionStart', cwd: repo },
                    })
                    expect(ss.exit_code).toBe(0)
                },
                lines: agyLines({
                    id: `conv-${lens}`,
                    structured_output: APPROVE,
                }),
            })),
        })

        const launcher = createAgyLauncher({
            agy_path: '/fake/agy',
            spawn: spawner,
            temp_root,
        })
        const journal = createJournal({
            file: join(root, 'runs/r-lenses/journal.jsonl'),
        })
        for (const entry of lensSeed({ config, repo })) journal.append(entry)
        const context = buildContext({
            journal,
            tracker: createInMemoryTracker({
                issues: [
                    specIssue({ number: 10 }),
                    ticketIssue({ number: 11 }),
                ],
                sub_tickets: { 10: [11] },
            }),
            git: createGitAdapter({ repo_root: repo }),
            launcher,
        })
        await Promise.all(
            LENS_NAMES.map((lens) =>
                executeFinalReviewAction({
                    action: {
                        type: 'launch_lens',
                        lens,
                        role: lensRole({ lens }),
                        prompt: `review ${lens}`,
                    },
                    context,
                })
            )
        )

        expect(seenDirs.size).toBe(5)
        expect(calls).toHaveLength(5)
        for (const role of LENS_ROLES) {
            expect(seenByRole.get(role)).toBeDefined()
            expect(seenByRole.get(role)).not.toContain('## Helpers')
        }
        expect(
            journal
                .read()
                .filter((r) => r.kind === 'agent_started')
                .map((r) =>
                    r.kind === 'agent_started' ? r.content.model : null
                )
        ).toEqual(Array.from({ length: 5 }, () => 'gemini-4-neon-high'))

        await launcher.closeAll()
        for (const dir of seenDirs) expect(existsSync(dir)).toBe(false)
        expect((await $`git status --porcelain`.cwd(repo).text()).trim()).toBe(
            ''
        )
    })

    test('Scenario 4: RESOURCE_EXHAUSTED triggers agy_quota limit-wait and recovers with follow-up to PR', async () => {
        const root = createTempRoot({ prefix: 'luca-agy-w4-' })
        roots.push(root)
        const rawTemp = join(root, 'agy-tmp')
        mkdirSync(rawTemp, { recursive: true })
        const temp_root = realpathSync(rawTemp)
        const config = makeAgyConfig({ provider: 'agy' })
        const practice = await createPracticeRepo({ root, config })
        const time = fakeClock({ start: '2026-11-20T12:00:00.000Z' })
        const tracker = practiceTracker()
        const { spawner, calls } = createFakeAgySpawner({
            turns: quotaTurns(),
        })
        const launcher = createAgyLauncher({
            agy_path: '/fake/agy',
            spawn: spawner,
            temp_root,
            now: time.now,
        })
        const { action, records } = await practice.run({
            launcher,
            tracker,
            clock: time.clock,
        })
        await launcher.closeAll()

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(time.slept.length).toBeGreaterThan(0)
        expect(
            records.find((r) => r.kind === 'limit_wait_started')
        ).toMatchObject({
            content: {
                rate_limit_type: 'agy_quota',
                hit_ticket: 11,
                hit_role: 'test-writer',
            },
        })
        expect(records.some((r) => r.kind === 'limit_wait_ended')).toBe(true)
        expect(tracker.commentsOn({ number: 10 })[0]).toContain(
            "the plan's Antigravity quota usage limit"
        )
        expect(
            calls.some(
                (c) =>
                    c.argv.includes('--conversation') &&
                    c.argv.includes('impl-f')
            )
        ).toBe(true)
        expect(tracker.pullRequests()).toHaveLength(1)
    }, 120_000)
})
