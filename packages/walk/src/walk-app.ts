import { z } from 'zod'

import { prepareCheckout } from './checkout'
import {
    checkoutPath,
    checkoutRefOf,
    githubRepoOf,
    readAnswer,
    type PullRequestRef,
} from './pull-request-ref'
import { summaryHtml, type Loaded } from './summary-html'
import type { WalkGit, WalkHost } from './walk-host'

import type { Gh } from '../../engine/src/story/story-github'
import { prNow } from '../../engine/src/story/story-github'
import { findStory } from '../../engine/src/story/story-pick'

/**
 * Luca Walk's app (#752, section 2): every rule lives here. It never
 * imports `vscode`: it talks to VS Code through a `WalkHost`, and to the
 * outside world through `gh`, `git` and the file system.
 */

/** Every command Luca Walk contributes (#752, section 3). */
export const WALK_COMMANDS = [
    'lucaWalk.openPullRequest',
    'lucaWalk.openFromList',
    'lucaWalk.showSummary',
    'lucaWalk.showMap',
    'lucaWalk.startWalk',
    'lucaWalk.nextStop',
    'lucaWalk.previousStop',
    'lucaWalk.nextChange',
    'lucaWalk.previousChange',
    'lucaWalk.backToWalk',
    'lucaWalk.suggestChange',
    'lucaWalk.commentOnFile',
    'lucaWalk.commentOnPullRequest',
    'lucaWalk.toggleLooksGood',
    'lucaWalk.sendReview',
    'lucaWalk.writeStory',
    'lucaWalk.reloadStory',
]

const messageOf = (thrown: unknown): string =>
    thrown instanceof Error ? thrown.message : String(thrown)

const PullViewSchema = z.object({
    number: z.number().int(),
    title: z.string(),
    author: z.object({ login: z.string() }),
    baseRefName: z.string(),
    headRefOid: z.string(),
    state: z.string(),
    url: z.string(),
})

const PanelMessageSchema = z.object({
    type: z.literal('button'),
    id: z.string(),
})

/** The pull request on screen. */
type Shown = {
    ref: PullRequestRef
    checkout: string
    loaded: Loaded
    story_requested: boolean
}

/**
 * Makes the app.
 *
 * @param remote_url - Where to clone a repo from (GitHub; a folder in tests).
 * @example
 * const app = createWalkApp({ host, gh, git, walk_dir, stories_dir, remote_url })
 * await app.activated()
 */
