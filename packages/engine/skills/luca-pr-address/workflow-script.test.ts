import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

/**
 * The `/luca-pr-address` skill's workflow script really enforces the owner
 * rule and the deferral cap, and lets the owner's own words settle their
 * comment. This test proves it by running the script with fake agents.
 */

const workflow = await Bun.file(
    join(import.meta.dir, 'references', 'workflow-script.md')
).text()

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** What the Workflow tool gives a script. */
type Tools = {
    args: unknown
    agent: (prompt: string, opts: { label: string }) => Promise<unknown>
    parallel: (thunks: (() => Promise<unknown>)[]) => Promise<unknown[]>
    phase: (title: string) => void
    log: (line: string) => void
}

const isRunner = (
    value: unknown
): value is (tools: Tools) => Promise<unknown> => typeof value === 'function'

const temp_dirs: string[] = []
afterAll(async () => {
    await Promise.all(
        temp_dirs.map((dir) => rm(dir, { recursive: true, force: true }))
    )
})

/**
 * The script in `workflow-script.md`, made runnable: everything after
 * `meta` becomes the body of one function that takes the Workflow tool's
 * globals.
 */
const loadWorkflow = async () => {
    const script = /```js\n([\s\S]*?)\n```/.exec(workflow)?.[1] ?? ''
    const cut = script.indexOf('const ASSESS_SCHEMA')
    expect(cut).toBeGreaterThan(0)
    const dir = await mkdtemp(join(tmpdir(), 'pr-address-workflow-'))
    temp_dirs.push(dir)
    const file = join(dir, 'workflow.mjs')
    await Bun.write(
        file,
        `${script.slice(0, cut)}\nexport default async ({ args, agent, parallel, phase, log }) => {\n${script.slice(cut)}\n}\n`
    )
    const loaded: unknown = await import(file)
    if (!isObject(loaded) || !isRunner(loaded.default)) {
        throw new Error('the workflow script did not load')
    }
    return { run: loaded.default, meta: loaded.meta }
}

const finding = ({
    id,
    from_owner,
    path,
    extra = {},
}: {
    id: string
    from_owner: boolean
    path: string
    extra?: Json
}) => ({
    id,
    source: 'review_comment',
    author: from_owner ? 'octocat' : 'review-bot',
    from_owner,
    path,
    kind: 'line',
    line: 1,
    body: `finding ${id}`,
    ...extra,
})

const assessment = (verdict: string, extra: Json = {}) => ({
    verdict,
    severity: 'should_fix',
    confidence: 'high',
    rationale: `Rationale for ${verdict}. More.`,
    proposed_fix: 'change it',
    effort: 'small',
    ...extra,
})

