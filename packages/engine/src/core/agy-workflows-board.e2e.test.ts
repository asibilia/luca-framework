import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { callWords, liveText } from '../../../board/client/live-line'
import {
    ENGINE_PATH,
    createHarness,
    type Harness,
} from '../../../board/server/testing/board-harness'
import {
    limitWaitStarted,
    specSnapshot,
    ticketSnapshot,
} from '../../../board/server/testing/journal-fixtures'
import { windowWords } from '../../../board/shared/board-state-usage'
import type { AgentLauncher } from '../agents/agent-launcher'
import { createScriptedLauncher } from '../agents/scripted-launcher'
import { readRunStart } from '../cli/read-run'
import { parseRunArgs } from '../cli/run-args'
import type { DecisionModelReply } from '../jev/clef-client'
import type { JevShadow } from '../jev/jev-shadow'
import { launchPick } from '../jev/model-pick'
import { replayRun } from '../journal/replay'
import { storyAnswer } from '../story/testing/story-fixtures'
import {
    cleanupDir,
    createTempRoot,
    makeAgyConfig,
    readJsonLines,
} from '../testing/agy-e2e-helpers'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import {
    APPROVE,
    CLEAN_LENS_TURNS,
    EMPTY_LEARNER_TURN,
    IMPLEMENTER_RESULT,
    SUM,
    SUM_TEST,
    TEST_WRITER_RESULT,
    VALID_STORY_TURN,
    createPracticeRepo,
    happyTurns,
    makePracticeRepo,
} from '../testing/practice-repo'

/**
 * Tier 4 real-world E2E workflow scenarios for Spec #777 (Scenarios 5–7):
 * 5. `ranCheaper` failure escalation (`gemini-4-argon-high` -> `gemini-4-neon-high`)
 * 6. `luca-run` CLI subprocess (`--spec --provider agy`) with fake `agy` + fake `gh`
 * 7. Paseo `/luca-run #42 --provider=AGY` via `createHarness()` + board rendering
 */

const LUCA_RUN = join(import.meta.dir, '../cli/luca-run.ts')
const BOARD_DIR = join(import.meta.dir, '../../../board')

const ThemeSchema = z.object({
    colors: z.object({
        surface0: z.string(),
        surface1: z.string(),
        surface2: z.string(),
        border: z.string(),
        foreground: z.string(),
        foregroundMuted: z.string(),
        accent: z.string(),
        accentForeground: z.string(),
        statusSuccess: z.string(),
        statusWarning: z.string(),
        statusDanger: z.string(),
    }),
})

const BoardLookModuleSchema = z.object({
    modelColor: z.custom<
        (args: { model: string; theme: z.infer<typeof ThemeSchema> }) => string
    >((value) => typeof value === 'function'),
})

const roots: string[] = []
let activeHarness: Harness | null = null

afterEach(async () => {
    if (activeHarness !== null) {
        await activeHarness.cleanup()
        activeHarness = null
    }
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) cleanupDir({ dir })
    }
})

const writeExecutable = ({ path, body }: { path: string; body: string }) => {
    writeFileSync(path, body)
    chmodSync(path, 0o755)
}

const buildFakeGhScript = ({
    spec_body,
    ticket_body,
}: {
    spec_body: string
    ticket_body: string
}): string => `#!/usr/bin/env bun
const args = process.argv.slice(2)
const joined = args.join(' ')
const spec = {
    number: 10,
    title: 'Practice spec',
    body: ${JSON.stringify(spec_body)},
    state: 'open',
    labels: ['ready-for-agent'],
    html_url: 'https://github.com/acme/app/issues/10',
    user: { login: 'spec-owner' },
}
const ticket = {
    number: 11,
    title: 'Add sum',
    body: ${JSON.stringify(ticket_body)},
    state: 'open',
    labels: ['ready-for-agent'],
    html_url: 'https://github.com/acme/app/issues/11',
    user: { login: 'spec-owner' },
}
if (args[0] === 'repo' && args[1] === 'view') {
    console.log('acme/app')
} else if (args[0] === 'api' && joined.includes('issues?state=all')) {
    console.log(JSON.stringify([{ number: 10 }]))
} else if (args[0] === 'api' && joined.includes('/issues/10/sub_issues')) {
    console.log(JSON.stringify([ticket]))
} else if (args[0] === 'api' && joined.includes('/dependencies/blocked_by')) {
    console.log('[]')
} else if (args[0] === 'api' && joined.endsWith('/issues/10')) {
    console.log(JSON.stringify(spec))
} else if (args[0] === 'api' && joined.endsWith('/issues/11')) {
    console.log(JSON.stringify(ticket))
} else if (args[0] === 'api' && joined.includes('/comments') && joined.includes('-f')) {
    console.log(JSON.stringify({ id: 1 }))
} else if (args[0] === 'api' && args[1] === 'user') {
    console.log('')
} else if (args[0] === 'pr' && args[1] === 'create') {
    console.log('https://github.com/acme/app/pull/1')
} else if (args[0] === 'pr' && args[1] === 'view') {
    console.log(JSON.stringify({ headRefOid: 'b0', state: 'OPEN', labels: [] }))
} else if (args[0] === 'pr' && args[1] === 'list') {
    console.log('[]')
} else if (args[0] === 'label' && args[1] === 'list') {
    console.log('')
}
`

