import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'bun:test'

import { runStoryCli } from './story-cli'
import type { Story } from './story-schema'
import type { Git } from './story-shift-cli'
import { story } from './testing/story-fixtures'

/**
 * The helper's `shift` command against a real git repo (#738): the diff
 * it asks git for is one it can read.
 */

const git: Git = async ({ args, cwd }) => {
    const child = Bun.spawn(['git', ...args], {
        cwd,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Test',
            GIT_AUTHOR_EMAIL: 'test@example.com',
            GIT_COMMITTER_NAME: 'Test',
            GIT_COMMITTER_EMAIL: 'test@example.com',
        },
    })
    const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ])
    return { ok: code === 0, stdout, stderr }
}

let dir = ''

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'luca-story-shift-e2e-'))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const lines = (count: number) =>
    Array.from({ length: count }, (_, at) => `line ${at + 1}`)

const commit = async (message: string) => {
    await git({ args: ['add', '-A'], cwd: dir })
    await git({
        args: ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message],
        cwd: dir,
    })
    return (await git({ args: ['rev-parse', 'HEAD'], cwd: dir })).stdout.trim()
}

test('shift moves a story through a real diff: lines added above, a test moved down, a caller edited, a file with a space in its name', async () => {
    await git({ args: ['init', '-q'], cwd: dir })
    const write = (path: string, text: string[]) =>
        Bun.write(join(dir, path), `${text.join('\n')}\n`)
    await write('src/core/run-ticket.ts', lines(60))
    await write('src/core/run-ticket.test.ts', lines(30))
    await write('src/cli/luca-run.ts', lines(90))
    await write('src/core/resume.ts', lines(20))
    await write('src/config/schema.ts', lines(50))
    await write('docs/a file.md', lines(5))
    const old_sha = await commit('first')

    const ticket = lines(60)
    ticket.splice(9, 0, 'new a', 'new b', 'new c')
    await write('src/core/run-ticket.ts', ticket)
    const tests = lines(30)
    tests.splice(2, 0, 'new test line')
    await write('src/core/run-ticket.test.ts', tests)
    const run = lines(90)
    run[79] = 'line 80, edited'
    await write('src/cli/luca-run.ts', run)
    await write('docs/a file.md', ['new first line', ...lines(5)])
    const new_sha = await commit('second')

    const base = story()
    const old_story: Story = {
        ...base,
        head_sha: old_sha,
        summary: {
            ...base.summary,
            flags: [
                {
                    kind: 'cleanliness',
                    rule: 'Keep docs current',
                    rule_source: null,
                    path: 'docs/a file.md',
                    line: 5,
                    message: 'Out of date.',
                },
            ],
        },
    }
    const path = join(dir, '..', `story-${old_sha}.json`)
    await Bun.write(path, JSON.stringify(old_story))
    const out: string[] = []
    const code = await runStoryCli({
        argv: ['shift', path, new_sha, '--repo-dir', dir],
        gh: async () => ({ ok: false, stdout: '', stderr: 'no gh here' }),
        git,
        home: dir,
        env: {},
        out: (line) => out.push(line),
        err: () => {},
    })
    const moved: Story = await Bun.file(path).json()
    await rm(path, { force: true })
    expect(code).toBe(0)
    const [c1] = moved.stops[0]?.changes ?? []
    expect(c1).toMatchObject({ start_line: 47, end_line: 49 })
    expect(c1?.proof.tests[0]?.line).toBe(13)
    expect(moved.summary.flags[0]?.line).toBe(6)
    expect(moved.head_sha).toBe(new_sha)
    const report = JSON.parse(out[0] ?? '')
    expect(report.status).toBe('shifted')
    expect(report.to).toBe(new_sha)
    expect(
        report.notes.map(
            (note: { kind: string; change_id: string; path: string }) =>
                `${note.kind} ${note.change_id} ${note.path}`
        )
    ).toEqual([
        'ref_touched c1 src/cli/luca-run.ts',
        'ref_touched c2 src/cli/luca-run.ts',
    ])
})
