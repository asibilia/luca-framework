/**
 * Taking paths from this computer out of text Luca sends to GitHub. A
 * comment, a PR, or a story must never show where the owner keeps things:
 * their home folder (it names their account), the folders under it, or the
 * computer's temp folders. Every one of them becomes a neutral token.
 */
import { homedir, tmpdir } from 'node:os'

/**
 * The folders this computer is known to use, each turned into its token:
 * the runs folder `<runs>`, a worktree or repo root `<worktree>`, a temp
 * folder `<tmp>`, and the home folder `<home>`. All of them optional.
 */
export type KnownRoots = {
    home?: string
    runs_dir?: string
    worktree_roots?: string[]
    tmp_dirs?: string[]
}

/** What a text becomes when even the simplest redaction failed. */
export const REDACTION_FAILED_TEXT =
    '(Luca left this text out: it could not check it for paths from this computer.)'

/** One character of a path's folder or file name. */
const SEG = String.raw`[^\s'"\x60<>()\[\]{},;|*?\\/]`

/** A path separator: `/`, or one or more `\` (two in JSON text). */
const SEP = String.raw`(?:\\+|/)`

/** The rest of a path after a root: separators and names. */
const TAIL = `((?:${SEP}${SEG}*)*)`

/**
 * What a path's start must follow: not a name character (so `src/home/x`
 * and `github.com/Users/x` are left alone), unless it is an escape such as
 * `\n`, or a `file://` URL.
 */
const BEFORE = String.raw`(?:(?<=^|[^\w.~%+\-/\\])|(?<=\\[nrt])|(?<=file://))`

