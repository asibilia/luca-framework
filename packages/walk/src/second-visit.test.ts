import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, test } from 'bun:test'

import { reviewRecordLine } from './review-record'
import { htmlText } from './testing/html-text'
import {
    makeVisitRepo,
    openVisitApp,
    submittedReview,
    THREE_STOPS,
    writeLocalRecord,
    type VisitRepo,
} from './testing/second-visit-setup'
import { makeSendRepo, openSendApp } from './testing/send-review-setup'

/**
 * Remembering what was reviewed (#762, spec #752 section 12): the review
 * record kept after a send, read back from the local file or from GitHub,
 * and a second visit that walks only the stops whose files changed since
 * the record's commit. `C1` is the commit reviewed; `C2` is the head now.
 */

const UNCHANGED = 'unchanged since your last review'

let dirs: string[] = []

afterEach(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true })
    dirs = []
})

/** A checkout whose `C2` changes only `changed`, removed after the test. */
const visitRepo = async (changed: string[]): Promise<VisitRepo> => {
    const repo = await makeVisitRepo({ changed })
    dirs.push(repo.dir)
    return repo
}

const short = (sha: string) => sha.slice(0, 7)

const recordAt = (commit: string, approved_files: string[] = []) => ({
    schema_version: 1,
    commit,
    approved_files,
})

describe('the record kept after a send (#762)', () => {
    test('a send at C1 with src/a.ts approved writes reviewed/octocat/hello-world/pr-12.json', async () => {
        const repo = await makeSendRepo()
        dirs.push(repo.dir)
        const made = await openSendApp(repo)
        await made.approveA()
        await made.prDraft('Looks right')

        await made.send('Just comments')

        const saved: unknown = JSON.parse(
            await readFile(
                join(repo.walk_dir, 'reviewed/octocat/hello-world/pr-12.json'),
                'utf8'
            )
        )
        expect(saved).toEqual({
            schema_version: 1,
            commit: repo.head_sha,
            approved_files: ['src/a.ts'],
        })
    })
})

describe('reading the record from GitHub (#762)', () => {
    test("with no local record, the newest review's record line names C1 as the last review", async () => {
        const repo = await visitRepo(['src/b.ts'])
        const line = reviewRecordLine({
            record: { schema_version: 1, commit: repo.c1, approved_files: [] },
        })

        const { summary } = await openVisitApp(repo, {
            reviews: [submittedReview(`Looks close.\n\n${line}`)],
        })

        expect(htmlText({ html: summary() })).toContain(
            `Since your last review at ${short(repo.c1)}, 1 file changed.`
        )
    })

    test('a record line whose JSON fails the schema counts as none: the whole walk is shown', async () => {
        const repo = await visitRepo(['src/b.ts'])
        const good = reviewRecordLine({
            record: { schema_version: 1, commit: repo.c1, approved_files: [] },
        })
        const bad = `<!-- luca-walk review {"schema_version":2,"commit":"${repo.c1}"} -->`
        const valid = await openVisitApp(repo, {
            reviews: [submittedReview(`Looks close.\n\n${good}`)],
        })
        expect(valid.descriptions()).toEqual([UNCHANGED, '', UNCHANGED])

        const { descriptions, summary } = await openVisitApp(repo, {
            reviews: [submittedReview(`Looks close.\n\n${bad}`)],
        })

        expect(descriptions()).toEqual(['', '', ''])
        expect(htmlText({ html: summary() })).not.toContain('last review')
    })
})

