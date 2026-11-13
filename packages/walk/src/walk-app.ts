import { z } from 'zod'

import { createBrowseSession } from './browse-session'
import { prepareCheckout } from './checkout'
import type { Feedback } from './feedback'
import {
    loadPullRequest,
    messageOf,
    readPullView,
    type PullHead,
    type PullView,
    type Shown,
} from './load-pull-request'
import { mapHtml } from './map-html'
import { notYourRepoBadge, storyCommand, storyPlace } from './not-your-repo'
import {
    checkoutRefOf,
    githubRepoOf,
    readAnswer,
    type PullRequestRef,
} from './pull-request-ref'
import { reviewReadyItems, type ReviewReadyItem } from './review-ready-list'
import { filesToWalk, lastReviewOf, visitNote } from './second-visit'
import { sendReview } from './send-review'
import { summaryHtml } from './summary-html'
import type { WalkGit, WalkHost } from './walk-host'
import type { WalkSession } from './walk-session'
import { readBaseUri } from './walk-uris'

import type { Gh } from '../../engine/src/story/story-github'

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

const PanelMessageSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('button'), id: z.string() }),
    z.object({
        type: z.literal('open_link'),
        url: z.url({ protocol: /^https?$/ }),
    }),
    z.object({ type: z.literal('open_file'), path: z.string() }),
])

/** The feedback commands, by what they ask of the feedback. */
const FEEDBACK_STEPS: Record<string, (feedback: Feedback) => Promise<void>> = {
    'lucaWalk.suggestChange': (feedback) => feedback.suggestChange(),
    'lucaWalk.commentOnFile': (feedback) => feedback.commentOnFile(),
    'lucaWalk.commentOnPullRequest': (feedback) =>
        feedback.commentOnPullRequest(),
    'lucaWalk.toggleLooksGood': (feedback) => feedback.toggleLooksGood(),
}

