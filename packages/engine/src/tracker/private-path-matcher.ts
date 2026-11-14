/**
 * Finding paths from this computer in a text: the one matcher that both
 * `redactPrivatePaths` (what Luca sends to GitHub) and the repo's lint
 * (`scripts/check-private-paths.ts`) use, so the two can't drift apart.
 *
 * An account name on its own is never matched, only as part of a path: the
 * owner's account name is also his public npm scope, so matching the bare
 * word would mangle package names.
 */

/** What a matched path is, and the token it becomes. */
export type PrivatePathKind =
    | 'home'
    | 'runs'
    | 'worktree'
    | 'tmp'
    | 'host'
    | 'outside'

/**
 * The tokens. Square brackets, as GitHub's markdown drops an unknown
 * `<tag>` such as `<home>` from the page.
 */
export const PRIVATE_PATH_TOKENS: Record<PrivatePathKind, string> = {
    home: '[home]',
    runs: '[runs]',
    worktree: '[worktree]',
    tmp: '[tmp]',
    host: '[host]',
    outside: '[outside]',
}

/** How a match was written, for the lint to judge. */
export type PrivatePathForm =
    | 'known'
    | 'state'
    | 'temp'
    | 'slug'
    | 'wsl'
    | 'windows'
    | 'volume'
    | 'unix'
    | 'tilde_name'
    | 'tilde'
    | 'env_home'
    | 'climb'
    | 'host'

/**
 * One private path: where it is in the text, what it is, the account name
 * in it (if any), the first folder after a home root (for `~/...`), and
 * what it becomes.
 */
export type PrivatePathMatch = {
    start: number
    end: number
    kind: PrivatePathKind
    form: PrivatePathForm
    name: string | null
    first: string | null
    replacement: string
}

/**
 * The folders this computer is known to use: the runs folder becomes
 * `[runs]`, a worktree or repo root `[worktree]`, a temp folder `[tmp]`,
 * the home folder `[home]`. All of them optional.
 */
export type KnownRoots = {
    home?: string
    runs_dir?: string
    worktree_roots?: string[]
    tmp_dirs?: string[]
}

type Tail = 'none' | 'keep' | 'collapse'

/**
 * One way a private path starts. `named`: the root ends where an account
 * name begins (the tail's first folder). `bare`: whether such a name with
 * nothing after it counts (`checked`: only when it is the known home, ends
 * in a separator, or is the whole of a quoted text).
 */
type Rule = {
    kind: PrivatePathKind
    form: PrivatePathForm
    pattern: RegExp
    tail: Tail
    named?: boolean
    bare?: 'always' | 'checked'
    name_group?: number
}

/** A separator in a pattern: `/`, `\/` (JSON), `%2F`, or `\` runs. */
const SEP = String.raw`(?:\\*/|%2F|\\+)`
const UNIX_SEP = String.raw`(?:\\*/|%2F)`

/** A home folder before a state folder, as a pattern. */
const HOME_PREFIX = String.raw`(?:~|\$HOME|\$\{HOME\}|${UNIX_SEP}(?:Users|home)${UNIX_SEP}([A-Za-z0-9_][\w.-]*))`

