import { isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * The documents a stop's diff shows (#752, section 6): the checkout's own
 * files as `file:` URIs, and a file at the base commit as a read-only
 * `luca-walk-base` document (`luca-walk-base:/src/a.ts?sha=<commit>`,
 * or `sha=empty` for the empty side of an added or deleted file).
 */

export const BASE_SCHEME = 'luca-walk-base'

const EMPTY = 'empty'

const SHA = /^[0-9a-f]{4,64}$/i

const encodePath = ({ path }: { path: string }) =>
    path.split('/').map(encodeURIComponent).join('/')

/** The file `path` at commit `sha`, or the empty document for `sha` null. */
export const baseUri = ({
    path,
    sha,
}: {
    path: string
    sha: string | null
}): string => `${BASE_SCHEME}:/${encodePath({ path })}?sha=${sha ?? EMPTY}`

/** The checkout's own file `path`. */
export const checkoutFileUri = ({
    checkout,
    path,
}: {
    checkout: string
    path: string
}): string => pathToFileURL(join(checkout, path)).href

/**
 * The path and commit of a `luca-walk-base` document; `sha` is null for
 * the empty document. Null when `uri` is not one.
 *
 * @example
 * readBaseUri({ uri: 'luca-walk-base:/src/a.ts?sha=empty' }) // { path: 'src/a.ts', sha: null }
 * readBaseUri({ uri: 'luca-walk-base:/src/a.ts?sha%3Dabc1234' }) // { path: 'src/a.ts', sha: 'abc1234' }
 */
export const readBaseUri = ({
    uri,
}: {
    uri: string
}): { path: string; sha: string | null } | null => {
    if (!uri.startsWith(`${BASE_SCHEME}:`)) return null
    let url: URL
    try {
        url = new URL(uri)
    } catch {
        return null
    }
    let path: string
    let query: string
    try {
        path = decodeURIComponent(url.pathname).replace(/^\/+/, '')
        // VS Code's `Uri.toString()` writes the query's `=` as `%3D`.
        query = decodeURIComponent(url.search.replace(/^\?/, ''))
    } catch {
        return null
    }
    const sha = new URLSearchParams(query).get('sha') ?? ''
    if (path === '') return null
    if (sha === EMPTY) return { path, sha: null }
    return SHA.test(sha) ? { path, sha } : null
}

/**
 * The repo path and diff side of a document: a checkout file is on the
 * `head` side, a base document on the `base` side. Null for anything
 * else, and for the empty document.
 */
export const documentOf = ({
    checkout,
    uri,
}: {
    checkout: string
    uri: string
}): { path: string; side: 'head' | 'base' } | null => {
    const base = readBaseUri({ uri })
    if (base !== null) {
        return base.sha === null ? null : { path: base.path, side: 'base' }
    }
    if (!uri.startsWith('file:')) return null
    let file: string
    try {
        file = fileURLToPath(uri)
    } catch {
        return null
    }
    const inside = relative(checkout, file)
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
        return null
    }
    return { path: inside.split(sep).join('/'), side: 'head' }
}