/** The walk commands, by what they ask of the walk. */
const WALK_STEPS: Record<string, (walk: WalkSession) => Promise<void>> = {
    'lucaWalk.startWalk': (walk) => walk.start(),
    'lucaWalk.nextStop': (walk) => walk.nextStop(),
    'lucaWalk.previousStop': (walk) => walk.previousStop(),
    'lucaWalk.nextChange': (walk) => walk.nextChange(),
    'lucaWalk.previousChange': (walk) => walk.previousChange(),
    'lucaWalk.backToWalk': (walk) => walk.backToWalk(),
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

    /**
     * The command shown instead of `Write the story`, and why; null on the
     * owner's own pull request in their own repo, where the button starts
     * a terminal in the checkout.
     */
    const storyCommandOf = (now: Shown) => {
        const place = storyPlace({
            login: now.login,
            your_repo: now.your_repo,
            author: now.author,
        })
        return place.kind === 'terminal'
            ? null
            : {
                  command: storyCommand({
                      ref: now.ref,
                      checkout: now.checkout,
                  }),
                  why: place.why,
              }
    }

    const showSummary = async (now: Shown) => {
        await host.showPanel({
            id: 'summary',
            title: `Summary of #${now.ref.number}`,
            html: summaryHtml({
                pr_number: now.ref.number,
                loaded: now.loaded,
                story_requested: now.story_requested,
                replies: now.replies,
                visit_note: visitNote({ visit: now.visit }),
                story_note: now.story_note,
                story_command: storyCommandOf(now),
            }),
        })
    }

    const load = async (ref: PullRequestRef) => {
        const now = await loadPullRequest({
            host,
            gh,
            git,
            walk_dir,
            stories_dir,
            remote_url,
            ref,
        })
        shown = now
        await host.showBadge(
            now.your_repo
                ? null
                : notYourRepoBadge({ repo: ref.repo, login: now.login })
        )
        await showSummary(now)
        await now.feedback.showThreads()
        if (now.walk !== null) await now.walk.showStops()
    }

    const walkStep = async ({
        now,
        step,
    }: {
        now: Shown
        step: (walk: WalkSession) => Promise<void>
    }) => {
        if (now.walk === null) {
            await error(
                `#${now.ref.number} has no story to walk. Use "Browse the diff" to read the plain diff.`
            )
            return
        }
        await step(now.walk)
    }

    /** The head the pull request was loaded at, or null after saying there is none. */
    const headOf = async ({
        now,
    }: {
        now: Shown
    }): Promise<PullHead | null> => {
        if (now.head === null) {
            await error(
                `Luca Walk could not load #${now.ref.number}. Use "Reload the story" to try again.`
            )
        }
        return now.head
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
        let pull: PullView
        try {
            pull = await readPullView({ gh, ref })
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

    const openFromList = async () => {
        let items: ReviewReadyItem[]
        try {
            items = await reviewReadyItems({ gh, stories_dir })
        } catch (thrown) {
            await error(
                `Luca Walk could not list the pull requests: ${messageOf(thrown)}`
            )
            return
        }
        if (items.length === 0) {
            await host.showMessage({
                kind: 'info',
                text: 'No open pull requests are ready to review.',
            })
            return
        }
        const picked = await host.pick({
            placeholder: 'Pull request to review',
            items,
        })
        if (picked !== null) await openPullRequest(picked.ref)
    }

    /**
     * `Write the story`: on your own pull request in your own repo,
     * `claude` runs `/luca-pr-prep` in a terminal in the checkout;
     * anywhere else (#766), the command that runs it outside the checkout
     * is copied instead. The only place Luca Walk starts a terminal.
     */
    const writeStory = async (now: Shown) => {
        const shown_command = storyCommandOf(now)
        if (shown_command === null) {
            const url = `https://github.com/${now.ref.repo}/pull/${now.ref.number}`
            await host.startTerminal({
                name: 'Luca: write the story',
                cwd: now.checkout,
                command: `claude "/luca-pr-prep ${url}"`,
            })
        } else {
            await host.copyText({ text: shown_command.command })
            await host.showMessage({
                kind: 'info',
                text: `Copied the command that writes the story of #${now.ref.number}. Run it in a terminal, then press Reload the story.`,
            })
        }
        now.story_requested = true
        await showSummary(now)
    }

    /** `Browse the diff`: one stop per changed file, at the first one to walk. */
    const browseDiff = async (now: Shown) => {
        const head = await headOf({ now })
        if (head === null) return
        if (!head.base.ok) {
            await error(
                `Luca Walk could not read the diff of #${now.ref.number}: ${head.base.error}`
            )
            return
        }
        const browse = await createBrowseSession({
            host,
            git,
            walk_dir,
            ref: now.ref,
            checkout: now.checkout,
            base_sha: head.base.sha,
            head_sha: head.sha,
            looksGood: now.feedback.looksGood,
            files_to_walk: filesToWalk({ visit: now.visit }),
            last_review: lastReviewOf({ visit: now.visit }),
        })
        if (browse === null) return
        now.walk = browse
        await browse.showStops()
        await browse.backToWalk()
    }

    const showMap = (now: Shown) =>
        walkStep({
            now,
            step: async (walk) => {
                if (walk.story === null) {
                    await error(
                        `#${now.ref.number} has no story, so it has no map. Use "Write the story" for a guided walk.`
                    )
                    return
                }
                await host.showPanel({
                    id: 'map',
                    title: `Map of #${now.ref.number}`,
                    html: mapHtml({ story: walk.story }),
                })
            },
        })

    const send = async (now: Shown) => {
        const head = await headOf({ now })
        if (head === null) return
        await sendReview({
            host,
            gh,
            git,
            walk_dir,
            ref: now.ref,
            checkout: now.checkout,
            feedback: now.feedback,
            author: head.author,
            head_sha: head.sha,
            base: head.base,
        })
    }

    return {
        /** Runs one of `WALK_COMMANDS`. */
        run: async ({ command }: { command: string; args: unknown[] }) => {
            if (command === 'lucaWalk.openPullRequest') {
                const ref = await askForPullRequest()
                if (ref !== null) await openPullRequest(ref)
                return
            }
            if (command === 'lucaWalk.openFromList') return openFromList()
            const now = shown
            if (now === null) {
                await error('Open a pull request first.')
                return
            }
            if (command === 'lucaWalk.showSummary') return showSummary(now)
            if (command === 'lucaWalk.showMap') return showMap(now)
            if (command === 'lucaWalk.writeStory') return writeStory(now)
            if (command === 'lucaWalk.reloadStory') return load(now.ref)
            if (command === 'lucaWalk.sendReview') return send(now)
            const step = WALK_STEPS[command]
            if (step !== undefined) return walkStep({ now, step })
            const feedbackStep = FEEDBACK_STEPS[command]
            if (feedbackStep !== undefined) return feedbackStep(now.feedback)
        },

        /** A comment typed in VS Code's comment box. */
        draftCommentAdded: async (added: {
            uri: string
            start_line: number
            end_line: number
            body: string
        }) => {
            if (shown === null) {
                await error('Open a pull request first.')
                return
            }
            await shown.feedback.draftAdded(added)
        },

        /** A draft's body was edited in its thread. */
        draftEdited: async (edited: { draft_id: string; body: string }) => {
            await shown?.feedback.draftEdited(edited)
        },

        /** A draft was deleted from its thread. */
        draftDeleted: async (deleted: { draft_id: string }) => {
            await shown?.feedback.draftDeleted(deleted)
        },

        /** VS Code started the extension: load the checkout the window shows. */
        activated: async () => {
            const folder = await host.workspaceFolder()
            if (folder === null) return
            const ref = checkoutRefOf({ walk_dir, folder })
            if (ref !== null) await load(ref)
        },

        /** A message from a webview: a button, a link or a map box was clicked. */
        panelMessage: async ({
            message,
        }: {
            panel: string
            message: unknown
        }) => {
            const parsed = PanelMessageSchema.safeParse(message)
            if (!parsed.success) return
            if (parsed.data.type === 'open_link') {
                await host.openUrl({ url: parsed.data.url })
                return
            }
            const now = shown
            if (now === null) return
            if (parsed.data.type === 'open_file') {
                const { path } = parsed.data
                return walkStep({
                    now,
                    step: (walk) => walk.goToFile({ path }),
                })
            }
            const { id } = parsed.data
            if (id === 'write_story' || id === 'copy_story_command') {
                return writeStory(now)
            }
            if (id === 'show_map') return showMap(now)
            if (id === 'reload_story') return load(now.ref)
            if (id === 'browse_diff') return browseDiff(now)
            if (id === 'start_walk') {
                return walkStep({ now, step: (walk) => walk.start() })
            }
        },

        /** A stop was clicked in the Stops view. */
        stopPicked: async ({ stop_id }: { stop_id: string }) => {
            await shown?.walk?.pickStop({ stop_id })
        },

        /** The cursor moved to `line` (1-based) of the document `uri`. */
        cursorMoved: async ({ uri, line }: { uri: string; line: number }) => {
            await shown?.walk?.cursorMoved({ uri, line })
        },

        /** The text of a `luca-walk-base` document: the file at its commit. */
        baseDocumentText: async ({ uri }: { uri: string }): Promise<string> => {
            const base = readBaseUri({ uri })
            if (base === null || base.sha === null || shown === null) return ''
            const read = await git({
                args: ['show', `${base.sha}:${base.path}`],
                cwd: shown.checkout,
            })
            return read.ok ? read.stdout : ''
        },
    }
}

export type WalkApp = ReturnType<typeof createWalkApp>