/** A web URL on a real host: left exactly as it is. */
const WEB_URL =
    /(?<![\w+.-])(?:https?|wss?|ftp|ssh|git):\/\/(?:[^\s/@]+@)?(?:localhost|[\w-]+(?:\.[\w-]+)+)(?::\d+)?[^\s<>"'`)\]]*/gi

const MAC_NAMES = String.raw`(?:MacBook(?:-Pro|-Air)?|iMac|Mac-mini|Mac-Studio|Mac-Pro)`

/** The rules for any computer, in the order they claim text. */
const GENERIC_RULES: Rule[] = [
    {
        kind: 'runs',
        form: 'state',
        pattern: new RegExp(
            `${HOME_PREFIX}${UNIX_SEP}\\.local${UNIX_SEP}state${UNIX_SEP}luca${UNIX_SEP}runs(?![\\w.-])`,
            'gi'
        ),
        tail: 'keep',
        name_group: 1,
    },
    {
        kind: 'worktree',
        form: 'state',
        pattern: new RegExp(
            `${HOME_PREFIX}${UNIX_SEP}\\.paseo${UNIX_SEP}worktrees${UNIX_SEP}[^\\s/\\\\]+${UNIX_SEP}[^\\s/\\\\]+`,
            'gi'
        ),
        tail: 'keep',
        name_group: 1,
    },
    {
        kind: 'tmp',
        form: 'temp',
        pattern:
            /(?<![\w.-])(?:\/private)?(?:\/var\/folders\/[^\s/]+\/[^\s/]+(?:\/[TCX](?![\w.-]))?|\/tmp(?![\w.-]))/gi,
        tail: 'keep',
    },
    {
        kind: 'home',
        form: 'slug',
        pattern:
            /(?<=^|[\s/\\'"`([{=:])-(?:Users|home)-([A-Za-z0-9_][\w.]*)(-[^\s/\\'"`<>]*)?/gi,
        tail: 'none',
        name_group: 1,
    },
    {
        kind: 'home',
        form: 'wsl',
        pattern: /\\\\+wsl(?:\$|\.localhost)\\+[^\\\s]+\\+home\\+/gi,
        tail: 'collapse',
        named: true,
        bare: 'always',
    },
    {
        kind: 'home',
        form: 'windows',
        pattern: new RegExp(
            `(?:\\b[A-Za-z]:|/mnt/[a-z])${SEP}Users${SEP}`,
            'gi'
        ),
        tail: 'collapse',
        named: true,
        bare: 'always',
    },
    {
        kind: 'home',
        form: 'volume',
        pattern: /(?<![\w.-])\/Volumes\//g,
        tail: 'collapse',
        named: true,
        bare: 'always',
    },
    {
        kind: 'home',
        form: 'unix',
        pattern: new RegExp(`${UNIX_SEP}(?:Users|home)${UNIX_SEP}`, 'gi'),
        tail: 'collapse',
        named: true,
        bare: 'checked',
    },
    {
        kind: 'home',
        form: 'tilde_name',
        pattern: /(?<![\w~])~([A-Za-z][\w.-]*)(?=\/)/g,
        tail: 'collapse',
        name_group: 1,
    },
    {
        kind: 'home',
        form: 'tilde',
        pattern: /(?<![\w~])~(?=\/[A-Za-z_])/g,
        tail: 'collapse',
    },
    {
        kind: 'home',
        form: 'env_home',
        pattern: /(?<![\w$])\$(?:HOME|\{HOME\})(?=\/[A-Za-z_])/g,
        tail: 'collapse',
    },
    {
        kind: 'outside',
        form: 'climb',
        pattern: /(?<![\w.])(?:\.\.[\\/]){4,}/g,
        tail: 'collapse',
    },
    {
        kind: 'host',
        form: 'host',
        pattern: new RegExp(
            `(?<![\\w.-])[A-Za-z0-9][\\w-]*-${MAC_NAMES}(?:-\\d+)?(?:\\.local)?(?![\\w.-])`,
            'gi'
        ),
        tail: 'none',
    },
    {
        kind: 'host',
        form: 'host',
        pattern: /(?<![\w.-])[A-Za-z0-9][\w-]*\.local(?![\w.-])/gi,
        tail: 'none',
    },
]

const escapeRegExp = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

/** Whether a root is an absolute path worth matching (not `/` alone). */
const isUsableRoot = (root: string): boolean =>
    /^\/[^/\\]/.test(root) || /^[A-Za-z]:[\\/]./.test(root)

/** A known root as a pattern, in its own separator style. */
const rootPattern = (root: string): string => {
    const windows = /^[A-Za-z]:/.test(root)
    const bare = root.replace(/^\/private(?=\/(?:var|tmp)\b)/, '')
    const body = bare
        .replace(/[\\/]+$/, '')
        .split(/[\\/]+/)
        .map(escapeRegExp)
        .join(windows ? String.raw`(?:\\+|/)` : UNIX_SEP)
    if (windows) return body
    const twin = /^\/(?:var|tmp)\b/.test(bare) ? '(?:/private)?' : ''
    return `(?<![A-Za-z]:)${twin}${body}`
}

/** One known root's rule. */
const knownRule = ({
    root,
    kind,
    tail,
}: {
    root: string
    kind: PrivatePathKind
    tail: Tail
}): Rule => ({
    kind,
    form: 'known',
    pattern: new RegExp(`${rootPattern(root)}(?![\\w.-])`, 'gi'),
    tail,
})

/**
 * The rules in claiming order: the known roots but the home, the longest
 * first; Luca's and Paseo's state folders and the temp folders; the known
 * home; then the rest of the forms any computer writes.
 */
const allRules = (known: KnownRoots): Rule[] => {
    const roots: { root: string; kind: PrivatePathKind }[] = [
        ...(known.runs_dir === undefined ? [] : [known.runs_dir]).map(
            (root): { root: string; kind: PrivatePathKind } => ({
                root,
                kind: 'runs',
            })
        ),
        ...(known.worktree_roots ?? []).map(
            (root): { root: string; kind: PrivatePathKind } => ({
                root,
                kind: 'worktree',
            })
        ),
        ...(known.tmp_dirs ?? []).map(
            (root): { root: string; kind: PrivatePathKind } => ({
                root,
                kind: 'tmp',
            })
        ),
    ]
    const others = roots
        .filter(({ root }) => isUsableRoot(root))
        .toSorted((a, b) => b.root.length - a.root.length)
        .map(({ root, kind }) => knownRule({ root, kind, tail: 'keep' }))
    const home =
        known.home !== undefined && isUsableRoot(known.home)
            ? [knownRule({ root: known.home, kind: 'home', tail: 'collapse' })]
            : []
    return [
        ...others,
        ...GENERIC_RULES.slice(0, 3),
        ...home,
        ...GENERIC_RULES.slice(3),
    ]
}

/** The separator at `at`, in the path's style, or null. */
const sepAt = ({
    text,
    at,
    windows,
}: {
    text: string
    at: number
    windows: boolean
}): string | null => {
    const rest = text.slice(at, at + 64)
    const found = (windows ? /^(?:\\+|\/)/ : /^(?:\\*\/|%2F)/i).exec(rest)
    return found?.[0] ?? null
}

const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

/** What may start a new path or option after a space: the path ends there. */
const NEXT_PATH = /^(?:\s|[/~$\-"'`]|[A-Za-z]:[\\/]|\.\.?[\\/]|%2F)/i

/**
 * Where a path that starts at `from` ends, and its separators. It runs
 * through spaces and parentheses, and stops at the end of the line, a
 * quote or backtick, a bracket closing one opened before the path, a
 * `:line`, a space before another path, or text already claimed.
 */
const scanPath = ({
    text,
    from,
    opener,
    windows,
    claimed,
}: {
    text: string
    from: number
    opener: string
    windows: boolean
    claimed: (at: number) => boolean
}): { stop: number; seps: { at: number; text: string }[] } => {
    const depth: Record<string, number> = { '(': 0, '[': 0, '{': 0 }
    const seps: { at: number; text: string }[] = []
    let at = from
    while (at < text.length && !claimed(at)) {
        const sep = sepAt({ text, at, windows })
        if (sep !== null) {
            seps.push({ at, text: sep })
            at += sep.length
            continue
        }
        const char = text.charAt(at)
        const next = text.slice(at + 1)
        if ('\n\r\t"`<>;|\\'.includes(char)) break
        if (char === "'" && opener === "'") break
        if (char in depth) depth[char] = (depth[char] ?? 0) + 1
        const open = CLOSERS[char]
        if (open !== undefined) {
            if ((depth[open] ?? 0) === 0) break
            depth[open] = (depth[open] ?? 0) - 1
        }
        if (char === ':' && (next === '' || /^[\d\s]/.test(next))) break
        if (char === ' ' && (next === '' || NEXT_PATH.test(next))) break
        at += 1
    }
    return { stop: at, seps }
}

/** A name or file name without the punctuation that ends a sentence. */
const trimName = (text: string): string =>
    (text.split(/\s/)[0] ?? '').replace(/[.,;:!?]+$/, '')

/**
 * The match of a `collapse` rule: the root, then at most the path's final
 * file name (`[home]/…/a.ts`). Null when a checked bare name doesn't count.
 */
const collapse = ({
    text,
    rule,
    start,
    root_end,
    name,
    known_home_name,
    claimed,
}: {
    text: string
    rule: Rule
    start: number
    root_end: number
    name: string | null
    known_home_name: string | null
    claimed: (at: number) => boolean
}): PrivatePathMatch | null => {
    const root = text.slice(start, root_end)
    const windows = !/\/|%2F/i.test(root) && /\\/.test(root)
    const opener = text.charAt(start - 1)
    const { stop, seps } = scanPath({
        text,
        from: root_end,
        opener,
        windows,
        claimed,
    })
    const starts = [root_end, ...seps.map((sep) => sep.at + sep.text.length)]
    const segments = starts.map((at, index) => ({
        at,
        text: text.slice(at, seps[index]?.at ?? stop),
    }))
    const token = PRIVATE_PATH_TOKENS[rule.kind]
    const [head, ...after] = segments
    const account = rule.named === true ? trimName(head?.text ?? '') : null
    if (rule.named === true && !/^[A-Za-z0-9_]/.test(account ?? '')) {
        return null
    }
    const rest = (rule.named === true ? after : segments).filter(
        ({ text: segment }) => segment.trim() !== ''
    )
    const sep = seps[0]?.text ?? (windows ? '\\' : '/')
    const base = {
        start,
        kind: rule.kind,
        form: rule.form,
        name: account ?? name,
    }
    const last = rest.at(-1)
    if (last === undefined) {
        const name_end = root_end + (account ?? '').length
        const trailing = seps[0]?.at === name_end
        const quoted =
            ['"', "'", '`'].includes(opener) && text.charAt(name_end) === opener
        const known =
            account !== null &&
            known_home_name !== null &&
            account.toLowerCase() === known_home_name.toLowerCase()
        if (rule.bare === 'checked' && !trailing && !quoted && !known) {
            return null
        }
        return {
            ...base,
            end: name_end,
            first: null,
            replacement: token,
        }
    }
    const file = trimName(last.text)
    return {
        ...base,
        end: last.at + file.length,
        first: trimName(rest[0]?.text ?? ''),
        replacement: `${token}${sep}${rest.length > 1 ? `…${sep}` : ''}${file}`,
    }
}

/**
 * Every private path in `text`, in order and never overlapping: the known
 * roots first (most specific first), then the forms any computer writes.
 * A path inside a web URL (`https://github.com/Users/x`) is left alone;
 * one inside any other URL (`vscode://file/Users/...`) is matched.
 *
 * @example
 * matchPrivatePaths({ text: 'at /Users/jdoe/app/a.ts' })
 * // [{ start: 3, end: 23, kind: 'home', form: 'unix', name: 'jdoe', first: 'app', replacement: '[home]/…/a.ts' }]
 */
export const matchPrivatePaths = ({
    text,
    known = {},
}: {
    text: string
    known?: KnownRoots
}): PrivatePathMatch[] => {
    const taken: [number, number][] = [...text.matchAll(WEB_URL)].map((url) => [
        url.index,
        url.index + url[0].length,
    ])
    const claimed = (at: number) =>
        taken.some(([start, end]) => at >= start && at < end)
    const overlaps = (start: number, end: number) =>
        taken.some(([from, to]) => start < to && end > from)
    const known_home_name =
        known.home
            ?.split(/[\\/]+/)
            .filter(Boolean)
            .at(-1) ?? null
    const rules = allRules(known)
    const matches: PrivatePathMatch[] = []
    for (const rule of rules) {
        for (const found of text.matchAll(rule.pattern)) {
            const start = found.index
            const root_end = start + found[0].length
            if (overlaps(start, root_end)) continue
            const name =
                rule.name_group === undefined
                    ? null
                    : (found[rule.name_group] ?? null)
            const match =
                rule.tail === 'collapse'
                    ? collapse({
                          text,
                          rule,
                          start,
                          root_end,
                          name,
                          known_home_name,
                          claimed,
                      })
                    : {
                          start,
                          end: root_end,
                          kind: rule.kind,
                          form: rule.form,
                          name,
                          first: null,
                          replacement: PRIVATE_PATH_TOKENS[rule.kind],
                      }
            if (match === null || overlaps(match.start, match.end)) continue
            if (rule.form === 'slug' && found[2] === undefined) {
                if (text.charAt(start - 1) !== '/') continue
            }
            taken.push([match.start, match.end])
            matches.push(match)
        }
    }
    return matches.toSorted((a, b) => a.start - b.start)
}
