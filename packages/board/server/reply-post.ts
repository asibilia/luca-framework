import { join } from 'node:path'

import { z } from 'zod'

import type { CommandResult, RunCommand } from './board-server'

import type { ReplyPostInput, ReplyPostOutput } from '../shared/board-rpc'
import type { BoardState } from '../shared/board-state'
import {
    allowedReplies,
    replyParts,
    repoOfIssueUrl,
    type PostedReply,
} from '../shared/reply-actions'

/**
 * `reply.post` (#503): a reply button on stuck work posts its word on the
 * spec issue with `gh issue comment`, so the owner doesn't have to go to
 * GitHub. It never trusts the button: it checks again, from the run's
 * board, that the item is stuck and the word is one the engine takes for
 * it, and that the signed-in `gh` user owns the spec (the engine counts
 * only the spec owner's replies). It posts once per stuck item. `gh` runs
 * with an argument list, never through a shell, and needs no engine token,
 * so runs the board didn't start can be answered too.
 */

/** How long one `gh` call may take. */
export const GH_TIMEOUT_MS = 30_000

const GH_HINT =
    'Install the GitHub CLI (gh), or set LUCA_GH to its absolute path for the Paseo daemon.'

/**
 * Finds `gh`: `LUCA_GH`, then the daemon's `PATH`, then the usual install
 * folders. Only an absolute path that exists counts, since Paseo's daemon
 * may run with a short `PATH`.
 *
 * @example
 * resolveGh({ env: process.env, home_dir: homedir(), file_exists })
 * // '/opt/homebrew/bin/gh', or null
 */
export const resolveGh = ({
    env,
    home_dir,
    file_exists,
}: {
    env: Record<string, string | undefined>
    home_dir: string
    file_exists: ({ path }: { path: string }) => boolean
}): string | null =>
    [
        env.LUCA_GH ?? '',
        ...(env.PATH ?? '').split(':').map((dir) => join(dir, 'gh')),
        '/opt/homebrew/bin/gh',
        '/usr/local/bin/gh',
        join(home_dir, '.local/bin/gh'),
    ].find((path) => path.startsWith('/') && file_exists({ path })) ?? null

/** A run as `reply.post` sees it. */
export type ReplyRun = {
    state: BoardState
    /** The run's repo folder; `null` when the board doesn't know it. */
    repo_dir: string | null
    /** The next journal seq the board wants: a later `reply_received` is new. */
    next_seq: number
}

/** A posted reply, with the run it is for and the seq it waits past. */
type PostedEntry = PostedReply & {
    run_id: string
    after_seq: number
    /** True while `gh` is posting it. */
    sending: boolean
}

const IssueViewSchema = z.object({
    author: z.object({ login: z.string() }),
    url: z.string(),
})

const firstLine = ({ text }: { text: string }): string =>
    text.trim().split('\n')[0]?.slice(0, 300) ?? ''

const ghProblem = ({ result }: { result: CommandResult }): string =>
    result.exit_code === null
        ? `it didn't finish in ${GH_TIMEOUT_MS / 1000} s`
        : firstLine({ text: result.stderr || result.stdout }) ||
          `it exited with ${result.exit_code}`

const refuse = (message: string): ReplyPostOutput => ({
    ok: false,
    status: 'refused',
    message,
    posted: null,
})

const fail = (message: string): ReplyPostOutput => ({
    ok: false,
    status: 'failed',
    message,
    posted: null,
})

const toPosted = ({ entry }: { entry: PostedEntry }): PostedReply => ({
    key: entry.key,
    since: entry.since,
    reply: entry.reply,
    posted_at: entry.posted_at,
    comment_url: entry.comment_url,
    taken_at: entry.taken_at,
})

/**
 * The reply poster, with `gh` run through `run_command`. It keeps what it
 * posted in memory (lost on a plugin restart), marks a reply taken when the
 * engine journals `reply_received` for it, and lists a run's posted replies
 * for `board.read`.
 *
 * @example
 * const poster = createReplyPoster({ run_command, env, home_dir, file_exists, now, log })
 * const output = await poster.postReply({ run, input: { run_id, key: 'ticket-13', reply: 'retry #13' } })
 */
