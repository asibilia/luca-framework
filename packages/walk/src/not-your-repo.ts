import type { PullRequestRef } from './pull-request-ref'
import { isSignedIn } from './signed-in'
import type { WalkBadge } from './walk-host'

/**
 * What Luca Walk shows in a repo that isn't yours (#766): one that isn't
 * the signed-in user's own account's (`isOwnRepo`), such as an
 * organization's, or any repo when gh can't say who is signed in.
 */

const DIFFERENT =
    'Luca Walk changes no labels, keeps its review record on this computer only, and shows a command to copy instead of Write the story.'

/**
 * The always-visible badge for a pull request in a repo that isn't yours.
 *
 * @param login - The signed-in user; null when gh could not say.
 * @example
 * notYourRepoBadge({ repo: 'acme/site', login: 'octocat' })
 * // { text: 'Not your repo', tooltip: 'acme/site is not your own repo, so Luca Walk changes no labels, ...' }
 */
export const notYourRepoBadge = ({
    repo,
    login,
}: {
    repo: string
    login: string | null
}): WalkBadge => ({
    text: 'Not your repo',
    tooltip:
        login === null
            ? `Luca Walk could not read who is signed in to GitHub, so ${repo} counts as not your own repo: ${DIFFERENT}`
            : `${repo} is not your own repo, so ${DIFFERENT}`,
})

/** `text` as one single-quoted shell word. */
const shellWord = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`

/**
 * The command that writes the story of `ref` anywhere but the owner's own
 * pull request in their own repo (`storyPlace`), for the owner to copy
 * and run. It starts `claude` in a new empty folder,
 * never in the checkout: the checkout holds the pull request author's
 * `.claude/settings.json` hooks, `.mcp.json` and `CLAUDE.md`, which
 * `claude` loads from the folder it starts in. `/luca-pr-prep` reads the
 * pull request by its URL, saves the story in the private home
 * (`--private`, this computer only), and reads the code from the
 * checkout's git history with `git -C`.
 *
 * @example
 * storyCommand({ ref: { repo: 'acme/site', number: 12 }, checkout: '/w/pr-12' })
 * // `cd "$(mktemp -d)" && claude '/luca-pr-prep https://github.com/acme/site/pull/12 --private Read the code with git -C /w/pr-12, which holds the commits of this pull request.'`
 */
export const storyCommand = ({
    ref,
    checkout,
}: {
    ref: PullRequestRef
    checkout: string
}): string => {
    const url = `https://github.com/${ref.repo}/pull/${ref.number}`
    const prompt = `/luca-pr-prep ${url} --private Read the code with git -C ${checkout}, which holds the commits of this pull request.`
    return `cd "$(mktemp -d)" && claude ${shellWord(prompt)}`
}

/**
 * Where `Write the story` runs `claude` (#766): in a terminal in the
 * checkout only on the signed-in user's own pull request in their own
 * repo, where the checkout's Claude settings are their own. Anywhere else
 * (and when gh can't say who is signed in) the command to copy runs it in
 * a new empty folder, and `why` says why, in a few plain words.
 *
 * @param author - The pull request's author; null when unknown.
 * @example
 * storyPlace({ login: 'octocat', your_repo: true, author: 'hubot' })
 * // { kind: 'command', why: "This pull request isn't yours, so the story command runs outside its checkout." }
 */
export const storyPlace = ({
    login,
    your_repo,
    author,
}: {
    login: string | null
    your_repo: boolean
    author: string | null
}): { kind: 'terminal' } | { kind: 'command'; why: string } =>
    login === null
        ? {
              kind: 'command',
              why: 'Luca Walk could not read who is signed in to GitHub, so the story command runs outside the checkout.',
          }
        : !your_repo
          ? {
                kind: 'command',
                why: "This repo isn't yours, so the story command runs outside its checkout.",
            }
          : !isSignedIn({ author, login })
            ? {
                  kind: 'command',
                  why: "This pull request isn't yours, so the story command runs outside its checkout.",
              }
            : { kind: 'terminal' }
