import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import type { CommandRequest, CommandResult } from './board-server'
import {
    BUN_PATH,
    ENGINE_PATH,
    createHarness,
    type Harness,
} from './testing/board-harness'
import {
    finalReviewStarted,
    finalReviewStuck,
    intakeOfThree,
    replyReceived,
    specSnapshot,
    stamp,
    ticketStuck,
    ticketWorktreeCreated,
    type Entry,
} from './testing/journal-fixtures'

/**
 * `reply.post` (#503): a reply button on stuck work posts its word on the
 * spec issue with `gh issue comment`. The server checks again that the item
 * is stuck and the word is one the engine takes for it, that the signed-in
 * `gh` user owns the spec, and posts once per stuck item.
 */

const GH = '/usr/bin/gh'

let harness: Harness | null = null
const dirs: string[] = []

afterEach(async () => {
    await harness?.cleanup()
    harness = null
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

const ok = (stdout: string): CommandResult => ({
    exit_code: 0,
    stdout,
    stderr: '',
})

/**
 * A fake `gh`: `api user` answers `login`, `issue view` answers the spec's
 * author and URL, and `issue comment` answers `comment` (a URL by default).
 */
const fakeGh =
    ({
        login = 'owner',
        comment = ok('https://github.com/o/r/issues/10#issuecomment-900\n'),
        view = ok(
            JSON.stringify({
                author: { login: 'owner' },
                url: 'https://github.com/o/r/issues/10',
            })
        ),
    }: {
        login?: string
        comment?: CommandResult
        view?: CommandResult
    } = {}) =>
    (request: CommandRequest): CommandResult | null => {
        if (request.command !== GH) return null
        if (request.args[0] === 'api') return ok(`${login}\n`)
        if (request.args[1] === 'view') return view
        if (request.args[1] === 'comment') return comment
        return { exit_code: 1, stdout: '', stderr: 'unknown gh command' }
    }

const ghCalls = () =>
    (harness?.commands ?? []).filter((request) => request.command === GH)

const comments = () =>
    ghCalls().filter((request) => request.args[1] === 'comment')

/** Starts a run in `/repo` and sends intake plus `entries`. */
const runWith = async ({
    entries,
    intake = intakeOfThree(),
    login,
    comment,
    view,
    files = [ENGINE_PATH, BUN_PATH, GH],
}: {
    entries: Entry[]
    intake?: Entry[]
    login?: string
    comment?: CommandResult
    view?: CommandResult
    files?: string[]
}) => {
    harness = await createHarness({ files })
    harness.setCommandHandler({ handler: fakeGh({ login, comment, view }) })
    const { run_id, token } = await harness.start()
    await harness.send({ run_id, token, entries: [...intake, ...entries] })
    return { board: harness, run_id, token }
}

const ticket13Stuck = (): Entry[] => [
    ticketWorktreeCreated({ ticket: 13 }),
    ticketStuck({
        ticket: 13,
        reason: 'red_check_failed',
        detail: 'The red check failed 3 times.',
    }),
]

describe('posting a reply', () => {
    test('an allowed word goes on the spec with gh issue comment, in the run repo', async () => {
        const { board, run_id } = await runWith({ entries: ticket13Stuck() })

        const output = await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })

        expect(output.ok).toBe(true)
        expect(output.status).toBe('posted')
        expect(output.posted?.comment_url).toBe(
            'https://github.com/o/r/issues/10#issuecomment-900'
        )
        expect(ghCalls().map((request) => request.args)).toEqual([
            ['api', 'user', '--jq', '.login'],
            ['issue', 'comment', '10', '--repo', 'o/r', '--body', 'retry #13'],
        ])
        expect(comments()[0]?.cwd).toBe('/repo')
        expect(comments()[0]?.env.GH_PROMPT_DISABLED).toBe('1')
    })

    test('board.read lists the posted reply and the run chat', async () => {
        const { board, run_id } = await runWith({ entries: ticket13Stuck() })
        await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'skip #13',
        })

        const read = await board.read()

        expect(read.chat_agent_id).toBe('agent-1')
        expect(read.posted).toHaveLength(1)
        expect(read.posted[0]).toMatchObject({
            key: 'ticket-13',
            reply: 'skip #13',
            taken_at: null,
        })
    })

    test('the engine taking it (reply_received) marks it taken', async () => {
        const { board, run_id, token } = await runWith({
            entries: ticket13Stuck(),
        })
        await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })
        const { next_seq } = await board.send({
            run_id,
            token,
            entries: [],
        })

        await board.send({
            run_id,
            token,
            entries: [replyReceived({ word: 'retry', ticket: 13 })],
            first_seq: next_seq,
        })

        const read = await board.read()
        expect(read.posted[0]?.taken_at).not.toBeNull()
        expect(read.selected?.needs_you).toEqual([])
    })

    test('a double tap posts once', async () => {
        const { board, run_id } = await runWith({ entries: ticket13Stuck() })
        const input = { run_id, key: 'ticket-13', reply: 'retry #13' }

        const [first, second] = await Promise.all([
            board.board.postReply(input),
            board.board.postReply(input),
        ])
        const third = await board.board.postReply(input)

        expect(comments()).toHaveLength(1)
        expect([first.status, second.status].toSorted()).toEqual([
            'already_posted',
            'posted',
        ])
        expect(third.status).toBe('already_posted')
        expect(third.ok).toBe(true)
    })

    test('a second, different word for the same stuck item is refused', async () => {
        const { board, run_id } = await runWith({ entries: ticket13Stuck() })
        await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })

        const output = await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'skip #13',
        })

        expect(output.status).toBe('refused')
        expect(output.message).toContain('retry #13')
        expect(comments()).toHaveLength(1)
    })

    test('the final review takes ship, retry, and stop', async () => {
        const { board, run_id } = await runWith({
            entries: [
                finalReviewStarted(),
                finalReviewStuck({
                    reason: 'changes_requested',
                    detail: 'Still 1 blocker.',
                }),
            ],
        })

        const output = await board.board.postReply({
            run_id,
            key: 'final',
            reply: 'ship',
        })

        expect(output.status).toBe('posted')
        expect(comments()[0]?.args.at(-1)).toBe('ship')
    })

    test('the run stuck on its budget takes a bare retry', async () => {
        const { board, run_id } = await runWith({
            entries: [
                {
                    kind: 'run_stuck',
                    ticket: null,
                    role: null,
                    content: { reason: 'run_budget', detail: 'Used it all.' },
                },
            ],
        })

        const retry = await board.board.postReply({
            run_id,
            key: 'run',
            reply: 'retry',
        })

        expect(retry.status).toBe('posted')
    })
})

