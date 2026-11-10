import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runStoryCli } from './story-cli'
import { readStory, type Story } from './story-schema'
import {
    parseShiftDiff,
    shiftLine,
    shiftStory,
    storyLinePaths,
} from './story-shift'
import type { Git } from './story-shift-cli'
import { sha, story } from './testing/story-fixtures'

/**
 * A diff as `git diff --unified=0` prints it: two lines added after line
 * 10 of run-ticket.ts, line 80 of luca-run.ts edited, resume.ts deleted.
 */
const DIFF = `diff --git a/src/core/run-ticket.ts b/src/core/run-ticket.ts
index 1111111..2222222 100644
--- a/src/core/run-ticket.ts
+++ b/src/core/run-ticket.ts
@@ -10,0 +11,2 @@ import { build } from './build'
+--- a/not/a/header.ts
+const two = 2
diff --git a/src/cli/luca-run.ts b/src/cli/luca-run.ts
index 3333333..4444444 100644
--- a/src/cli/luca-run.ts
+++ b/src/cli/luca-run.ts
@@ -80 +80 @@ const start = () => {
-    runTicket(ticket)
+    runTicket(ticket, ctx)
\\ No newline at end of file
diff --git a/src/core/resume.ts b/src/core/resume.ts
deleted file mode 100644
index 5555555..0000000
--- a/src/core/resume.ts
+++ /dev/null
@@ -1,20 +0,0 @@
${Array.from({ length: 20 }, () => '-gone').join('\n')}
`

const NEW_HEAD = sha({ char: 'c' })

describe('reading a zero-context diff', () => {
    test('every file gets its hunks, a deleted file is gone, and a content line that looks like a header is not one', () => {
        const files = parseShiftDiff({ diff: DIFF })
        expect([...files.keys()]).toEqual([
            'src/core/run-ticket.ts',
            'src/cli/luca-run.ts',
            'src/core/resume.ts',
        ])
        expect(files.get('src/core/run-ticket.ts')).toEqual({
            gone: false,
            hunks: [
                { old_start: 10, old_count: 0, new_start: 11, new_count: 2 },
            ],
        })
        expect(files.get('src/cli/luca-run.ts')?.hunks).toEqual([
            { old_start: 80, old_count: 1, new_start: 80, new_count: 1 },
        ])
        expect(files.get('src/core/resume.ts')?.gone).toBe(true)
    })
})

describe('moving one line through hunks', () => {
    const added = { old_start: 10, old_count: 0, new_start: 11, new_count: 2 }
    const removed = { old_start: 30, old_count: 3, new_start: 31, new_count: 0 }
    const edited = { old_start: 50, old_count: 2, new_start: 49, new_count: 5 }
    const hunks = [added, removed, edited]

    test('a line above every hunk stays; lines below move by what was added and removed', () => {
        expect(shiftLine({ line: 10, hunks })).toEqual({
            line: 10,
            touched: false,
        })
        expect(shiftLine({ line: 11, hunks }).line).toBe(13)
        expect(shiftLine({ line: 29, hunks }).line).toBe(31)
        expect(shiftLine({ line: 33, hunks }).line).toBe(32)
        expect(shiftLine({ line: 49, hunks }).line).toBe(48)
        expect(shiftLine({ line: 52, hunks }).line).toBe(54)
    })

    test('a line that was edited or removed is touched and keeps its number', () => {
        for (const line of [30, 32, 50, 51]) {
            expect(shiftLine({ line, hunks })).toEqual({ line, touched: true })
        }
    })
})