export const createWalkApp = ({
    host,
    gh,
    git,
    walk_dir,
    stories_dir,
    remote_url,
}: {
    host: WalkHost
    gh: Gh
    git: WalkGit
    walk_dir: string
    stories_dir: string
    remote_url: (where: { repo: string }) => string
}) => {
    let shown: Shown | null = null

    const error = (text: string) => host.showMessage({ kind: 'error', text })

    const showSummary = async (now: Shown) => {
        await host.showPanel({
            id: 'summary',
            title: `Summary of #${now.ref.number}`,
            html: summaryHtml({
                pr_number: now.ref.number,
                loaded: now.loaded,
                story_requested: now.story_requested,
            }),
        })
    }

    const load = async (ref: PullRequestRef) => {
        const { repo, number: pr_number } = ref
        let loaded: Loaded
        try {
            const { found } = await findStory({
                gh,
                stories_dir,
                repo,
                pr_number,
            })
            const { head_sha } = await prNow({ gh, repo, pr_number })
            loaded = { status: 'found', found, head_sha }
        } catch (thrown) {
            loaded = { status: 'failed', message: messageOf(thrown) }
        }
        shown = {
            ref,
            checkout: checkoutPath({ walk_dir, ref }),
            loaded,
            story_requested: false,
        }
        await showSummary(shown)
    }

    /** The pull request the owner named, or null after telling them why not. */
    const askForPullRequest = async (): Promise<PullRequestRef | null> => {
        const answer = await host.askText({
            prompt: 'Pull request number or URL',
        })
        if (answer === null) return null
        const read = readAnswer({ answer })
        if (read === null) {
            await error('That is not a pull request number or URL.')
            return null
        }
        if (read.kind === 'url') return read.ref
        const folder = await host.workspaceFolder()
        const origin =
            folder === null
                ? null
                : await git({
                      args: ['remote', 'get-url', 'origin'],
                      cwd: folder,
                  })
        const repo =
            origin === null || !origin.ok
                ? null
                : githubRepoOf({ remote: origin.stdout })
        if (repo === null) {
            await error(
                "Give the pull request's URL: this window has no GitHub repo to read a number against."
            )
            return null
        }
        return { repo, number: read.number }
    }

    const openPullRequest = async (ref: PullRequestRef) => {
        const view = await gh({
            args: [
                'pr',
                'view',
                String(ref.number),
                '--repo',
                ref.repo,
                '--json',
                'number,title,author,baseRefName,headRefOid,state,url',
            ],
        })
        if (!view.ok) {
            await error(
                `Luca Walk could not read #${ref.number}: ${view.stderr.trim() || 'gh failed'}`
            )
            return
        }
        let pull: z.infer<typeof PullViewSchema>
        try {
            pull = PullViewSchema.parse(JSON.parse(view.stdout))
        } catch (thrown) {
            await error(
                `Luca Walk could not read #${ref.number}: ${messageOf(thrown)}`
            )
            return
        }
        const prepared = await prepareCheckout({
            git,
            walk_dir,
            remote_url: remote_url({ repo: ref.repo }),
            ref,
            base_ref: pull.baseRefName,
            head_sha: pull.headRefOid,
        })
        if (!prepared.ok) {
            await error(prepared.error)
            return
        }
        if ((await host.workspaceFolder()) === prepared.path) {
            await load(ref)
            return
        }
        await host.openFolder({ path: prepared.path })
    }

    const writeStory = async (now: Shown) => {
        const url = `https://github.com/${now.ref.repo}/pull/${now.ref.number}`
        await host.startTerminal({
            name: 'Luca: write the story',
            cwd: now.checkout,
            command: `claude "/luca-pr-prep ${url}"`,
        })
        now.story_requested = true
        await showSummary(now)
    }

    const notBuilt = () =>
        host.showMessage({ kind: 'info', text: 'Not built yet.' })

    return {
        /** Runs one of `WALK_COMMANDS`. */
        run: async ({ command }: { command: string; args: unknown[] }) => {
            if (command === 'lucaWalk.openPullRequest') {
                const ref = await askForPullRequest()
                if (ref !== null) await openPullRequest(ref)
                return
            }
            if (command === 'lucaWalk.openFromList') return notBuilt()
            const now = shown
            if (now === null) {
                await error('Open a pull request first.')
                return
            }
            if (command === 'lucaWalk.showSummary') return showSummary(now)
            if (command === 'lucaWalk.writeStory') return writeStory(now)
            if (command === 'lucaWalk.reloadStory') return load(now.ref)
            return notBuilt()
        },

        /** VS Code started the extension: load the checkout the window shows. */
        activated: async () => {
            const folder = await host.workspaceFolder()
            if (folder === null) return
            const ref = checkoutRefOf({ walk_dir, folder })
            if (ref !== null) await load(ref)
        },

        /** A message from a webview: a button was pressed. */
        panelMessage: async ({
            message,
        }: {
            panel: string
            message: unknown
        }) => {
            const parsed = PanelMessageSchema.safeParse(message)
            const now = shown
            if (!parsed.success || now === null) return
            const { id } = parsed.data
            if (id === 'write_story') return writeStory(now)
            if (id === 'reload_story') return load(now.ref)
            return notBuilt()
        },
    }
}

export type WalkApp = ReturnType<typeof createWalkApp>