describe('refusals', () => {
    const refused = async ({ key, reply }: { key: string; reply: string }) => {
        const { board, run_id } = await runWith({ entries: ticket13Stuck() })
        const output = await board.board.postReply({ run_id, key, reply })
        return output
    }

    test.each([
        ['a word the engine refuses for a ticket', 'ticket-13', 'ship'],
        ['a bare word for a ticket', 'ticket-13', 'retry'],
        ['another ticket in the word', 'ticket-13', 'retry #12'],
        ['anything else', 'ticket-13', 'retry #13; echo hi'],
        ['a ticket that is not stuck', 'ticket-12', 'retry #12'],
        ['a final review that is not stuck', 'final', 'ship'],
    ])('%s', async (_name, key, reply) => {
        const output = await refused({ key, reply })

        expect(output.ok).toBe(false)
        expect(output.status).toBe('refused')
        expect(output.message).not.toBe('')
        expect(ghCalls()).toEqual([])
    })

    test('an unknown run is refused', async () => {
        harness = await createHarness()
        const output = await harness.board.postReply({
            run_id: 'luca-nope',
            key: 'ticket-13',
            reply: 'retry #13',
        })

        expect(output.status).toBe('refused')
        expect(output.message).toContain('luca-nope')
    })

    test('a demo run is refused: it has no spec issue', async () => {
        harness = await createHarness({ files: [ENGINE_PATH, BUN_PATH, GH] })
        harness.setCommandHandler({ handler: fakeGh() })
        const { run_id, token } = await harness.start({ args: 'demo' })
        await harness.send({
            run_id,
            token,
            entries: [...intakeOfThree(), ...ticket13Stuck()],
        })

        const output = await harness.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })

        expect(output.status).toBe('refused')
        expect(output.message).toContain('demo')
        expect(ghCalls()).toEqual([])
    })
})

