import { chmodSync, mkdtempSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { claudeArgs, parseStream, runClaude } from './claude-run'

let tmp = ''

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'lr-cr-'))
})

afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
})

describe('claudeArgs', () => {
    test('a coordinator run streams, with default tools', () => {
        expect(
            claudeArgs({
                model: 'claude-opus-5-5',
                max_budget_usd: 25,
                output_format: 'stream-json',
                tools: null,
            })
        ).toEqual([
            '-p',
            '--model',
            'claude-opus-5-5',
            '--setting-sources',
            'project',
            '--permission-mode',
            'bypassPermissions',
            '--output-format',
            'stream-json',
            '--verbose',
            '--max-budget-usd',
            '25',
        ])
    })

    test('the grader has no tools; a trigger run has only Skill', () => {
        expect(
            claudeArgs({
                model: 'm',
                max_budget_usd: 5,
                output_format: 'json',
                tools: [],
            }).slice(-4)
        ).toEqual(['--max-budget-usd', '5', '--tools', ''])
        expect(
            claudeArgs({
                model: 'm',
                max_budget_usd: 2,
                output_format: 'stream-json',
                tools: ['Skill'],
            }).slice(-2)
        ).toEqual(['--tools', 'Skill'])
    })
})

const STREAM = [
    JSON.stringify({ type: 'system', subtype: 'session_state_changed' }),
    JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'sess-1',
        claude_code_version: '2.1.296',
        skills: ['luca-review', 'debug'],
    }),
    'not json',
    JSON.stringify({
        type: 'assistant',
        message: {
            content: [
                { type: 'text', text: 'Loading the skill.' },
                {
                    type: 'tool_use',
                    name: 'Skill',
                    input: { skill: 'luca-review' },
                },
                { type: 'tool_use', name: 'Read', input: { file_path: 'x' } },
            ],
        },
    }),
    JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'Done. The finding is wrong.',
        total_cost_usd: 1.25,
    }),
].join('\n')

describe('parseStream', () => {
    test('reads the session, its skills, its skill calls and its result', () => {
        expect(parseStream({ text: STREAM })).toEqual({
            session_id: 'sess-1',
            claude_code_version: '2.1.296',
            skills: ['luca-review', 'debug'],
            skill_calls: ['luca-review'],
            result_text: 'Done. The finding is wrong.',
            is_error: false,
            total_cost_usd: 1.25,
        })
    })

    test('an empty stream is an error with no session', () => {
        expect(parseStream({ text: '' })).toEqual({
            session_id: null,
            claude_code_version: 'unknown',
            skills: [],
            skill_calls: [],
            result_text: '',
            is_error: true,
            total_cost_usd: 0,
        })
    })
})

describe('runClaude', () => {
    test('sends the prompt on stdin and saves stdout and stderr', async () => {
        const fake = join(tmp, 'fake-claude')
        await Bun.write(fake, '#!/bin/sh\ncat\necho "on stderr" >&2\n')
        chmodSync(fake, 0o755)
        const out_file = join(tmp, 'stream.jsonl')
        const run = await runClaude({
            cwd: tmp,
            args: ['-p'],
            env: process.env,
            stdin_text: 'the prompt',
            out_file,
            timeout_ms: 10_000,
            command: fake,
        })
        expect(run.exit_code).toBe(0)
        expect(run.text).toBe('the prompt')
        expect(readFileSync(out_file, 'utf8')).toBe('the prompt')
        expect(readFileSync(`${out_file}.stderr`, 'utf8')).toBe('on stderr\n')
    })

    test('kills a run that goes past its time limit', async () => {
        const fake = join(tmp, 'slow-claude')
        await Bun.write(fake, '#!/bin/sh\nsleep 5\n')
        chmodSync(fake, 0o755)
        const run = await runClaude({
            cwd: tmp,
            args: [],
            env: process.env,
            stdin_text: '',
            out_file: join(tmp, 'slow.jsonl'),
            timeout_ms: 200,
            command: fake,
        })
        expect(run.exit_code).not.toBe(0)
        expect(run.wall_ms).toBeLessThan(3_000)
    })

    test('normal exit while background child holds pipe', async () => {
        const fake = join(tmp, 'bg-child')
        await Bun.write(
            fake,
            '#!/bin/sh\necho "full-output-line"\nsleep 3 &\nexit 0\n'
        )
        chmodSync(fake, 0o755)
        const out_file = join(tmp, 'bg.jsonl')
        const run = await runClaude({
            cwd: tmp,
            args: [],
            env: process.env,
            stdin_text: '',
            out_file,
            timeout_ms: 10_000,
            command: fake,
        })
        expect(run.exit_code).toBe(0)
        expect(run.text).toContain('full-output-line')
        expect(readFileSync(out_file, 'utf8')).toContain('full-output-line')
        expect(run.wall_ms).toBeLessThan(2_000)
    })

    test('timeout with partial output', async () => {
        const fake = join(tmp, 'partial')
        await Bun.write(
            fake,
            '#!/bin/sh\necho "partial-before-timeout"\nsleep 5\n'
        )
        chmodSync(fake, 0o755)
        const out_file = join(tmp, 'partial.jsonl')
        const run = await runClaude({
            cwd: tmp,
            args: [],
            env: process.env,
            stdin_text: '',
            out_file,
            timeout_ms: 300,
            command: fake,
        })
        expect(run.exit_code).not.toBe(0)
        expect(run.text).toContain('partial-before-timeout')
        expect(readFileSync(out_file, 'utf8')).toContain(
            'partial-before-timeout'
        )
    })

    test('child that ignores SIGTERM', async () => {
        const fake = join(tmp, 'sigterm-ignore')
        await Bun.write(fake, '#!/bin/sh\ntrap "" TERM\nsleep 30\n')
        chmodSync(fake, 0o755)
        const out_file = join(tmp, 'sigterm.jsonl')
        const run = await runClaude({
            cwd: tmp,
            args: [],
            env: process.env,
            stdin_text: '',
            out_file,
            timeout_ms: 200,
            command: fake,
        })
        expect(run.exit_code).not.toBe(0)
        expect(run.wall_ms).toBeLessThan(5_000)
    })
})