describe('the workflow script', () => {
    test('its meta is a literal with the two phases', async () => {
        const { meta } = await loadWorkflow()
        expect(meta).toMatchObject({
            name: 'pr-address',
            phases: [{ title: 'Assess' }, { title: 'Act' }],
        })
    })

    test('it enforces the owner rule and the deferral cap, and loses no finding', async () => {
        const { run } = await loadWorkflow()
        const prompts = new Map<string, string>()
        const logs: string[] = []
        const assess: Record<string, unknown> = {
            // The owner's finding judged "not real": must become a question.
            'assess:F1': assessment('not_real'),
            'assess:F2': assessment('confirmed'),
            'assess:F3': assessment('not_real'),
            'assess:F4': assessment('confirmed'),
            'assess:F5': assessment('confirmed'),
            // An agent that died.
            'assess:F6': null,
            'assess:F7': assessment('needs_info', { question: 'Which count?' }),
        }
        const act: Record<string, unknown> = {
            // Breaks the owner rule: declines the owner's F2.
            'act:b.ts': {
                outcomes: [
                    {
                        id: 'F2',
                        outcome: 'declined',
                        summary: 's',
                        reply: 'no',
                    },
                ],
                files_changed: [],
            },
            'act:d.ts': {
                outcomes: [
                    {
                        id: 'F4',
                        outcome: 'deferred',
                        summary: 's',
                        reply: 'later',
                    },
                    {
                        id: 'F5',
                        outcome: 'deferred',
                        summary: 's',
                        reply: 'later',
                    },
                ],
                files_changed: ['d.ts'],
            },
        }
        const result = await run({
            args: {
                pr: 212,
                repo: 'octo-org/shop',
                owner: 'octocat',
                findings: [
                    finding({ id: 'F1', from_owner: true, path: 'a.ts' }),
                    finding({ id: 'F2', from_owner: true, path: 'b.ts' }),
                    finding({ id: 'F3', from_owner: false, path: 'c.ts' }),
                    finding({ id: 'F4', from_owner: false, path: 'd.ts' }),
                    finding({ id: 'F5', from_owner: false, path: 'd.ts' }),
                    finding({ id: 'F6', from_owner: false, path: 'e.ts' }),
                    finding({ id: 'F7', from_owner: true, path: 'f.ts' }),
                ],
            },
            agent: (prompt, { label }) => {
                prompts.set(label, prompt)
                return Promise.resolve(assess[label] ?? act[label] ?? null)
            },
            parallel: (thunks) => Promise.all(thunks.map((thunk) => thunk())),
            phase: () => undefined,
            log: (line) => logs.push(line),
        })

        if (!isObject(result) || !Array.isArray(result.outcomes)) {
            throw new Error('the workflow returned no outcomes')
        }
        const outcome_of = Object.fromEntries(
            result.outcomes
                .filter(isObject)
                .map((outcome) => [String(outcome.id), outcome.outcome])
        )
        expect(outcome_of).toEqual({
            F1: 'asked',
            F2: 'declined',
            F3: 'declined',
            F4: 'deferred',
            F5: 'deferred',
            F7: 'asked',
        })
        // The owner's F1 and F7 never reached a worker; only b.ts and d.ts did.
        expect([...prompts.keys()].filter((l) => l.startsWith('act:'))).toEqual(
            ['act:b.ts', 'act:d.ts']
        )
        expect(result.owner_rule_broken).toEqual(['F2'])
        expect(result.deferral_cap_exceeded).toBe(true)
        expect(result.unhandled).toEqual(['F6'])
        expect(result.files_changed).toEqual(['d.ts'])
        const asked = result.outcomes
            .filter(isObject)
            .find((outcome) => outcome.id === 'F7')
        expect(asked?.reply).toContain('Which count?')
        expect(logs.join('\n')).toContain('OWNER RULE BROKEN: F2')
        expect(logs.join('\n')).toContain('DEFERRAL CAP EXCEEDED')

        // An owner finding's judge may not call it "not real"; a bot's may.
        expect(prompts.get('assess:F1')).toContain('You may NOT answer')
        expect(prompts.get('assess:F1')).not.toContain('- not_real:')
        expect(prompts.get('assess:F3')).toContain('- not_real:')
        expect(prompts.get('act:b.ts')).toContain('[FROM THE OWNER]')
        expect(prompts.get('act:d.ts')).not.toContain(
            '--- F4, line 1, should_fix (high confidence) [FROM'
        )
    })

    test('the owner’s own later words settle their comment as answered; a claim that does not check out becomes a question', async () => {
        const { run } = await loadWorkflow()
        const prompts = new Map<string, string>()
        const at = (time: string) => ({ created_at: `2026-11-10T${time}Z` })
        const result = await run({
            args: {
                pr: 746,
                repo: 'octo-org/shop',
                owner: 'octocat',
                findings: [
                    // "Rename this?", with a suggestion, on one line.
                    finding({
                        id: 'F1',
                        from_owner: true,
                        path: 'docs/map.md',
                        extra: {
                            ...at('18:00:00'),
                            has_suggestion: true,
                            line: 57,
                        },
                    }),
                    // A whole-file comment.
                    finding({
                        id: 'F2',
                        from_owner: true,
                        path: 'docs/modules.md',
                        extra: { ...at('18:01:00'), kind: 'file', line: null },
                    }),
                    // A range.
                    finding({
                        id: 'F3',
                        from_owner: true,
                        path: 'scripts/write.ts',
                        extra: {
                            ...at('18:02:00'),
                            kind: 'range',
                            start_line: 18,
                            line: 22,
                        },
                    }),
                    // The review's own text, sent last: "no rename if ...".
                    finding({
                        id: 'F4',
                        from_owner: true,
                        path: '(whole PR)',
                        extra: {
                            ...at('18:11:54'),
                            kind: undefined,
                            line: null,
                            html_url: 'https://github.test/r/4',
                        },
                    }),
                    // A bot's comment: it can't settle anything.
                    finding({
                        id: 'F5',
                        from_owner: false,
                        path: 'a.ts',
                        extra: at('18:12:00'),
                    }),
                    // Written after everything else by the owner.
                    finding({
                        id: 'F6',
                        from_owner: true,
                        path: 'b.ts',
                        extra: at('18:30:00'),
                    }),
                ],
            },
            agent: (prompt, { label }) => {
                prompts.set(label, prompt)
                const verdicts: Record<string, unknown> = {
                    'assess:F1': assessment('settled_by_owner', {
                        settled_by: 'F4',
                    }),
                    // Settled "by" a bot's comment: not allowed.
                    'assess:F2': assessment('settled_by_owner', {
                        settled_by: 'F5',
                    }),
                    'assess:F3': assessment('confirmed'),
                    'assess:F4': assessment('confirmed'),
                    'assess:F5': assessment('confirmed'),
                    // Settled "by" an older comment: not allowed.
                    'assess:F6': assessment('settled_by_owner', {
                        settled_by: 'F1',
                    }),
                }
                if (label.startsWith('assess:')) {
                    return Promise.resolve(verdicts[label] ?? null)
                }
                const ids =
                    [...prompt.matchAll(/^--- (F\d+),/gm)].map((m) => m[1]) ??
                    []
                return Promise.resolve({
                    outcomes: ids.map((id) => ({
                        id,
                        outcome: 'fixed',
                        summary: 's',
                        reply: 'r',
                    })),
                    files_changed: [],
                })
            },
            parallel: (thunks) => Promise.all(thunks.map((thunk) => thunk())),
            phase: () => undefined,
            log: () => undefined,
        })
        if (!isObject(result) || !Array.isArray(result.outcomes)) {
            throw new Error('the workflow returned no outcomes')
        }
        const by_id = Object.fromEntries(
            result.outcomes.filter(isObject).map((o) => [String(o.id), o])
        )
        expect(
            Object.fromEntries(
                Object.entries(by_id).map(([id, o]) => [id, o.outcome])
            )
        ).toEqual({
            F1: 'answered',
            F2: 'asked',
            F3: 'fixed',
            F4: 'fixed',
            F5: 'fixed',
            F6: 'asked',
        })
        expect(by_id.F1).toMatchObject({ settled_by: 'F4' })
        expect(String(by_id.F1?.reply)).toContain(
            'No change: your own comment settles this (https://github.test/r/4).'
        )
        expect(result.owner_rule_broken).toEqual([])
        expect(result.unhandled).toEqual([])

        // The judge of an owner comment sees the owner's other words, and
        // each place is written as what it is.
        const judge = prompts.get('assess:F1') ?? ''
        expect(judge).toContain('- settled_by_owner:')
        expect(judge).toContain('[F4] (whole PR) (the whole PR): finding F4')
        expect(judge).toContain('[F3] scripts/write.ts:18-22: finding F3')
        expect(judge).toContain('[F2] docs/modules.md (the whole file)')
        expect(judge).toContain('Location: docs/map.md:57')
        expect(judge).toContain('It holds a suggestion block')
        expect(prompts.get('assess:F2')).toContain('read the whole file')
        expect(prompts.get('assess:F3')).toContain('read lines 18-22')
        // A bot's judge is never offered that verdict.
        expect(prompts.get('assess:F5')).not.toContain('settled_by_owner')
        expect(prompts.get('act:write.ts')).toContain('--- F3, lines 18-22,')
        expect(prompts.get('act:write.ts')).toContain(
            '[HAS A SUGGESTION] holds'
        )
    })

    test('one deferral in six confirmed findings is under the cap', async () => {
        const { run } = await loadWorkflow()
        const ids = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']
        const result = await run({
            args: {
                pr: 1,
                repo: 'a/b',
                owner: 'octocat',
                findings: ids.map((id) =>
                    finding({ id, from_owner: false, path: 'x.ts' })
                ),
            },
            agent: (_prompt, { label }) =>
                Promise.resolve(
                    label.startsWith('assess:')
                        ? assessment('confirmed')
                        : {
                              outcomes: ids.map((id) => ({
                                  id,
                                  outcome: id === 'F6' ? 'deferred' : 'fixed',
                                  summary: 's',
                                  reply: 'r',
                              })),
                              files_changed: ['x.ts'],
                          }
                ),
            parallel: (thunks) => Promise.all(thunks.map((thunk) => thunk())),
            phase: () => undefined,
            log: () => undefined,
        })
        expect(result).toMatchObject({
            deferral_cap_exceeded: false,
            owner_rule_broken: [],
            unhandled: [],
        })
    })
})