export const createReplyPoster = ({
    run_command,
    env,
    home_dir,
    file_exists,
    now,
    log,
}: {
    run_command: RunCommand
    env: Record<string, string | undefined>
    home_dir: string
    file_exists: ({ path }: { path: string }) => boolean
    now: () => Date
    log: (message: string) => void
}) => {
    const posted = new Map<string, PostedEntry>()

    const ghEnv = (): Record<string, string> => {
        const gh_env: Record<string, string> = {}
        for (const [key, value] of Object.entries(env)) {
            if (value !== undefined) gh_env[key] = value
        }
        gh_env.GH_PROMPT_DISABLED = '1'
        return gh_env
    }

    /**
     * Checks the owner and posts the comment. A refusal or failure says why;
     * `comment_url` is what `gh` printed.
     */
    const send = async ({
        run,
        spec_number,
        reply,
    }: {
        run: ReplyRun
        spec_number: number
        reply: string
    }): Promise<
        | { ok: true; comment_url: string | null }
        | { ok: false; output: ReplyPostOutput }
    > => {
        const gh = resolveGh({ env, home_dir, file_exists })
        if (gh === null) {
            return { ok: false, output: fail(`Couldn't find gh. ${GH_HINT}`) }
        }
        const cwd = run.repo_dir ?? home_dir
        const runGh = (args: string[]) =>
            run_command({
                command: gh,
                args,
                cwd,
                env: ghEnv(),
                timeout_ms: GH_TIMEOUT_MS,
            })

        let owner = run.state.run.spec_author
        let repo = run.state.run.spec_repo
        if (owner === null || repo === null) {
            if (repo === null && run.repo_dir === null) {
                return {
                    ok: false,
                    output: fail(
                        `The board doesn't know spec #${spec_number}'s repo, so it can't post there.`
                    ),
                }
            }
            const view = await runGh([
                'issue',
                'view',
                String(spec_number),
                ...(repo === null ? [] : ['--repo', repo]),
                '--json',
                'author,url',
            ])
            const parsed =
                view.exit_code === 0
                    ? IssueViewSchema.safeParse(safeJson({ text: view.stdout }))
                    : null
            if (!parsed?.success) {
                return {
                    ok: false,
                    output: fail(
                        `Couldn't read spec #${spec_number}'s owner with gh issue view: ${parsed ? 'it gave an answer the board could not read' : ghProblem({ result: view })}.`
                    ),
                }
            }
            owner ??= parsed.data.author.login
            repo ??= repoOfIssueUrl({ url: parsed.data.url })
        }
        if (repo === null) {
            return {
                ok: false,
                output: fail(
                    `The board couldn't tell spec #${spec_number}'s repo, so it can't post there.`
                ),
            }
        }

        const user = await runGh(['api', 'user', '--jq', '.login'])
        const login = user.stdout.trim()
        if (user.exit_code !== 0 || login === '') {
            return {
                ok: false,
                output: fail(
                    `Couldn't tell who is signed in to gh: ${ghProblem({ result: user })}. Run gh auth login.`
                ),
            }
        }
        if (login.toLowerCase() !== owner.toLowerCase()) {
            return {
                ok: false,
                output: refuse(
                    `You're signed in to gh as ${login}, but spec #${spec_number} is ${owner}'s. The engine only counts ${owner}'s replies, so the board didn't post \`${reply}\`. Switch gh to ${owner} (gh auth switch), or reply as ${owner} on GitHub.`
                ),
            }
        }

        const comment = await runGh([
            'issue',
            'comment',
            String(spec_number),
            '--repo',
            repo,
            '--body',
            reply,
        ])
        if (comment.exit_code !== 0) {
            return {
                ok: false,
                output: fail(
                    `gh couldn't post \`${reply}\` on spec #${spec_number}: ${ghProblem({ result: comment })}.`
                ),
            }
        }
        const comment_url =
            comment.stdout
                .split('\n')
                .map((line) => line.trim())
                .find((line) => line.startsWith('https://')) ?? null
        return { ok: true, comment_url }
    }

    /**
     * Posts `input.reply` on the run's spec issue, if the run's board has
     * `input.key` stuck and the word is one the engine takes for it, and
     * the `gh` user owns the spec. The same reply for the same stuck item
     * is posted once (`already_posted` after that, and while it is in
     * flight); a different word for it is refused. A failed post can be
     * tried again. Never throws.
     */
    const postReply = async ({
        run,
        input,
    }: {
        run: ReplyRun | null
        input: ReplyPostInput
    }): Promise<ReplyPostOutput> => {
        const { run_id, key, reply } = input
        if (run === null) {
            return refuse(`The board doesn't know run ${run_id}.`)
        }
        const { state } = run
        if (state.run.demo) {
            return refuse(
                `Run ${run_id} is a demo: it has no spec issue to reply on.`
            )
        }
        const spec_number = state.run.spec_number
        if (spec_number === null) {
            return refuse(`Run ${run_id} doesn't name its spec issue yet.`)
        }
        const item = state.needs_you.find((entry) => entry.key === key)
        if (!item) {
            return refuse(
                `Nothing in run ${run_id} waits for a reply as "${key}" now, so the board didn't post \`${reply}\`.`
            )
        }
        const allowed = allowedReplies(item)
        if (!allowed.includes(reply)) {
            return refuse(
                `The engine doesn't take \`${reply}\` here. For "${item.subject}" it takes ${allowed.map((word) => `\`${word}\``).join(', ')}.`
            )
        }

        const id = `${run_id}\n${key}\n${item.since}`
        const existing = posted.get(id)
        if (existing) {
            if (existing.reply !== reply) {
                return refuse(
                    `\`${existing.reply}\` was already posted for this. The engine takes the first reply, so the board won't post \`${reply}\` too.`
                )
            }
            return {
                ok: true,
                status: 'already_posted',
                message: existing.sending
                    ? `\`${reply}\` is being posted now.`
                    : `\`${reply}\` was already posted on spec #${spec_number}.`,
                posted: existing.sending ? null : toPosted({ entry: existing }),
            }
        }
        // Kept before the first await, so a second tap sees it.
        const entry: PostedEntry = {
            key,
            since: item.since,
            reply,
            posted_at: now().toISOString(),
            comment_url: null,
            taken_at: null,
            run_id,
            after_seq: run.next_seq,
            sending: true,
        }
        posted.set(id, entry)
        try {
            const sent = await send({ run, spec_number, reply })
            if (!sent.ok) {
                posted.delete(id)
                log(`[${run_id}] reply \`${reply}\`: ${sent.output.message}`)
                return sent.output
            }
            entry.sending = false
            entry.comment_url = sent.comment_url
            log(
                `[${run_id}] posted \`${reply}\` on spec #${spec_number}${sent.comment_url ? `: ${sent.comment_url}` : ''}`
            )
            return {
                ok: true,
                status: 'posted',
                message: `Posted \`${reply}\` on spec #${spec_number}. The engine reads it within about a minute.`,
                posted: toPosted({ entry }),
            }
        } catch (error) {
            posted.delete(id)
            return fail(
                `Couldn't post \`${reply}\`: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    /**
     * The engine took a reply (`reply_received` at `seq`): marks the posted
     * replies it matches as taken.
     */
    const noteTaken = ({
        run_id,
        seq,
        time,
        word,
        ticket,
    }: {
        run_id: string
        seq: number
        time: string
        word: string
        ticket: number | null
    }) => {
        for (const entry of posted.values()) {
            if (entry.run_id !== run_id || entry.sending) continue
            if (entry.taken_at !== null || seq < entry.after_seq) continue
            const parts = replyParts({ reply: entry.reply })
            if (parts?.word === word && parts.ticket === ticket) {
                entry.taken_at = time
            }
        }
    }

    /** The replies posted for a run, oldest first. */
    const postedOf = ({ run_id }: { run_id: string }): PostedReply[] =>
        [...posted.values()]
            .filter((entry) => entry.run_id === run_id && !entry.sending)
            .map((entry) => toPosted({ entry }))

    return { postReply, noteTaken, postedOf }
}

/** Parses JSON, or `null` when it isn't. */
const safeJson = ({ text }: { text: string }): unknown => {
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}
