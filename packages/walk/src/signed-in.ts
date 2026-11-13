import type { Gh } from '../../engine/src/story/story-github'

/**
 * Who is signed in to GitHub (#766): read once per opened pull request,
 * and once per send, and passed to everything that asks "is this yours?".
 */

/**
 * The signed-in user's login, from `gh api user`; null when gh can't say
 * (not signed in, no network), which counts as "not yours" everywhere.
 *
 * @example
 * await readLogin({ gh }) // 'octocat'
 */
export const readLogin = async ({ gh }: { gh: Gh }): Promise<string | null> => {
    const user = await gh({ args: ['api', 'user', '--jq', '.login'] }).catch(
        () => null
    )
    const login = user?.stdout.trim() ?? ''
    return user?.ok === true && login !== '' ? login : null
}

/**
 * Whether `author` is the signed-in user: GitHub logins ignore case.
 *
 * @example
 * isSignedIn({ author: 'Octocat', login: 'octocat' }) // true
 */
export const isSignedIn = ({
    author,
    login,
}: {
    author: string | null
    login: string | null
}): boolean =>
    author !== null &&
    login !== null &&
    author.toLowerCase() === login.toLowerCase()
