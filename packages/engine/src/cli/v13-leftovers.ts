import {
    chmod,
    copyFile,
    cp,
    lstat,
    mkdir,
    readdir,
    rename,
    rm,
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import {
    ok,
    problem,
    reason,
    warning,
    type DoctorCheck,
    type Found,
} from './doctor-checks'

import {
    loadV13Manifest,
    type V13Manifest,
    type V13Setting,
} from '../doctor/v13-manifest'

/**
 * `luca doctor`'s third group: what old Luca v13 left behind, on this
 * computer and in the repo, and `--fix`'s cleanup of it.
 *
 * v13's files are matched by content (their sha256 in the v13 fingerprint
 * list), never by name: a same-named file with other content is the user's.
 * Its settings are matched as the list describes them, and only the ones it
 * marks `remove` are unwired. The cleanup never deletes: files move to a
 * dated backup folder, and each settings file is copied there before it's
 * edited. Nothing is moved while a setting still runs it.
 */

/** The guide for v13 users, linked whenever doctor finds v13 leftovers. */
export const MIGRATION_GUIDE_URL =
    'https://github.com/asibilia/luca-framework/blob/main/docs/migrating-to-v14.md'

/** v13's context-refresher state, in each repo. Not fingerprinted: it's runtime state. */
const CACHE_FILE = join('.claude', 'cache', 'context-refresher-state.json')

/** v13's stray payloads in `/tmp`. */
const PAYLOAD = /^luca-.+\.json$/

/** v13's global stage-gate hook: unwired before anything else. */
const GLOBAL_HOOK_ID = 'claude-stage-gate-hook'

/** How the settings v13 wrote are named in doctor's lines. */
const SETTING_LABELS: Record<string, string> = {
    [GLOBAL_HOOK_ID]: 'global `luca hook stage-gate` hook',
    'claude-status-line': 'status line',
    'antigravity-stage-gate-hook': '`luca-stage-gate` hook',
    'antigravity-muninn-mcp': '`muninn` MCP entry',
}

/** Where a leftover is: the home folder, the repo, or the temp folder. */
type Place = 'home' | 'repo' | 'tmp'

/** A file or folder v13 left, where it is and how doctor shows it. */
type Leftover = {
    place: Place
    /** Its absolute path. */
    path: string
    /** Its path relative to its place: kept in the backup. */
    relative: string
    /** How it's shown: `~/…` in the home folder, repo-relative in the repo. */
    shown: string
}

/** A settings file that still holds settings v13 wrote. */
type Wiring = Leftover & { settings: V13Setting[] }

/** Everything v13 left behind that doctor found. */
type V13Leftovers = {
    wiring: Wiring[]
    files: Leftover[]
    luca_dir: (Leftover & { has_data: boolean }) | null
    cache: Leftover | null
    gitignore: (Leftover & { start: number; end: number }) | null
    payloads: Leftover[]
}

/** Where doctor looks. */
type Where = { home: string; repo: string | null; tmp_dir: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** A leftover at a list location (`~/…` or `<repo>/…`); `null` outside a repo. */
const locate = ({
    location,
    home,
    repo,
}: {
    location: string
} & Pick<Where, 'home' | 'repo'>): Leftover | null => {
    if (location.startsWith('~/')) {
        const relative = location.slice('~/'.length)
        return {
            place: 'home',
            path: join(home, relative),
            relative,
            shown: location,
        }
    }
    if (repo === null) return null
    const relative = location.slice('<repo>/'.length)
    return {
        place: 'repo',
        path: join(repo, relative),
        relative,
        shown: relative,
    }
}

const exists = async (path: string) =>
    lstat(path).then(
        () => true,
        () => false
    )

const sha256Of = async (path: string): Promise<string> =>
    new Bun.CryptoHasher('sha256')
        .update(await Bun.file(path).arrayBuffer())
        .digest('hex')

/** A file system error's code, such as `ENOENT`, or `null` without one. */
const errorCode = (error: unknown): string | null =>
    error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : null

/** The value at `path` in parsed JSON, if every step is an object key. */
const valueAt = ({ json, path }: { json: unknown; path: string[] }): unknown =>
    path.reduce<unknown>(
        (node, key) => (isRecord(node) ? node[key] : undefined),
        json
    )

/** Whether a hook entry runs a command containing `text`. */
const runsCommand = (hook: unknown, text: string) =>
    isRecord(hook) &&
    typeof hook.command === 'string' &&
    hook.command.includes(text)

/** Whether `json` holds this v13 setting, as the list's `match` says. */
const holds = ({
    json,
    setting,
    home,
}: {
    json: unknown
    setting: V13Setting
    home: string
}): boolean => {
    const { match, path } = setting
    const node = valueAt({ json, path })
    if (match.kind === 'array_entry_hook_command_contains') {
        return (
            Array.isArray(node) &&
            node.some(
                (entry) =>
                    isRecord(entry) &&
                    Array.isArray(entry.hooks) &&
                    entry.hooks.some((hook) => runsCommand(hook, match.text))
            )
        )
    }
    if (match.kind === 'command_equals') {
        return (
            isRecord(node) &&
            typeof node.command === 'string' &&
            match.any_of
                .map((command) => command.replaceAll('{home}', home))
                .includes(node.command.trim())
        )
    }
    const parent = valueAt({ json, path: path.slice(0, -1) })
    return isRecord(parent) && Object.hasOwn(parent, path.at(-1) ?? '')
}

const isEmpty = (value: Record<string, unknown>) =>
    Object.keys(value).length === 0

/** Drops the key at `path`, then each parent object it leaves empty. */
const dropKey = ({ json, path }: { json: unknown; path: string[] }) => {
    for (let depth = path.length; depth > 0; depth -= 1) {
        const parent = valueAt({ json, path: path.slice(0, depth - 1) })
        const key = path[depth - 1]
        if (!isRecord(parent) || key === undefined) return
        const value = parent[key]
        if (depth < path.length && !(isRecord(value) && isEmpty(value))) return
        delete parent[key]
    }
}

/**
 * Takes this v13 setting out of `json`, in place: v13's hook commands out
 * of their entries (an entry left with none goes too), or the key. Parents
 * left empty go too. The user's own settings stay.
 */
const unwire = ({ json, setting }: { json: unknown; setting: V13Setting }) => {
    const { match, path } = setting
    if (match.kind !== 'array_entry_hook_command_contains') {
        dropKey({ json, path })
        return
    }
    const node = valueAt({ json, path })
    if (!Array.isArray(node)) return
    const kept = node.flatMap((entry: unknown) => {
        if (!isRecord(entry) || !Array.isArray(entry.hooks)) return [entry]
        const hooks = entry.hooks.filter(
            (hook) => !runsCommand(hook, match.text)
        )
        if (hooks.length === entry.hooks.length) return [entry]
        return hooks.length === 0 ? [] : [{ ...entry, hooks }]
    })
    const parent = valueAt({ json, path: path.slice(0, -1) })
    const key = path.at(-1)
    if (!isRecord(parent) || key === undefined) return
    if (kept.length > 0) parent[key] = kept
    else dropKey({ json, path })
}

/** A JSON file's parsed text, or `null` when it's missing or isn't JSON. */
const readJson = async (
    path: string
): Promise<{ text: string; json: unknown } | null> => {
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    const text = await file.text()
    try {
        return { text, json: JSON.parse(text) }
    } catch {
        return null
    }
}

/** The settings files that still hold settings v13 wrote, to `remove`. */
const findWiring = async ({
    manifest,
    home,
    repo,
}: {
    manifest: V13Manifest
} & Pick<Where, 'home' | 'repo'>): Promise<Wiring[]> => {
    const removable = manifest.settings.filter(
        ({ action }) => action === 'remove'
    )
    const found: Wiring[] = []
    for (const file of [...new Set(removable.map((setting) => setting.file))]) {
        const at = locate({ location: file, home, repo })
        if (at === null) continue
        const read = await readJson(at.path)
        if (read === null) continue
        const settings = removable.filter(
            (setting) =>
                setting.file === file &&
                holds({ json: read.json, setting, home })
        )
        if (settings.length > 0) found.push({ ...at, settings })
    }
    return found
}

/** v13's files, matched by content: a file whose sha256 is in the list. */
const findFiles = async ({
    manifest,
    home,
    repo,
}: {
    manifest: V13Manifest
} & Pick<Where, 'home' | 'repo'>): Promise<Leftover[]> => {
    const found: Leftover[] = []
    for (const { target, sha256 } of manifest.files) {
        const at = locate({ location: target, home, repo })
        if (at === null) continue
        const stats = await lstat(at.path).catch(() => null)
        if (stats === null || !stats.isFile()) continue
        if (sha256.includes(await sha256Of(at.path))) found.push(at)
    }
    return found
}

/** Whether `~/.luca/`'s MuninnDB data folder holds anything. */
const hasMuninnData = async (luca_dir: string): Promise<boolean> => {
    try {
        return (await readdir(join(luca_dir, 'muninndb-data'))).length > 0
    } catch (error) {
        // Missing means no data; anything else, keep it to be safe.
        return errorCode(error) !== 'ENOENT'
    }
}

const findLucaDir = async ({
    home,
}: Pick<Where, 'home'>): Promise<V13Leftovers['luca_dir']> => {
    const path = join(home, '.luca')
    const stats = await lstat(path).catch(() => null)
    if (stats === null || !stats.isDirectory()) return null
    return {
        place: 'home',
        path,
        relative: '.luca',
        shown: '~/.luca/',
        has_data: await hasMuninnData(path),
    }
}

const findCache = async ({
    repo,
}: Pick<Where, 'repo'>): Promise<Leftover | null> => {
    if (repo === null) return null
    const path = join(repo, CACHE_FILE)
    return (await exists(path))
        ? { place: 'repo', path, relative: CACHE_FILE, shown: CACHE_FILE }
        : null
}

/** v13's full managed block in the repo's `.gitignore`, by its lines. */
const findGitignore = async ({
    manifest,
    home,
    repo,
}: {
    manifest: V13Manifest
} & Pick<Where, 'home' | 'repo'>): Promise<V13Leftovers['gitignore']> => {
    const { file, start_marker, variants } = manifest.gitignore_block
    const at = locate({ location: file, home, repo })
    if (at === null || !(await Bun.file(at.path).exists())) return null
    const lines = (await Bun.file(at.path).text()).split('\n')
    for (let start = 0; start < lines.length; start += 1) {
        if (lines[start]?.trim() !== start_marker) continue
        for (const { header, entries } of variants) {
            const block = [...header, ...entries]
            if (
                block.every(
                    (line, index) => lines[start + index]?.trim() === line
                )
            ) {
                return { ...at, start, end: start + block.length }
            }
        }
    }
    return null
}

const findPayloads = async ({
    tmp_dir,
}: Pick<Where, 'tmp_dir'>): Promise<Leftover[]> => {
    const entries = await readdir(tmp_dir, { withFileTypes: true }).catch(
        () => []
    )
    return entries
        .filter((entry) => entry.isFile() && PAYLOAD.test(entry.name))
        .map(({ name }) => ({
            place: 'tmp',
            path: join(tmp_dir, name),
            relative: name,
            shown: join(tmp_dir, name),
        }))
}

const findV13 = async ({
    manifest,
    home,
    repo,
    tmp_dir,
}: { manifest: V13Manifest } & Where): Promise<V13Leftovers> => ({
    wiring: await findWiring({ manifest, home, repo }),
    files: await findFiles({ manifest, home, repo }),
    luca_dir: await findLucaDir({ home }),
    cache: await findCache({ repo }),
    gitignore: await findGitignore({ manifest, home, repo }),
    payloads: await findPayloads({ tmp_dir }),
})

const labelOf = (setting: V13Setting): string => {
    const label = SETTING_LABELS[setting.id]
    if (label !== undefined) return label
    return setting.match.kind === 'array_entry_hook_command_contains'
        ? `\`${basename(setting.match.text)}\` hook`
        : `\`${setting.path.join('.')}\` entry`
}

const listed = (leftovers: Leftover[]) =>
    leftovers.map(({ shown }) => shown).join(', ')

const FIX = 'Run luca doctor --fix'
const BACKUP = '~/.local/state/luca/v13-backup/'

/** The checks for what `findV13` found; one OK check when it found nothing. */
const checksOf = (found: V13Leftovers): DoctorCheck[] => {
    const checks: [name: string, found: Found][] = []
    for (const wiring of found.wiring) {
        checks.push([
            `wiring ${wiring.shown}`,
            problem({
                detail: `${wiring.shown} still has v13's ${wiring.settings.map(labelOf).join(', ')}.`,
                fix: `${FIX} to remove them; your own settings stay${wiring.place === 'repo' ? '. Then commit the file' : ''}.`,
            }),
        ])
    }
    for (const place of ['home', 'repo'] as const) {
        const files = found.files.filter((file) => file.place === place)
        if (files.length === 0) continue
        checks.push([
            `${place}_files`,
            problem({
                detail: `v13's files are still in ${place === 'home' ? 'the home folder' : 'the repo'}: ${listed(files)}.`,
                fix: `${FIX} to move them to ${BACKUP}${place === 'repo' ? '. Then commit the change' : ''}.`,
            }),
        ])
    }
    if (found.cache !== null) {
        checks.push([
            'repo_cache',
            problem({
                detail: `v13's hook cache is still in the repo: ${found.cache.shown}.`,
                fix: `${FIX} to move it to ${BACKUP}.`,
            }),
        ])
    }
    if (found.gitignore !== null) {
        checks.push([
            'gitignore',
            problem({
                detail: `${found.gitignore.shown} still has v13's managed block of .luca/ entries.`,
                fix: `${FIX} to remove it, then commit ${found.gitignore.shown}.`,
            }),
        ])
    }
    if (found.luca_dir !== null) {
        checks.push([
            'luca_dir',
            found.luca_dir.has_data
                ? warning({
                      detail: "~/.luca/ (v13's own MuninnDB) is still there, and its data folder ~/.luca/muninndb-data isn't empty.",
                      fix: 'luca doctor --fix keeps it. Once you no longer need the memories in it, stop that MuninnDB and move ~/.luca/ away yourself.',
                  })
                : problem({
                      detail: "~/.luca/ (v13's own MuninnDB) is still there.",
                      fix: `Its MuninnDB data folder is empty: ${FIX} to move it to ${BACKUP}.`,
                  }),
        ])
    }
    if (found.payloads.length > 0) {
        checks.push([
            'tmp_payloads',
            problem({
                detail: `v13's payloads are still in the temp folder: ${listed(found.payloads)}.`,
                fix: `${FIX} to move them to ${BACKUP}.`,
            }),
        ])
    }
    if (checks.length === 0) {
        checks.push(['leftovers', ok('No old Luca v13 leftovers')])
    }
    return checks.map(([name, result]) => ({ group: 'v13', name, ...result }))
}

/**
 * Doctor's v13 group: what old Luca v13 left behind on this computer (the
 * global stage-gate hook, the status line, its skills, agents, and commands,
 * `~/.luca/`, Antigravity's copies, `/tmp` payloads) and in `repo` when
 * given (its hook scripts and their wiring, its cache, its `.gitignore`
 * block). One OK check when there's none. Read-only. `manifest` defaults
 * to the committed v13 fingerprint list.
 *
 * @example
 * const checks = await v13Checks({ home: homedir(), repo: null, tmp_dir: '/tmp' })
 */
export const v13Checks = async ({
    manifest: given,
    home,
    repo,
    tmp_dir,
}: { manifest?: V13Manifest } & Where): Promise<DoctorCheck[]> => {
    try {
        const manifest = given ?? (await loadV13Manifest())
        return checksOf(await findV13({ manifest, home, repo, tmp_dir }))
    } catch (error) {
        return [
            {
                group: 'v13',
                name: 'leftovers',
                ...problem({
                    detail: `The v13 leftovers check failed: ${reason(error)}`,
                    fix: 'Fix what the error says, then run luca doctor again.',
                }),
            },
        ]
    }
}

/** Whether a found check is a v13 leftover. Pure. */
export const hasV13Leftovers = ({ checks }: { checks: DoctorCheck[] }) =>
    checks.some(({ group, status }) => group === 'v13' && status !== 'ok')

/** The dated backup folder for this cleanup: `YYYY-MM-DD-HHMMSS`. */
const backupDir = ({ home, now }: { home: string; now: Date }) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    return join(home, '.local', 'state', 'luca', 'v13-backup', stamp)
}

/** Where a leftover goes in the backup, keeping its path. */
const backupPath = ({
    backup,
    leftover,
    repo,
}: {
    backup: string
    leftover: Leftover
    repo: string | null
}) =>
    leftover.place === 'repo'
        ? join(backup, 'repos', basename(repo ?? 'repo'), leftover.relative)
        : join(backup, leftover.place, leftover.relative)

/** Moves a file or folder, never over one that's there. */
const move = async ({ from, to }: { from: string; to: string }) => {
    if (await exists(to)) throw new Error(`${to} is already there`)
    await mkdir(dirname(to), { recursive: true })
    try {
        await rename(from, to)
    } catch (error) {
        if (errorCode(error) !== 'EXDEV') throw error
        // Another disk: copy it all, then take the original away.
        await cp(from, to, {
            recursive: true,
            errorOnExist: true,
            force: false,
        })
        await rm(from, { recursive: true })
    }
}

/** Whether a v13 setting runs this file, such as a hook script. */
const runsFile = ({
    setting,
    file,
}: {
    setting: V13Setting
    file: Leftover
}) => {
    const tail = `/${file.relative}`
    const { match } = setting
    if (match.kind === 'array_entry_hook_command_contains') {
        return tail.endsWith(match.text)
    }
    return (
        match.kind === 'command_equals' &&
        match.any_of.some((command) => command.includes(tail))
    )
}

/**
 * `luca doctor --fix` for v13's leftovers, in this order: it unwires v13's
 * settings (the global stage-gate hook first), copying each settings file to
 * the backup before editing it; then moves v13's files to the dated backup
 * under `~/.local/state/luca/v13-backup/`, keeping their paths, but never a
 * file a setting still runs; removes the `.gitignore` block; moves
 * `~/.luca/` only when its MuninnDB data folder is empty; and moves the
 * `/tmp` payloads. It never deletes and never commits. A step that fails is
 * logged, and the checks after say what's left. `manifest` defaults to the
 * committed v13 fingerprint list.
 *
 * @example
 * await fixV13({ home: homedir(), repo: process.cwd(), tmp_dir: '/tmp', log: console.log })
 */
export const fixV13 = async ({
    manifest: given,
    home,
    repo,
    tmp_dir,
    log,
    now = new Date(),
}: {
    manifest?: V13Manifest
    log: (line: string) => void
    now?: Date
} & Where): Promise<void> => {
    const prefix = '[luca doctor]'
    const backup = backupDir({ home, now })
    const shown_backup = backup.startsWith(`${home}/`)
        ? `~/${backup.slice(home.length + 1)}`
        : backup
    const failed = ({ what, error }: { what: string; error: unknown }) => {
        log(`${prefix} v13: couldn't ${what}: ${reason(error)}`)
    }
    let manifest: V13Manifest
    let found: V13Leftovers
    try {
        manifest = given ?? (await loadV13Manifest())
        found = await findV13({ manifest, home, repo, tmp_dir })
    } catch (error) {
        failed({ what: 'look for leftovers', error })
        return
    }
    const moved: string[] = []
    const moveOne = async (leftover: Leftover) => {
        try {
            await move({
                from: leftover.path,
                to: backupPath({ backup, leftover, repo }),
            })
            moved.push(leftover.shown)
        } catch (error) {
            failed({ what: `move ${leftover.shown}`, error })
        }
    }

    // The wiring first, the global hook's file before the others.
    const global_hook = (file: Wiring) =>
        Number(file.settings.some(({ id }) => id === GLOBAL_HOOK_ID))
    const wiring = found.wiring.toSorted(
        (a, b) => global_hook(b) - global_hook(a)
    )
    for (const file of wiring) {
        try {
            const read = await readJson(file.path)
            if (read === null) continue
            const copy = backupPath({ backup, leftover: file, repo })
            await mkdir(dirname(copy), { recursive: true })
            // The copy may hold the MuninnDB token: only the user reads it.
            if (!(await exists(copy))) await copyFile(file.path, copy)
            await chmod(copy, 0o600)
            for (const setting of file.settings) {
                unwire({ json: read.json, setting })
            }
            const indent = /^\{\r?\n([ \t]+)/.exec(read.text)?.[1] ?? 2
            await Bun.write(
                file.path,
                `${JSON.stringify(read.json, null, indent)}${read.text.endsWith('\n') ? '\n' : ''}`
            )
            log(
                `${prefix} v13: removed its ${file.settings.map(labelOf).join(', ')} from ${file.shown}`
            )
        } catch (error) {
            failed({ what: `edit ${file.shown}`, error })
        }
    }

    // Then the files, but none a setting still runs.
    const still_wired = (await findWiring({ manifest, home, repo })).flatMap(
        ({ settings }) => settings
    )
    for (const file of found.files) {
        if (still_wired.some((setting) => runsFile({ setting, file }))) {
            log(`${prefix} v13: kept ${file.shown}, as a setting still runs it`)
            continue
        }
        await moveOne(file)
    }
    if (found.cache !== null) await moveOne(found.cache)

    if (found.gitignore !== null) {
        const { path, shown, start, end } = found.gitignore
        try {
            const lines = (await Bun.file(path).text()).split('\n')
            // v13 put one blank line before its block.
            const from =
                start > 0 && lines[start - 1]?.trim() === '' ? start - 1 : start
            lines.splice(from, end - from)
            await Bun.write(path, lines.join('\n'))
            log(`${prefix} v13: removed its managed block from ${shown}`)
        } catch (error) {
            failed({ what: `edit ${shown}`, error })
        }
    }

    if (found.luca_dir !== null) {
        if (found.luca_dir.has_data) {
            log(
                `${prefix} v13: kept ~/.luca/, as its MuninnDB data folder isn't empty`
            )
        } else {
            await moveOne(found.luca_dir)
        }
    }
    for (const payload of found.payloads) await moveOne(payload)

    if (moved.length > 0) {
        log(
            `${prefix} v13: moved ${moved.length} of its files to ${shown_backup} (nothing was deleted): ${moved.join(', ')}`
        )
    }
}