describe('moving a story to a newer commit', () => {
    const shifted = () =>
        shiftStory({
            story: story(),
            files: parseShiftDiff({ diff: DIFF }),
            new_head_sha: NEW_HEAD,
        })

    test('a kept change moves with the lines added above it, and so do the flags on it', () => {
        const { story: moved, lines_moved } = shifted()
        const [c1] = moved.stops[0]?.changes ?? []
        expect(c1).toMatchObject({ start_line: 46, end_line: 48 })
        expect(moved.summary.flags[0]?.line).toBe(46)
        expect(moved.head_sha).toBe(NEW_HEAD)
        // c1's range and the summary flag; c2 is in a file the diff doesn't name.
        expect(lines_moved).toBe(2)
        expect(moved.stops[1]?.changes[0]).toMatchObject({
            start_line: 44,
            end_line: 46,
        })
        expect(readStory({ value: moved }).status).toBe('ok')
    })

    test('an edited caller line and a deleted caller file are noted, not moved', () => {
        const { story: moved, notes } = shifted()
        expect(notes).toEqual([
            {
                kind: 'ref_touched',
                change_id: 'c1',
                where: 'blast_radius',
                path: 'src/cli/luca-run.ts',
                line: 80,
            },
            {
                kind: 'ref_file_gone',
                change_id: 'c1',
                where: 'blast_radius',
                path: 'src/core/resume.ts',
                line: 15,
            },
            {
                kind: 'ref_touched',
                change_id: 'c2',
                where: 'blast_radius',
                path: 'src/cli/luca-run.ts',
                line: 80,
            },
            {
                kind: 'ref_file_gone',
                change_id: 'c2',
                where: 'blast_radius',
                path: 'src/core/resume.ts',
                line: 15,
            },
        ])
        expect(
            moved.stops[0]?.changes[0]?.blast_radius.dependents.map(
                ({ line }) => line
            )
        ).toEqual([80, 15])
    })

    test('a change the new commits edit, grow from inside, or delete is noted and left alone', () => {
        const at = (hunk: string) =>
            shiftStory({
                story: story(),
                files: parseShiftDiff({
                    diff: `--- a/src/core/run-ticket.ts\n+++ b/src/core/run-ticket.ts\n${hunk}\n`,
                }),
                new_head_sha: NEW_HEAD,
            })
        // An edit of line 45, inside 44..46.
        const edited = at('@@ -45 +45 @@\n-old\n+new')
        // A line added after line 44, inside the range.
        const grown = at('@@ -44,0 +45 @@\n+new')
        for (const { story: moved, notes } of [edited, grown]) {
            expect(notes[0]).toMatchObject({
                kind: 'change_touched',
                change_id: 'c1',
                where: 'range',
            })
            expect(moved.stops[0]?.changes[0]).toMatchObject({
                start_line: 44,
                end_line: 46,
            })
        }
        // A line added right after the range's last line is outside it.
        expect(at('@@ -46,0 +47 @@\n+new').notes).toEqual([])
        const gone = shiftStory({
            story: story(),
            files: new Map([
                ['src/core/run-ticket.ts', { gone: true, hunks: [] }],
            ]),
            new_head_sha: NEW_HEAD,
        })
        expect(gone.notes.map(({ kind }) => kind)).toEqual([
            'ref_file_gone',
            'change_file_gone',
        ])
    })

    test('a range on the base side and a moved test line', () => {
        const base: Story = story()
        const [first] = base.stops
        const [c1] = first?.changes ?? []
        if (first === undefined || c1 === undefined) throw new Error('fixture')
        first.changes = [{ ...c1, side: 'base' }]
        const { story: moved } = shiftStory({
            story: base,
            files: parseShiftDiff({
                diff: `${DIFF}--- a/src/core/run-ticket.test.ts\n+++ b/src/core/run-ticket.test.ts\n@@ -3,2 +2,0 @@\n-a\n-b\n`,
            }),
            new_head_sha: NEW_HEAD,
        })
        const [kept] = moved.stops[0]?.changes ?? []
        expect(kept).toMatchObject({ start_line: 44, end_line: 46 })
        expect(kept?.proof.tests[0]?.line).toBe(10)
    })

    test('the paths a story points into, once each', () => {
        expect(storyLinePaths({ story: story() })).toEqual([
            'src/cli/luca-run.ts',
            'src/config/schema.ts',
            'src/core/resume.ts',
            'src/core/run-ticket.test.ts',
            'src/core/run-ticket.ts',
        ])
    })
})

