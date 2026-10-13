import { mkdtempSync, realpathSync, symlinkSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    coordinatorFile,
    costUnits,
    leakedFiles,
    projectSlug,
    sumUsage,
    transcriptFiles,
} from './transcripts'

let tmp = ''
let root = ''
let projects = ''

beforeEach(async () => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'lr-tr-')))
    root = join(tmp, 'evals', 'r1', '3B1')
    projects = join(tmp, 'projects')
    await mkdir(join(root, 'ws'), { recursive: true })
    await mkdir(projects, { recursive: true })
})

afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
})

const line = (id: string, usage: Record<string, number>, extra = '') =>
    JSON.stringify({ type: 'assistant', message: { id, usage }, note: extra })

const writeTranscript = async (
    folder: string,
    name: string,
    lines: string[]
) => {
    await mkdir(join(projects, folder), { recursive: true })
    const path = join(projects, folder, name)
    await Bun.write(path, `${lines.join('\n')}\n`)
    return path
}

describe('projectSlug', () => {
    test('turns every character but letters and digits into -', () => {
        expect(
            projectSlug({ path: '/Users/a/.local/state/luca/evals/r1/3B1' })
        ).toBe('-Users-a--local-state-luca-evals-r1-3B1')
    })
})

describe('transcriptFiles', () => {
    test("finds the run's sessions and their subagents, and nothing else", async () => {
        const slug = projectSlug({ path: root })
        const main = await writeTranscript(`${slug}-ws`, 's1.jsonl', ['{}'])
        const sub = await writeTranscript(
            `${slug}-ws/s1/subagents`,
            'agent-x.jsonl',
            ['{}']
        )
        const child = await writeTranscript(
            `${slug}-reviews-workspaces-s2-r1-maintainer`,
            's2.jsonl',
            ['{}']
        )
        await writeTranscript(`${slug}0-ws`, 'other.jsonl', ['{}'])
        await writeTranscript(`${slug}-ws/memory`, 'm.jsonl', ['{}'])
        expect(
            [...transcriptFiles({ root, projects_dir: projects })].sort()
        ).toEqual([main, sub, child].sort())
    })

    test('follows a symlinked root to its real path', async () => {
        const slug = projectSlug({ path: root })
        const main = await writeTranscript(`${slug}-ws`, 's1.jsonl', ['{}'])
        const link = join(tmp, 'link')
        symlinkSync(root, link)
        expect(transcriptFiles({ root: link, projects_dir: projects })).toEqual(
            [main]
        )
    })

    test('is empty when the projects folder is missing', () => {
        expect(
            transcriptFiles({ root, projects_dir: join(tmp, 'none') })
        ).toEqual([])
    })
})

describe('sumUsage', () => {
    test('counts each model message once, across files, and skips bad lines', async () => {
        const usage = {
            input_tokens: 10,
            output_tokens: 2,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 1000,
        }
        const a = await writeTranscript('p', 'a.jsonl', [
            line('msg_1', usage),
            line('msg_1', usage, 'same message, second block'),
            'not json',
            JSON.stringify({ type: 'user', message: { content: 'hi' } }),
        ])
        const b = await writeTranscript('p', 'b.jsonl', [line('msg_2', usage)])
        expect(sumUsage({ files: [a, b] })).toEqual({
            input_tokens: 20,
            output_tokens: 4,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 2000,
        })
    })
})

describe('costUnits', () => {
    test('weighs tokens by price, in input-token units', () => {
        expect(
            costUnits({
                usage: {
                    input_tokens: 100,
                    output_tokens: 100,
                    cache_creation_input_tokens: 100,
                    cache_read_input_tokens: 100,
                },
            })
        ).toBe(735)
    })
})

describe('leaks', () => {
    test("finds the marker in any transcript but the coordinator's own", async () => {
        const slug = projectSlug({ path: join(root, 'ws') })
        const coordinator = await writeTranscript(slug, 'main.jsonl', [
            '{"text":"LR-MARKER-ABCDEFGH"}',
        ])
        const reviewer = await writeTranscript(slug, 'main/subagents/r.jsonl', [
            '{"text":"I read LR-MARKER-ABCDEFGH"}',
        ])
        const clean = await writeTranscript(slug, 'main/subagents/c.jsonl', [
            '{"text":"nothing"}',
        ])
        const coordinator_file = coordinatorFile({
            ws: join(root, 'ws'),
            session_id: 'main',
            projects_dir: projects,
        })
        expect(coordinator_file).toBe(coordinator)
        expect(
            leakedFiles({
                files: [coordinator, reviewer, clean],
                marker: 'LR-MARKER-ABCDEFGH',
                coordinator_file,
            })
        ).toEqual([reviewer])
    })
})