describe('a second visit walks only what changed (#762)', () => {
    test('with only src/b.ts changed since C1, only its stop is to walk and Start goes to it', async () => {
        const repo = await visitRepo(['src/b.ts'])
        await writeLocalRecord(repo, recordAt(repo.c1))
        const { host, run, descriptions } = await openVisitApp(repo)

        expect(descriptions()).toEqual([UNCHANGED, '', UNCHANGED])

        await run('lucaWalk.startWalk')

        expect(host.diffs.at(-1)?.title).toBe('src/b.ts (#12)')
    })

    test('Next stop from the src/b.ts stop opens no diff when no later stop is to walk', async () => {
        const repo = await visitRepo(['src/b.ts'])
        await writeLocalRecord(repo, recordAt(repo.c1))
        const { host, run } = await openVisitApp(repo)
        await run('lucaWalk.startWalk')
        const opened = host.diffs.length

        await run('lucaWalk.nextStop')

        expect(host.diffs).toHaveLength(opened)
        expect(host.diffs.at(-1)?.title).toBe('src/b.ts (#12)')
    })

    test('a loose ends stop with a change in src/b.ts is to walk', async () => {
        const repo = await visitRepo(['src/b.ts'])
        await writeLocalRecord(repo, recordAt(repo.c1))
        const { host, run, descriptions } = await openVisitApp(repo, {
            stops: [
                ...THREE_STOPS.filter((stop) => stop.id !== 's2'),
                {
                    id: 's9',
                    title: 'Loose ends',
                    loose_ends: true,
                    changes: [{ id: 'c9', path: 'src/b.ts', line: 1 }],
                },
            ],
        })

        expect(descriptions()).toEqual([UNCHANGED, UNCHANGED, ''])

        await run('lucaWalk.startWalk')

        expect(host.diffs.at(-1)?.title).toBe('src/b.ts (#12)')
    })

    test('an approved file that changed loses its mark; an unchanged one keeps it', async () => {
        const repo = await visitRepo(['src/b.ts'])
        await writeLocalRecord(
            repo,
            recordAt(repo.c1, ['src/a.ts', 'src/b.ts'])
        )

        const { descriptions } = await openVisitApp(repo)

        expect(descriptions()).toEqual([
            `${UNCHANGED} · looks good`,
            '',
            UNCHANGED,
        ])
    })

    test('a load at C1 after the review at C1 does not stop C2 from removing the mark of a changed file', async () => {
        const repo = await visitRepo(['src/b.ts'])
        await writeLocalRecord(
            repo,
            recordAt(repo.c1, ['src/a.ts', 'src/b.ts'])
        )
        const same = await openVisitApp(repo, { head: repo.c1 })
        expect(same.descriptions()).toEqual([
            `${UNCHANGED} · looks good`,
            `${UNCHANGED} · looks good`,
            UNCHANGED,
        ])

        const { descriptions } = await openVisitApp(repo)

        expect(descriptions()).toEqual([
            `${UNCHANGED} · looks good`,
            '',
            UNCHANGED,
        ])
    })

    test('a changed file approved again on the second visit keeps its mark in a new app', async () => {
        const repo = await visitRepo(['src/b.ts'])
        await writeLocalRecord(
            repo,
            recordAt(repo.c1, ['src/a.ts', 'src/b.ts'])
        )
        const first = await openVisitApp(repo)
        first.host.active_editor = {
            uri: pathToFileURL(join(repo.checkout, 'src/b.ts')).href,
            start_line: 1,
            end_line: 1,
        }
        await first.run('lucaWalk.toggleLooksGood')
        expect(first.descriptions()[1]).toBe('looks good')

        const { descriptions } = await openVisitApp(repo)

        expect(descriptions()).toEqual([
            `${UNCHANGED} · looks good`,
            'looks good',
            UNCHANGED,
        ])
    })

    test('after walking every stop and sending at C1, the visit at C2 drops the old place: unchanged, empty, unchanged, and Next goes to src/b.ts', async () => {
        const repo = await visitRepo(['src/b.ts'])
        const first = await openVisitApp(repo, { head: repo.c1 })
        await first.run('lucaWalk.startWalk')
        await first.run('lucaWalk.nextStop')
        await first.run('lucaWalk.nextStop')
        expect(first.descriptions()).toEqual(['done', 'done', 'current'])
        first.host.answers.push('Looks right', 'Just comments')
        await first.run('lucaWalk.commentOnPullRequest')
        await first.run('lucaWalk.sendReview')
        expect(first.host.messages).toContainEqual({
            kind: 'info',
            text: 'Review sent to #12.',
        })

        const { host, run, descriptions } = await openVisitApp(repo)

        expect(descriptions()).toEqual([UNCHANGED, '', UNCHANGED])

        await run('lucaWalk.nextStop')

        expect(host.diffs.at(-1)?.title).toBe('src/b.ts (#12)')
    })

    test('browsing the plain diff on a second visit walks only the files changed since the last review', async () => {
        const repo = await visitRepo(['src/b.ts'])
        await writeLocalRecord(repo, recordAt(repo.c1))
        const { host, run, press, descriptions } = await openVisitApp(repo, {
            with_story: false,
        })

        await press('browse_diff')

        expect(host.stops.map(({ label }) => label)).toEqual([
            '1. src/a.ts',
            '2. src/b.ts',
            '3. src/c.ts',
        ])
        expect(descriptions()).toEqual([UNCHANGED, 'current', UNCHANGED])
        expect(host.diffs.at(-1)?.title).toBe('src/b.ts (#12)')
        const opened = host.diffs.length

        await run('lucaWalk.nextStop')

        expect(host.diffs).toHaveLength(opened)
    })

    test('the Summary panel says one file changed since the last review', async () => {
        const repo = await visitRepo(['src/b.ts'])
        await writeLocalRecord(repo, recordAt(repo.c1))

        const { summary } = await openVisitApp(repo)

        expect(htmlText({ html: summary() })).toContain(
            `Since your last review at ${short(repo.c1)}, 1 file changed.`
        )
    })

    test('the Summary panel says two files changed since the last review', async () => {
        const repo = await visitRepo(['src/b.ts', 'src/c.ts'])
        await writeLocalRecord(repo, recordAt(repo.c1))

        const { summary } = await openVisitApp(repo)

        expect(htmlText({ html: summary() })).toContain(
            `Since your last review at ${short(repo.c1)}, 2 files changed.`
        )
    })
})

describe('the two edge cases of a second visit (#762)', () => {
    test('a record at the head marks every stop unchanged and says nothing changed', async () => {
        const repo = await visitRepo(['src/b.ts'])
        await writeLocalRecord(repo, recordAt(repo.c2))

        const { descriptions, summary } = await openVisitApp(repo)

        expect(descriptions()).toEqual([UNCHANGED, UNCHANGED, UNCHANGED])
        expect(htmlText({ html: summary() })).toContain(
            `Nothing changed since your last review at ${short(repo.c2)}.`
        )
    })

    test("a record commit gone from the pull request's history shows the whole walk", async () => {
        const repo = await visitRepo(['src/b.ts'])
        await writeLocalRecord(repo, recordAt(repo.gone))

        const { descriptions, summary } = await openVisitApp(repo)

        expect(descriptions()).toEqual(['', '', ''])
        expect(htmlText({ html: summary() })).toContain(
            `Your last review was at ${short(repo.gone)}, which is no longer in this pull request's history, so the whole walk is shown.`
        )
    })
})