describe('the helper’s shift command', () => {
    let dir = ''

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'luca-story-shift-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    /** A pretend git that knows one newer commit and prints `DIFF`. */
    const fakeGit = ({ ancestor = true }: { ancestor?: boolean }) => {
        const calls: string[] = []
        const git: Git = async ({ args, cwd }) => {
            calls.push(`${cwd}: ${args.join(' ')}`)
            const ok = (stdout = '') => ({ ok: true, stdout, stderr: '' })
            if (args[0] === 'rev-parse') {
                return args.at(-1) === 'ccc^{commit}'
                    ? ok(`${NEW_HEAD}\n`)
                    : args.at(-1) === 'aaa^{commit}'
                      ? ok(`${sha({ char: 'a' })}\n`)
                      : { ok: false, stdout: '', stderr: '' }
            }
            if (args[0] === 'merge-base') {
                return { ok: ancestor, stdout: '', stderr: '' }
            }
            if (args.includes('diff')) return ok(DIFF)
            return { ok: false, stdout: '', stderr: 'unexpected git call' }
        }
        return { git, calls }
    }

    const run = async ({
        argv,
        fake = fakeGit({}),
    }: {
        argv: string[]
        fake?: ReturnType<typeof fakeGit>
    }) => {
        const path = join(dir, 'story.json')
        await Bun.write(path, JSON.stringify(story()))
        const out: string[] = []
        const err: string[] = []
        const code = await runStoryCli({
            argv: argv.map((arg) => (arg === 'STORY' ? path : arg)),
            gh: async () => ({ ok: false, stdout: '', stderr: 'no gh here' }),
            git: fake.git,
            home: dir,
            env: {},
            out: (line) => out.push(line),
            err: (line) => err.push(line),
        })
        return { code, out, err: err.join('\n'), path, calls: fake.calls }
    }

    test('it writes the moved story over the file, prints the notes, and asks git only about the paths the story points into', async () => {
        const { code, out, err, path, calls } = await run({
            argv: ['shift', 'STORY', 'ccc', '--repo-dir', '/repo'],
        })
        expect(code).toBe(0)
        const report = JSON.parse(out[0] ?? '')
        expect(report).toMatchObject({
            status: 'shifted',
            from: sha({ char: 'a' }),
            to: NEW_HEAD,
            lines_moved: 2,
        })
        expect(report.notes).toHaveLength(4)
        expect(err).toContain('Rewrite, find again, or recount every one')
        const saved = readStory({ value: await Bun.file(path).json() })
        expect(saved.status === 'ok' && saved.story.head_sha).toBe(NEW_HEAD)
        expect(calls.every((call) => call.startsWith('/repo: '))).toBe(true)
        expect(calls.at(-1)).toEndWith(
            `${sha({ char: 'a' })} ${NEW_HEAD} -- ${storyLinePaths({ story: story() }).join(' ')}`
        )
    })

    test('--out leaves the story file alone', async () => {
        const out_path = join(dir, 'moved.json')
        const { code, path } = await run({
            argv: ['shift', 'STORY', 'ccc', '--out', out_path],
        })
        expect(code).toBe(0)
        expect((await Bun.file(path).json()).head_sha).toBe(sha({ char: 'a' }))
        expect((await Bun.file(out_path).json()).head_sha).toBe(NEW_HEAD)
    })

    test('a story already at that commit is unchanged, so running it twice moves nothing twice', async () => {
        const { code, out, calls } = await run({
            argv: ['shift', 'STORY', 'aaa'],
        })
        expect(code).toBe(0)
        expect(JSON.parse(out[0] ?? '')).toMatchObject({
            status: 'unchanged',
            lines_moved: 0,
        })
        expect(calls).toHaveLength(1)
    })

    test('a force-push says to write a new story, and a commit git does not have says to fetch it', async () => {
        const forced = await run({
            argv: ['shift', 'STORY', 'ccc'],
            fake: fakeGit({ ancestor: false }),
        })
        expect(forced.code).toBe(1)
        expect(forced.err).toContain('Write a new story.')
        const missing = await run({ argv: ['shift', 'STORY', 'zzz'] })
        expect(missing.code).toBe(2)
        expect(missing.err).toContain('Fetch it first')
        expect((await run({ argv: ['shift', 'STORY'] })).code).toBe(2)
    })
})