const buildFakeAgyScript = (): string => `#!/usr/bin/env bun
import { mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const stateDir = process.env.LUCA_AGY_STATE_DIR ?? ''
const state = JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf8'))
const argv = process.argv.slice(2)
const model = argv[argv.indexOf('--model') + 1] ?? 'gemini-4-neon-high'
appendFileSync(
    join(homedir(), 'agy-calls.jsonl'),
    JSON.stringify({ role: state.role, model, argv, stateDir }) + '\\n'
)

let output = ${JSON.stringify(APPROVE)}
if (state.role === 'test-writer') {
    mkdirSync(join(process.cwd(), 'src'), { recursive: true })
    writeFileSync(join(process.cwd(), 'src', 'sum.test.ts'), ${JSON.stringify(SUM_TEST)})
    output = ${JSON.stringify(TEST_WRITER_RESULT)}
} else if (state.role === 'implementer') {
    writeFileSync(join(process.cwd(), 'src', 'sum.ts'), ${JSON.stringify(SUM)})
    writeFileSync(join(process.cwd(), 'src', 'index.ts'), "export { sum } from './sum'\\n")
    output = ${JSON.stringify(IMPLEMENTER_RESULT)}
} else if (state.role === 'story-writer') {
    output = ${JSON.stringify(storyAnswer())}
}

const convId = 'cli-conv-' + state.role + '-' + Date.now()
console.log(JSON.stringify({ event: 'init', conversation_id: convId, init: { model } }))
console.log(JSON.stringify({
    event: 'step_update',
    step_update: {
        step_index: 1,
        state: 'DONE',
        step_type: 'tool',
        tool_name: 'view_file',
        usage: { input_tokens: 50, output_tokens: 20, thinking_tokens: 10 },
    },
}))
console.log(JSON.stringify({
    event: 'result',
    result: {
        conversation_id: convId,
        status: 'SUCCESS',
        duration_seconds: 0.4,
        num_turns: 1,
        structured_output: output,
        usage: { input_tokens: 50, output_tokens: 20, thinking_tokens: 10 },
    },
}))
`

