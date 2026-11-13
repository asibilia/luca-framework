import { join, relative, sep } from 'node:path'

/**
 * Naming a pull request (#752, sections 4 and 15): what the owner types,
 * the GitHub repo an `origin` remote points at, and the folders Luca Walk
 * keeps a repo's clone and a pull request's checkout in.
 */

/** A pull request: `owner/name` and its number. */
export type PullRequestRef = { repo: string; number: number }

const PART = '[A-Za-z0-9_.-]+'

const PULL_URL = new RegExp(
    `^https?://(?:www\\.)?github\\.com/(${PART})/(${PART})/pull/(\\d+)(?:[/?#].*)?$`,
    'i'
)

const NUMBER = /^#?(\d+)$/

const REMOTE = new RegExp(
    `^(?:https?://(?:www\\.)?github\\.com/|ssh://git@github\\.com/|git@github\\.com:)(${PART}?)/(${PART}?)(?:\\.git)?/?$`,
    'i'
)

/** An owner or name that can't leave its folder. */
const safe = (part: string | undefined): part is string =>
    part !== undefined && part !== '' && !part.startsWith('.')

const repoOf = ({
    owner,
    name,
}: {
    owner: string | undefined
    name: string | undefined
}): string | null => (safe(owner) && safe(name) ? `${owner}/${name}` : null)

/**
 * What the owner typed: a pull request URL names its repo, a number needs
 * the window's repo.
 *
 * @example
 * readAnswer({ answer: ' #12 ' }) // { kind: 'number', number: 12 }
 */
export const readAnswer = ({
    answer,
}: {
    answer: string
}):
    | { kind: 'url'; ref: PullRequestRef }
    | { kind: 'number'; number: number }
    | null => {
    const text = answer.trim()
    const url = PULL_URL.exec(text)
    if (url !== null) {
        const repo = repoOf({ owner: url[1], name: url[2] })
        const number = Number(url[3])
        return repo === null || number < 1
            ? null
            : { kind: 'url', ref: { repo, number } }
    }
    const bare = NUMBER.exec(text)
    if (bare === null) return null
    const number = Number(bare[1])
    return number < 1 ? null : { kind: 'number', number }
}

/**
 * The GitHub repo an `origin` remote points at, or null when it isn't one.
 *
 * @example
 * githubRepoOf({ remote: 'git@github.com:octocat/hello-world.git' }) // 'octocat/hello-world'
 */
export const githubRepoOf = ({ remote }: { remote: string }): string | null => {
    const found = REMOTE.exec(remote.trim())
    return found === null ? null : repoOf({ owner: found[1], name: found[2] })
}

/** Where Luca Walk clones a repo from: GitHub. */
export const githubRemoteUrl = ({ repo }: { repo: string }): string =>
    `https://github.com/${repo}.git`

/** Luca Walk's folder: `LUCA_WALK_DIR`, else `~/.local/state/luca/walk`. */
export const walkDir = ({
    home,
    env,
}: {
    home: string
    env: Record<string, string | undefined>
}): string => env.LUCA_WALK_DIR || join(home, '.local', 'state', 'luca', 'walk')

/** Luca Walk's own clone of `repo`. */
export const clonePath = ({
    walk_dir,
    repo,
}: {
    walk_dir: string
    repo: string
}): string => join(walk_dir, 'repos', ...repo.split('/'))

/** The checkout of one pull request. */
export const checkoutPath = ({
    walk_dir,
    ref,
}: {
    walk_dir: string
    ref: PullRequestRef
}): string =>
    join(walk_dir, 'checkouts', ...ref.repo.split('/'), `pr-${ref.number}`)

/**
 * The pull request whose checkout `folder` is, or null when it isn't one.
 *
 * @example
 * checkoutRefOf({ walk_dir, folder: `${walk_dir}/checkouts/octocat/hello-world/pr-12` }) // { repo: 'octocat/hello-world', number: 12 }
 */
export const checkoutRefOf = ({
    walk_dir,
    folder,
}: {
    walk_dir: string
    folder: string
}): PullRequestRef | null => {
    const parts = relative(join(walk_dir, 'checkouts'), folder).split(sep)
    if (parts.length !== 3) return null
    const [owner, name, pr] = parts
    const repo = repoOf({ owner, name })
    const number = /^pr-(\d+)$/.exec(pr ?? '')?.[1]
    if (repo === null || number === undefined || Number(number) < 1) {
        return null
    }
    return { repo, number: Number(number) }
}