describe('the owner check', () => {
    test("a gh user who isn't the spec's author doesn't post, and says why", async () => {
        const { board, run_id } = await runWith({
            entries: ticket13Stuck(),
            login: 'someone-else',
        })

        const output = await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })

        expect(output.status).toBe('refused')
        expect(output.message).toContain('someone-else')
        expect(output.message).toContain('owner')
        expect(comments()).toEqual([])
    })

    test('the login is compared without case', async () => {
        const { board, run_id } = await runWith({
            entries: ticket13Stuck(),
            login: 'Owner',
        })

        const output = await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })

        expect(output.status).toBe('posted')
    })

    test('with no author in the journal, it asks gh issue view', async () => {
        const intake = intakeOfThree().map((entry) =>
            entry.kind === 'spec_snapshot'
                ? specSnapshot({
                      spec: 10,
                      title: 'Add CSV export',
                      order: [11, 12, 13],
                      author: null,
                  })
                : entry
        )
        const { board, run_id } = await runWith({
            intake,
            entries: ticket13Stuck(),
            view: ok(
                JSON.stringify({
                    author: { login: 'boss' },
                    url: 'https://github.com/o/r/issues/10',
                })
            ),
        })

        const output = await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })

        expect(output.status).toBe('refused')
        expect(output.message).toContain('boss')
        expect(ghCalls()[0]?.args).toEqual([
            'issue',
            'view',
            '10',
            '--repo',
            'o/r',
            '--json',
            'author,url',
        ])
    })
})

describe('gh failures', () => {
    test('a failed comment is an error, and the reply can be tried again', async () => {
        const { board, run_id } = await runWith({
            entries: ticket13Stuck(),
            comment: {
                exit_code: 1,
                stdout: '',
                stderr: 'HTTP 403: Resource not accessible\n',
            },
        })

        const output = await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })

        expect(output.ok).toBe(false)
        expect(output.status).toBe('failed')
        expect(output.message).toContain('HTTP 403')
        expect((await board.read()).posted).toEqual([])

        board.setCommandHandler({ handler: fakeGh() })
        const again = await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })
        expect(again.status).toBe('posted')
    })

    test('a failed login check is an error', async () => {
        const { board, run_id } = await runWith({ entries: ticket13Stuck() })
        board.setCommandHandler({
            handler: (request) =>
                request.args[0] === 'api'
                    ? {
                          exit_code: 1,
                          stdout: '',
                          stderr: 'You are not logged into any GitHub hosts.',
                      }
                    : null,
        })

        const output = await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })

        expect(output.status).toBe('failed')
        expect(output.message).toContain('not logged into')
        expect(comments()).toEqual([])
    })

    test('no gh is an error that says where to put it', async () => {
        const { board, run_id } = await runWith({
            entries: ticket13Stuck(),
            files: [ENGINE_PATH, BUN_PATH],
        })

        const output = await board.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'retry #13',
        })

        expect(output.status).toBe('failed')
        expect(output.message).toContain('LUCA_GH')
        expect(ghCalls()).toEqual([])
    })
})

describe('runs the board did not start', () => {
    test('a read-only run can post a reply, in its own repo', async () => {
        const runs_dir = await mkdtemp(join(tmpdir(), 'luca-board-reply-'))
        dirs.push(runs_dir)
        const run_id = 'luca-20260925-101500-aaaa'
        const entries = [...intakeOfThree(), ...ticket13Stuck()].map((entry) =>
            entry.kind === 'run_started'
                ? {
                      ...entry,
                      content: {
                          spec_number: 10,
                          config: {},
                          repo: '/code/tmnb',
                      },
                  }
                : entry
        )
        await mkdir(join(runs_dir, run_id), { recursive: true })
        await writeFile(
            join(runs_dir, run_id, 'journal.jsonl'),
            `${stamp({ entries })
                .map((record) => JSON.stringify(record))
                .join('\n')}\n`
        )
        harness = await createHarness({
            runs_dir,
            files: [ENGINE_PATH, BUN_PATH, GH],
        })
        harness.setCommandHandler({ handler: fakeGh() })

        const output = await harness.board.postReply({
            run_id,
            key: 'ticket-13',
            reply: 'stop',
        })

        expect(output.status).toBe('posted')
        expect(comments()[0]?.cwd).toBe('/code/tmnb')
        const read = await harness.board.readBoard({
            workspace_id: 'ws-9',
            directory: '/code/tmnb',
            run_id,
        })
        expect(read.chat_agent_id).toBeNull()
        expect(read.posted.map((entry) => entry.reply)).toEqual(['stop'])
    })
})