describe('Tier 4 — realistic multi-feature agy workflows (Scenarios 5–7)', () => {
    test('Scenario 5: ranCheaper escalates test-writer from gemini-4-argon-high to gemini-4-neon-high across journal replay and launchPick', async () => {
        const root = createTempRoot({ prefix: 'luca-agy-w5-' })
        roots.push(root)
        const config = makeAgyConfig({
            provider: 'agy',
            floors: { 'test-writer': 'gemini-4-argon-high' },
            confidence_bar: 0.5,
        })
        const practice = await createPracticeRepo({ root, config })
        const { testWriter, implementer, reviewer } = happyTurns()

        const jev: JevShadow = {
            client: {
                model: '@cf/cloudflare/clef',
                ask: async ({ request }): Promise<DecisionModelReply> => {
                    if ('model' in request.questions) {
                        return {
                            ok: true,
                            model: '@cf/cloudflare/clef',
                            answers: {
                                model: {
                                    value: 'gemini-4-argon-high',
                                    confidence: 0.95,
                                    raw: { choice: 'gemini-4-argon-high' },
                                },
                            },
                        }
                    }
                    return {
                        ok: true,
                        model: '@cf/cloudflare/clef',
                        answers: {},
                    }
                },
            },
        }

        const scripted = createScriptedLauncher({
            turns: [
                {
                    role: 'test-writer',
                    ticket: 11,
                    failure: 'agent',
                    error: 'Cheaper model missed edge case.',
                },
                testWriter,
                implementer,
                reviewer,
                ...CLEAN_LENS_TURNS(10),
                ...CLEAN_LENS_TURNS(10),
                EMPTY_LEARNER_TURN(10),
                VALID_STORY_TURN(10),
            ],
        })
        const launcher: AgentLauncher = {
            ...scripted,
            launch: async (args) => {
                const turn = await scripted.launch(args)
                return !turn.ok && args.role === 'test-writer'
                    ? { ...turn, session_closed: true }
                    : turn
            },
        }

        const { action, records } = await practice.run({
            jev,
            launcher,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const twLaunches = scripted
            .launches()
            .filter((c) => c.role === 'test-writer')
        expect(
            twLaunches.map((c) => ({ kind: c.kind, model: c.model }))
        ).toEqual([
            { kind: 'launch', model: 'gemini-4-argon-high' },
            { kind: 'launch', model: 'gemini-4-neon-high' },
        ])
        const twAsks = records.filter(
            (r) =>
                r.kind === 'jev_asked' &&
                r.content.job === 'agent_model' &&
                r.role === 'test-writer'
        )
        expect(twAsks).toHaveLength(1)
        const twStarts = records.flatMap((r) =>
            r.kind === 'agent_started' && r.role === 'test-writer'
                ? [
                      {
                          model: r.content.model,
                          model_reason: r.content.model_reason,
                          follow_up_of: r.content.follow_up_of,
                      },
                  ]
                : []
        )
        expect(twStarts).toEqual([
            {
                model: 'gemini-4-argon-high',
                model_reason: 'decision_model',
                follow_up_of: null,
            },
            {
                model: 'gemini-4-neon-high',
                model_reason: 'after_failure',
                follow_up_of: null,
            },
        ])

        const failedIndex = records.findIndex((r) => r.kind === 'agent_failed')
        const prefix = records.slice(0, failedIndex + 1)
        const midState = replayRun({ records: prefix })
        expect(midState.tickets[11]?.failed_cheaper).toEqual(['test-writer'])
        expect(
            launchPick({
                records: prefix,
                state: midState,
                config,
                run_id: 'run-1',
                ticket: 11,
                role: 'test-writer',
                step: { first_seq: 1, redo: false },
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'after_failure',
            trial_group: null,
        })
    }, 120_000)

    test('Scenario 6: luca-run CLI subprocess (--spec --provider agy) runs end-to-end with fake agy/gh and isolated HOME/XDG', async () => {
        const root = createTempRoot({ prefix: 'luca-agy-w6-' })
        roots.push(root)
        const config = makeAgyConfig({
            provider: 'claude',
            floors: { 'test-writer': 'sonnet' },
        })
        const { repo } = await makePracticeRepo({ root, config })
        const binDir = join(root, 'bin')
        const homeDir = join(root, 'home')
        const runsDir = join(root, 'runs')
        mkdirSync(binDir, { recursive: true })
        mkdirSync(homeDir, { recursive: true })
        mkdirSync(runsDir, { recursive: true })

        const spec = specIssue({ number: 10 })
        const ticket = ticketIssue({
            number: 11,
            title: 'Add sum',
            criteria: ['sum adds two numbers', 'sum of no numbers is zero'],
        })
        writeExecutable({
            path: join(binDir, 'gh'),
            body: buildFakeGhScript({
                spec_body: spec.body,
                ticket_body: ticket.body,
            }),
        })
        writeExecutable({
            path: join(binDir, 'agy'),
            body: buildFakeAgyScript(),
        })

        const proc = Bun.spawn(
            [
                process.execPath,
                LUCA_RUN,
                '--spec',
                '10',
                '--repo',
                repo,
                '--run-id',
                'cli-agy-1',
                '--provider',
                'agy',
            ],
            {
                cwd: repo,
                env: {
                    ...process.env,
                    PATH: `${binDir}:${process.env.PATH ?? ''}`,
                    HOME: homeDir,
                    XDG_STATE_HOME: join(homeDir, 'xdg-state'),
                    XDG_CONFIG_HOME: join(homeDir, 'xdg-config'),
                    XDG_DATA_HOME: join(homeDir, 'xdg-data'),
                    GH_TOKEN: '',
                    GITHUB_TOKEN: '',
                    LUCA_RUNS_DIR: runsDir,
                    LUCA_STORIES_DIR: join(homeDir, 'stories'),
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
            proc.exited,
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ])

        expect(stderr).toBe('')
        expect(exit_code).toBe(0)
        expect(stdout).toContain('PR opened')

        const start = readRunStart({ runs_dir: runsDir, run_id: 'cli-agy-1' })
        expect(start.ok).toBe(true)
        if (start.ok) {
            expect(start.start.provider).toBe('agy')
        }
        const calls = z
            .array(
                z.object({
                    role: z.string(),
                    model: z.string(),
                    argv: z.array(z.string()),
                })
            )
            .parse(readJsonLines({ path: join(homeDir, 'agy-calls.jsonl') }))
        expect(calls.length).toBeGreaterThanOrEqual(8)
        expect(
            calls.every(
                (c) =>
                    c.model.startsWith('gemini-') &&
                    c.argv.includes('--sandbox') &&
                    c.argv.includes('--disable-slash-commands') &&
                    c.argv.includes('--add-dir')
            )
        ).toBe(true)
    }, 120_000)

    test('Scenario 7: Paseo /luca-run #42 --provider=AGY forwards to engine parseRunArgs and renders agy board UI', async () => {
        const renderNativeRaw = await import(
            join(BOARD_DIR, 'client/testing/render-native.ts')
        )
        const boardLookRaw = await import(
            join(BOARD_DIR, 'client/board-look.ts')
        )
        const { THEME } = z
            .object({ THEME: ThemeSchema })
            .parse(renderNativeRaw)
        const { modelColor } = BoardLookModuleSchema.parse(boardLookRaw)

        activeHarness = await createHarness()
        const { output, run_id, token } = await activeHarness.start({
            args: '#42 --provider=AGY',
            cwd: '/Users/me/repo',
        })
        expect(output.ok).toBe(true)
        expect(activeHarness.spawns).toHaveLength(1)

        const spawnArgs = activeHarness.spawns[0]?.args ?? []
        const engineIdx = spawnArgs.indexOf(ENGINE_PATH)
        expect(engineIdx).toBeGreaterThanOrEqual(0)
        const cliParsed = parseRunArgs({
            argv: spawnArgs.slice(engineIdx + 1),
            cwd: '/Users/me',
            env: { LUCA_BOARD_TOKEN: token },
        })
        expect(cliParsed).toEqual({
            ok: true,
            args: {
                mode: 'spec',
                spec_number: 42,
                repo: '/Users/me/repo',
                run_id,
                base_branch: null,
                board: { plugin_id: 'luca-board', token },
                provider: 'agy',
            },
        })

        const agyConfig = makeAgyConfig({ provider: 'agy' })
        await activeHarness.send({
            run_id,
            token,
            entries: [
                {
                    kind: 'run_started',
                    ticket: null,
                    role: null,
                    content: {
                        spec_number: 42,
                        base_branch: 'main',
                        config: agyConfig,
                    },
                },
                specSnapshot({ spec: 42, title: 'Agy board run', order: [11] }),
                ticketSnapshot({ number: 11, title: 'Build slice' }),
                {
                    kind: 'agent_started',
                    ticket: 11,
                    role: 'implementer',
                    content: {
                        role: 'implementer',
                        prompt: 'You are the implementer.',
                        follow_up_of: null,
                        model: 'gemini-4-argon-high',
                        model_reason: 'decision_model',
                    },
                },
                limitWaitStarted({
                    resets_at: '2026-11-20T12:30:00.000Z',
                    rate_limit_type: 'agy_quota',
                    hit_ticket: 11,
                    hit_role: 'implementer',
                }),
            ],
        })

        const state = await activeHarness.state()
        expect(state.run.status).toBe('limit_wait')
        expect(state.limit_wait?.window).toBe('Antigravity quota')
        expect(windowWords({ window: 'agy_quota' })).toBe('Antigravity quota')
        expect(modelColor({ model: 'gemini-4-argon-high', theme: THEME })).toBe(
            '#e8833a'
        )
        expect(modelColor({ model: 'gemini-4-neon-high', theme: THEME })).toBe(
            '#a371f7'
        )
        expect(
            callWords({ tool: 'replace_file_content', target: 'src/sum.ts' })
        ).toBe('✎ editing src/sum.ts')
        const started_at = '2026-11-20T12:00:00.000Z'
        expect(
            liveText({
                live: {
                    ticket: 11,
                    role: 'implementer',
                    model: 'gemini-4-argon-high',
                    tokens: 240,
                    action: {
                        tool: 'replace_file_content',
                        target: 'src/sum.ts',
                        at: started_at,
                    },
                    open_call: {
                        tool: 'run_command',
                        target: 'bun test',
                        started_at,
                    },
                    activity: [],
                    helpers: [],
                },
                now: Date.parse(started_at) + 65_000,
            })
        ).toBe('implementer ▸ bun test · running 1m 5s')
    })
})