/** A web URL (not `file://`): left exactly as it is. */
const URL_PATTERN = /\b(?!file:)[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`)\]]*/gi

const escapeRegExp = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

/** Whether a root is an absolute path worth redacting (not `/` alone). */
const isUsableRoot = (root: string): boolean =>
    /^\/[^/\\]/.test(root) || /^[A-Za-z]:[\\/]./.test(root)

/**
 * A root as a pattern: any separator style, and on a Mac its `/private`
 * twin (`/var/...` is really `/private/var/...`).
 */
const rootPattern = (root: string): string => {
    const bare = root.replace(/^\/private(?=\/(?:var|tmp)\b)/, '')
    const parts = bare
        .replace(/[\\/]+$/, '')
        .split(/[\\/]+/)
        .map(escapeRegExp)
    const body = parts.join(SEP)
    return /^\/(?:var|tmp)\b/.test(bare) ? `(?:/private)?${body}` : body
}

/**
 * The tail after a home folder, cut to its last name: `/Github/app/a.ts`
 * becomes `/…/a.ts`, keeping the tail's own separator.
 */
const lastNameOnly = (tail: string): string => {
    const names = tail.split(/\\+|\//).filter((name) => name !== '')
    const last = names.at(-1)
    if (last === undefined) return ''
    const sep = /\\+|\//.exec(tail)?.[0] ?? '/'
    return names.length === 1 ? `${sep}${last}` : `${sep}…${sep}${last}`
}

type Rule = { pattern: RegExp; token: string; keep_tail: boolean }

const rule = ({
    root,
    token,
    keep_tail,
}: {
    root: string
    token: string
    keep_tail: boolean
}): Rule => ({
    pattern: new RegExp(`${BEFORE}${root}(?!${SEG})${TAIL}`, 'g'),
    token,
    keep_tail,
})

/** The patterns for any computer, after its known roots. */
const GENERIC_RULES: Rule[] = [
    rule({
        root: String.raw`(?:/private)?/var/folders/${SEG}+/${SEG}+(?:/[TCX](?!${SEG}))?`,
        token: '<tmp>',
        keep_tail: true,
    }),
    rule({
        root: `[A-Za-z]:${SEP}Users${SEP}${SEG}+`,
        token: '<home>',
        keep_tail: false,
    }),
    rule({
        root: `/(?:Users|home)/${SEG}+`,
        token: '<home>',
        keep_tail: false,
    }),
    // `~/Github/...` names a folder layout; `~/.claude.json` is a tool's.
    rule({
        root: String.raw`~(?=${SEP}[^.\s/\\])`,
        token: '<home>',
        keep_tail: false,
    }),
]

const knownRules = (known: KnownRoots): Rule[] => {
    const roots = [
        ...(known.runs_dir === undefined
            ? []
            : [{ root: known.runs_dir, token: '<runs>' }]),
        ...(known.worktree_roots ?? []).map((root) => ({
            root,
            token: '<worktree>',
        })),
        ...(known.tmp_dirs ?? []).map((root) => ({ root, token: '<tmp>' })),
        ...(known.home === undefined
            ? []
            : [{ root: known.home, token: '<home>' }]),
    ].filter(({ root }) => isUsableRoot(root))
    // The longest root first, so a folder inside another gets its own token.
    return roots
        .toSorted((a, b) => b.root.length - a.root.length)
        .map(({ root, token }) =>
            rule({
                root: rootPattern(root),
                token,
                keep_tail: token !== '<home>',
            })
        )
}

/** Applies the rules to the text between its URLs. */
const applyRules = ({
    text,
    rules,
}: {
    text: string
    rules: Rule[]
}): string => {
    const redact = (piece: string): string =>
        rules.reduce(
            (done, { pattern, token, keep_tail }) =>
                done.replace(
                    pattern,
                    (_match, tail: string) =>
                        `${token}${keep_tail ? tail : lastNameOnly(tail)}`
                ),
            piece
        )
    const urls = text.match(URL_PATTERN) ?? []
    const between = text.split(URL_PATTERN)
    return between
        .map((piece, at) => `${redact(piece)}${urls[at] ?? ''}`)
        .join('')
}

/**
 * Takes every path from this computer out of `text`, for anything Luca
 * sends to GitHub. Pure, idempotent (`f(f(x)) === f(x)`), and it never
 * throws.
 *
 * In order: the `known` roots, the most specific first (the runs folder
 * becomes `<runs>`, a worktree or repo root `<worktree>`, a temp folder
 * `<tmp>`, each keeping the path after it), then the home folder `<home>`.
 * Then the same for any computer: `/Users/<name>`, `/home/<name>`,
 * `C:\Users\<name>` (and `C:/Users/<name>`) become `<home>`, and
 * `/var/folders/...` (and its `/private` twin) `<tmp>`. A home-relative
 * path (`~/Github/...`) becomes `<home>` too; `~/.claude.json` and other
 * dotfiles stay. After a home folder, only the path's last name is kept,
 * as the folders between show how the owner lays things out.
 *
 * URLs (`https://github.com/Users/x`), names inside a path
 * (`src/home/page.tsx`), and markers (`<!-- luca:... -->`) are untouched.
 * On an error, the generic patterns alone are tried, then a plain replace,
 * then `REDACTION_FAILED_TEXT`.
 *
 * @param text - The text to send.
 * @param known - This computer's folders; see `localRoots`.
 * @returns The text with no path from this computer in it.
 *
 * @example
 * redactPrivatePaths({
 *     text: 'at /Users/me/.local/state/luca/runs/r1/tickets/11/src/a.ts',
 *     known: { home: '/Users/me', runs_dir: '/Users/me/.local/state/luca/runs' },
 * })
 * // 'at <runs>/r1/tickets/11/src/a.ts'
 *
 * @example
 * redactPrivatePaths({ text: 'ENOENT /home/me/work/repo/a.ts' })
 * // 'ENOENT <home>/…/a.ts'
 */
export const redactPrivatePaths = ({
    text,
    known = {},
}: {
    text: string
    known?: KnownRoots
}): string => {
    try {
        return applyRules({
            text,
            rules: [...knownRules(known), ...GENERIC_RULES],
        })
    } catch {
        try {
            return applyRules({ text, rules: GENERIC_RULES })
        } catch {
            try {
                return text.replace(
                    /(?:[A-Za-z]:[\\/]+Users|\/Users|\/home)[\\/]+[^\s\\/]+/g,
                    '<home>'
                )
            } catch {
                return REDACTION_FAILED_TEXT
            }
        }
    }
}

/**
 * This computer's known roots: its home folder and temp folder, plus the
 * runs folder and any worktree or repo roots the caller knows.
 *
 * @example
 * const known = localRoots({ runs_dir: defaultRunsDir(), worktree_roots: [repo] })
 * redactPrivatePaths({ text: body, known })
 */
export const localRoots = ({
    runs_dir,
    worktree_roots = [],
}: {
    runs_dir?: string
    worktree_roots?: string[]
} = {}): KnownRoots => ({
    home: homedir(),
    tmp_dirs: [tmpdir()],
    worktree_roots,
    ...(runs_dir === undefined ? {} : { runs_dir }),
})
