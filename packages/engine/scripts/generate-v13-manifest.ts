/**
 * Builds `packages/engine/src/doctor/v13-files.json`: the fingerprints of
 * every file old Luca v13 installs, plus the settings and `.gitignore` block
 * it writes, so `luca doctor` can find v13 leftovers by content with no
 * network and no git.
 *
 * ```bash
 * # Regenerate the data file (needs npm and the network):
 * bun packages/engine/scripts/generate-v13-manifest.ts
 *
 * # Check this computer against the committed file. Read-only: it hashes
 * # and reads, and never writes, moves or deletes anything.
 * bun packages/engine/scripts/generate-v13-manifest.ts --verify \
 *     --repo ~/Github/movie-rankings --repo ~/Github/ramora
 *
 * # Point the ~/.claude/ half of the check at another folder, such as a
 * # backup of an old ~/.claude/:
 * bun packages/engine/scripts/generate-v13-manifest.ts --verify \
 *     --claude-home ~/.claude-old-luca-backup-2026-09-22
 * ```
 *
 * How it works: it lists every published 13.x version of `@alecsibilia/luca`
 * (alphas too), downloads each with `npm pack` into a temp folder, and reads
 * that version's own install code (`dist/**.mjs`) to learn what it installs
 * and where. Each feature is found by markers, literal strings from v13's
 * install code (see `old-luca-final:packages/luca-cli/src/init/helpers/`).
 * The first marker says whether a version has the feature; a version that has
 * it but lacks any other marker stops the run, because its install code
 * changed shape and this generator needs a look.
 *
 * The transform rule: every v13 version copies skills, agents, commands, hook
 * scripts and the status line script with `copyFile`, byte for byte, with no
 * templating or path substitution. So a file's fingerprint is the sha256 of
 * the file as shipped in the tarball. The generator checks this in each
 * version's copy functions and stops if one ever edits content. The only
 * values v13 fills in are inside settings (the home folder in the status line
 * command, the MuninnDB token), which the manifest records as `{home}` and
 * `{muninn_token}`.
 */
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { $ } from 'bun'

import filter from 'lodash/filter'
import find from 'lodash/find'
import flatMap from 'lodash/flatMap'
import get from 'lodash/get'
import groupBy from 'lodash/groupBy'
import includes from 'lodash/includes'
import indexOf from 'lodash/indexOf'
import isEqual from 'lodash/isEqual'
import kebabCase from 'lodash/kebabCase'
import last from 'lodash/last'
import map from 'lodash/map'
import mapValues from 'lodash/mapValues'
import maxBy from 'lodash/maxBy'
import some from 'lodash/some'
import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'
import uniqWith from 'lodash/uniqWith'
import { z } from 'zod'

import {
    V13_MANIFEST_PATH,
    V13ManifestSchema,
    loadV13Manifest,
    type V13File,
    type V13Manifest,
    type V13Setting,
} from '../src/doctor/v13-manifest'

const PACKAGE_NAME = '@alecsibilia/luca'
const CLAUDE_HOME = '~/.claude'
const AGY_HOME = '~/.gemini/antigravity-cli'
const REPO = '<repo>'
const MUNINN_MCP_URL = 'http://127.0.0.1:8750/mcp'
const HOME_PLACEHOLDER = '{home}'
const TOKEN_VALUE = 'Bearer {muninn_token}'

type Json = z.infer<ReturnType<typeof z.json>>

/** A literal string, or a pattern, from v13's install code. */
type Marker = string | RegExp

/** A setting v13 writes, and the markers that show a version writes it. */
type SettingSpec = Omit<V13Setting, 'versions'> & { markers: Marker[] }

/** The `.gitignore` header lines and entries one version writes. */
type GitignoreBlock = { header: string[]; entries: string[] }

/** What one version installs. */
type VersionInstall = {
    version: string
    files: { target: string; sha256: string }[]
    settings: { spec: SettingSpec }[]
    gitignore: GitignoreBlock | null
}

// ─── Markers ────────────────────────────────────────────────────────────────

/** Skills, agents and commands copied into `~/.claude/`. */
const CLAUDE_ARTIFACT_MARKERS: Marker[] = [
    'async function installSkills(',
    'return join(homedir(), ".claude");',
]

/** Skills and agents (not commands) copied into Antigravity's home. */
const AGY_ARTIFACT_MARKERS: Marker[] = [
    'return join(homedir(), ".gemini", "antigravity-cli");',
    'installArtifacts: { agents: true, commands: false, skills: true }',
]

/** Hook scripts copied into `<repo>/.claude/hooks/`, wired in its settings. */
const REPO_HOOK_MARKERS: Marker[] = [
    'async function installHooks(',
    /join(\$\d+)?\(opts\.cwd, "\.claude", "hooks"\)/,
]

/** The status line script (`~/.claude/luca-statusline.ts`) and its setting. */
const STATUSLINE_MARKERS: Marker[] = [
    'async function installStatusline(',
    'STATUSLINE_SCRIPT_NAME = "luca-statusline.ts"',
    'const command = `bun "${scriptPath}"`',
    'padding: 0',
]

/** The managed `.gitignore` block. */
const GITIGNORE_MARKERS: Marker[] = [
    'async function ensureLucaGitignore(',
    'const LUCA_GITIGNORE_ENTRIES = [',
    'const header = "',
]

/** The copy functions for skills, agents and commands. */
const ARTIFACT_COPY_FUNCTIONS = ['copyDir', 'copySkillTree']

// ─── Settings v13 writes ────────────────────────────────────────────────────

const STATIC_SETTINGS: SettingSpec[] = [
    {
        id: 'claude-stage-gate-hook',
        file: `${CLAUDE_HOME}/settings.json`,
        path: ['hooks', 'PreToolUse'],
        match: {
            kind: 'array_entry_hook_command_contains',
            text: 'stage-gate',
        },
        values: [
            {
                matcher: 'Edit|Write|NotebookEdit|Bash',
                hooks: [
                    {
                        type: 'command',
                        command: 'luca hook stage-gate',
                        timeout: 30,
                    },
                ],
            },
        ],
        action: 'remove',
        note: "The global stage-gate hook, run before every Edit, Write, NotebookEdit and Bash call in every repo. Unwire it first: while v13 is installed it blocks agent writes under ~/.claude/, ~/.luca/ and .git/, and after an upgrade it runs v14's `luca`. Remove the matching entry, then drop `hooks.PreToolUse` and `hooks` if they end up empty. v13 skipped adding it when any PreToolUse command already contained `stage-gate`, and its own doctor used the same test.",
        markers: [
            'STAGE_GATE_COMMAND = "luca hook stage-gate"',
            /STAGE_GATE_MATCHER = "Edit\|Write\|NotebookEdit\|Bash"/,
            'timeout: 30',
        ],
    },
    {
        id: 'claude-status-line',
        file: `${CLAUDE_HOME}/settings.json`,
        path: ['statusLine'],
        match: {
            kind: 'command_equals',
            any_of: [
                `bun "${HOME_PLACEHOLDER}/.claude/luca-statusline.ts"`,
                `bun ${HOME_PLACEHOLDER}/.claude/luca-statusline.ts`,
            ],
        },
        values: [
            {
                type: 'command',
                command: `bun "${HOME_PLACEHOLDER}/.claude/luca-statusline.ts"`,
                padding: 0,
            },
        ],
        action: 'remove',
        note: "Written only when settings.json had no statusLine. v13 counted only these exact commands as its own; a command that wraps the script is the user's, so leave it. Unwire it before moving ~/.claude/luca-statusline.ts.",
        markers: STATUSLINE_MARKERS,
    },
    {
        id: 'antigravity-stage-gate-hook',
        file: `${AGY_HOME}/hooks.json`,
        path: ['luca-stage-gate'],
        match: { kind: 'key_present' },
        values: [
            {
                enabled: true,
                PreToolUse: [
                    {
                        matcher:
                            'replace|write_file|run_shell_command|run_command',
                        hooks: [
                            {
                                type: 'command',
                                command: 'luca hook stage-gate',
                                timeout: 30,
                            },
                        ],
                    },
                ],
            },
        ],
        action: 'remove',
        note: "Antigravity's copy of the stage-gate hook; it runs `luca` too. Written only if ~/.gemini/antigravity-cli/ already existed.",
        markers: [
            'async function wireAntigravityHooks(',
            '"luca-stage-gate"',
            'AGY_STAGE_GATE_MATCHER = "replace|write_file|run_shell_command|run_command"',
        ],
    },
    {
        id: 'antigravity-muninn-mcp',
        file: `${AGY_HOME}/mcp_config.json`,
        path: ['mcpServers', 'muninn'],
        match: { kind: 'key_present' },
        values: [
            {
                serverUrl: MUNINN_MCP_URL,
                headers: { Authorization: TOKEN_VALUE },
                enabledTools: ['*'],
            },
        ],
        action: 'remove',
        note: "Written only when ~/.muninn/mcp.token existed and ~/.gemini/antigravity-cli/ already existed. v13 left an entry alone when it already had this serverUrl, the token and '*' in enabledTools, and otherwise merged into it (kept its other fields and headers, dropped `url`). So the entry may predate v13 or carry extra enabledTools; match on the key, not the exact value. The file holds the literal token: back it up with mode 0600 and never print it.",
        markers: [
            'async function wireAntigravityMcp(',
            'mcp_config.json',
            `MUNINN_MCP_SERVER_URL = "${MUNINN_MCP_URL}"`,
            'enabledTools: ["*"]',
        ],
    },
    {
        id: 'claude-muninn-mcp',
        file: '~/.claude.json',
        path: ['mcpServers', 'muninn'],
        match: { kind: 'key_present' },
        values: [
            {
                type: 'sse',
                url: MUNINN_MCP_URL,
                headers: { Authorization: TOKEN_VALUE },
            },
        ],
        action: 'keep',
        note: 'Not a leftover: v14 reads this entry to reach MuninnDB, and doctor checks it (and re-adds it at user scope) under its MuninnDB check (#450). Listed so the v13-leftovers check never removes it. Written only when ~/.muninn/mcp.token existed. It holds the literal token; never print it.',
        markers: [
            'async function wireClaudeMcp(',
            `MUNINN_MCP_SERVER_URL = "${MUNINN_MCP_URL}"`,
            'type: "sse"',
        ],
    },
    {
        id: 'repo-langsmith-trace-metadata',
        file: `${REPO}/.claude/settings.local.json`,
        path: ['env', 'CC_LANGSMITH_METADATA'],
        match: { kind: 'key_present' },
        values: [
            JSON.stringify({
                environment: 'production',
                ls_message_format: 'anthropic',
                repo: '{repo_name}',
                luca_version: '{luca_version}',
            }),
        ],
        action: 'keep',
        note: 'A JSON string. Written only when LangSmith tracing was on (env.TRACE_TO_LANGSMITH is "true"). v13 owns only its `repo` and `luca_version` keys; `environment` and `ls_message_format` were filled only when missing, and any other key is the user\'s. Harmless to v14: report it, don\'t remove it.',
        markers: [
            'async function enrichTraceMetadata(',
            'CC_LANGSMITH_METADATA',
            'settings.local.json',
        ],
    },
]

const NOTES = [
    'Generated by packages/engine/scripts/generate-v13-manifest.ts from every published 13.x tarball of @alecsibilia/luca. Do not edit by hand; regenerate with: bun packages/engine/scripts/generate-v13-manifest.ts',
    "`~/` is the user's home folder. `<repo>/` is the root of a repo where v13's `luca init` ran.",
    'v13 copies every file byte for byte (copyFile, no templating), so `sha256` is the hash of the file as shipped and as found on disk. Match leftovers by sha256, never by name alone: v13 overwrote same-named files and many names are generic (grill-me, plan, review, research).',
    'Antigravity targets were written only if ~/.gemini/antigravity-cli/ already existed (13.0.0-alpha.12 on). v13 never copied commands there.',
    'In setting values, `{home}` is the absolute home folder path and `{muninn_token}` is the literal MuninnDB token (a secret: never print it). `{repo_name}` and `{luca_version}` are the repo folder name and the v13 version.',
    'Order for a fix: unwire a setting before moving the file it runs (the repo hook entries before <repo>/.claude/hooks/*.ts, the statusLine before ~/.claude/luca-statusline.ts), and unwire the global stage-gate hook before anything else.',
    'Not fingerprinted (runtime or per-user content): <repo>/.luca/, <repo>/.claude/cache/context-refresher-state.json, <repo>/.env MUNINN_DB_API_KEY, ~/.luca/, /tmp/luca-*.json. See issue #445.',
]

// ─── Small helpers ──────────────────────────────────────────────────────────

const sortVersions = ({ versions }: { versions: string[] }): string[] =>
    uniq(versions).sort(Bun.semver.order)

const sha256Of = async ({ path }: { path: string }): Promise<string> =>
    new Bun.CryptoHasher('sha256')
        .update(await Bun.file(path).arrayBuffer())
        .digest('hex')

const hasMarker = ({ code, marker }: { code: string; marker: Marker }) =>
    typeof marker === 'string' ? code.includes(marker) : marker.test(code)

/**
 * Whether a version's install code has a feature. The first marker says
 * whether the feature is there; when it is, every other marker must be too.
 * A missing one means v13's code changed shape, so stop rather than write a
 * manifest that guesses.
 */
const hasFeature = ({
    code,
    markers,
    label,
    version,
}: {
    code: string
    markers: Marker[]
    label: string
    version: string
}): boolean => {
    const [trigger, ...rest] = markers
    if (trigger === undefined || !hasMarker({ code, marker: trigger })) {
        return false
    }
    const missing = filter(rest, (marker) => !hasMarker({ code, marker }))
    if (missing.length === 0) return true
    throw new Error(
        `${version}: "${label}" is installed, but v13's install code lacks ${map(missing, String).join(', ')}. The code changed shape; review this generator before trusting the manifest.`
    )
}

/** The text of `async function <name>(` up to the next top-level function. */
const functionSource = ({
    code,
    name,
}: {
    code: string
    name: string
}): string | null => {
    const start = code.indexOf(`async function ${name}(`)
    if (start < 0) return null
    const rest = code.slice(start + 1)
    const end = rest.search(/\n(async )?function |\nconst [A-Z_]+ = /)
    return end < 0 ? code.slice(start) : code.slice(start, start + 1 + end)
}

/** Stop if a copy function no longer copies files byte for byte. */
const assertByteForByte = ({
    code,
    names,
    version,
}: {
    code: string
    names: string[]
    version: string
}): void => {
    for (const name of names) {
        const source = functionSource({ code, name })
        if (
            source === null ||
            !source.includes('copyFile(') ||
            /\.replace(All)?\(/.test(source)
        ) {
            throw new Error(
                `${version}: ${name} no longer copies files byte for byte (or is missing). Reproduce its transform before hashing.`
            )
        }
    }
}

/** Plain files directly in `dir` (sorted), optionally by extension. */
const filesIn = async ({
    dir,
    ext,
}: {
    dir: string
    ext?: string
}): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const names = map(
        filter(
            entries,
            (entry) =>
                entry.isFile() &&
                (ext === undefined || entry.name.endsWith(ext))
        ),
        'name'
    )
    return sortBy(names)
}

/** Folders directly in `dir` (sorted). */
const dirsIn = async ({ dir }: { dir: string }): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    return sortBy(
        map(
            filter(entries, (entry) => entry.isDirectory()),
            'name'
        )
    )
}

/** Every `.mjs` file under `dist/`, joined: the version's install code. */
const readInstallCode = async ({
    package_root,
}: {
    package_root: string
}): Promise<string> => {
    const glob = new Bun.Glob('dist/**/*.mjs')
    const paths = sortBy(
        await Array.fromAsync(glob.scan({ cwd: package_root }))
    )
    const texts = await Promise.all(
        map(paths, (path) => Bun.file(join(package_root, path)).text())
    )
    return texts.join('\n')
}

// ─── Reading one version ────────────────────────────────────────────────────

const HookEntrySchema = z.looseObject({
    hooks: z.array(z.looseObject({ command: z.string() })),
})

const BundledSettingsSchema = z.looseObject({
    hooks: z.record(z.string(), z.array(z.json())),
})

/** The per-repo hook entries in a version's bundled `settings.json`. */
const readRepoHookSettings = async ({
    claude_root,
    version,
}: {
    claude_root: string
    version: string
}): Promise<SettingSpec[]> => {
    const bundled = BundledSettingsSchema.parse(
        await Bun.file(join(claude_root, 'settings.json')).json()
    )
    return flatMap(Object.entries(bundled.hooks), ([event, entries]) =>
        map(entries, (entry) => {
            const { hooks } = HookEntrySchema.parse(entry)
            const scripts = uniq(
                flatMap(hooks, ({ command }) => {
                    const found = command.match(
                        /\/\.claude\/hooks\/([\w.-]+)\.ts/
                    )
                    return found?.[1] === undefined ? [] : [found[1]]
                })
            )
            const script = scripts[0]
            if (scripts.length !== 1 || script === undefined) {
                throw new Error(
                    `${version}: a bundled ${event} hook entry runs ${scripts.length} hook scripts; expected one.`
                )
            }
            return {
                id: `repo-hook-${kebabCase(event)}-${script}`,
                file: `${REPO}/.claude/settings.json`,
                path: ['hooks', event],
                match: {
                    kind: 'array_entry_hook_command_contains',
                    text: `/.claude/hooks/${script}.ts`,
                },
                values: [entry],
                action: 'remove',
                note: `Wires ${REPO}/.claude/hooks/${script}.ts in the repo's .claude/settings.json, which is usually tracked in git, so the fix is a change the user commits. Remove this entry before moving the script, or every tool call errors. Drop \`hooks.${event}\`, then \`hooks\`, if they end up empty. v13 recognized its own entries by \`/.claude/hooks/\` in the command.`,
                markers: REPO_HOOK_MARKERS,
            }
        })
    )
}

/** The `.gitignore` header lines and entries a version writes. */
const readGitignoreBlock = ({ code }: { code: string }): GitignoreBlock => {
    const entriesSource = code.match(
        /const LUCA_GITIGNORE_ENTRIES = \[([^\]]*)\]/
    )?.[1]
    const headerSource = code.match(/const header = ("(?:[^"\\]|\\.)*");/)?.[1]
    if (entriesSource === undefined || headerSource === undefined) {
        throw new Error('could not read the .gitignore entries or header')
    }
    const entries = map(
        [...entriesSource.replace(/\/\/.*$/gm, '').matchAll(/"([^"]*)"/g)],
        (found) => z.string().parse(found[1])
    )
    const header = filter(
        z.string().parse(JSON.parse(headerSource)).split('\n'),
        (line) => line !== ''
    )
    return { header, entries }
}

/** Download, unpack and read one version. */
const readVersion = async ({
    version,
    work_dir,
}: {
    version: string
    work_dir: string
}): Promise<VersionInstall> => {
    const dir = join(work_dir, version)
    await mkdir(dir, { recursive: true })
    const packed = z
        .array(z.object({ filename: z.string() }))
        .parse(
            JSON.parse(
                await $`npm pack ${PACKAGE_NAME}@${version} --pack-destination ${dir} --json`
                    .quiet()
                    .text()
            )
        )
    const tarball = packed[0]?.filename
    if (tarball === undefined)
        throw new Error(`${version}: npm pack gave no file`)
    await $`tar -xzf ${join(dir, tarball)} -C ${dir}`.quiet()

    const package_root = join(dir, 'package')
    const claude_root = join(package_root, 'dist', 'claude', '.claude')
    const skills_root = join(package_root, 'dist', 'claude', 'skills')
    const code = await readInstallCode({ package_root })
    const feature = ({
        markers,
        label,
    }: {
        markers: Marker[]
        label: string
    }) => hasFeature({ code, markers, label, version })

    const files: VersionInstall['files'] = []
    const add = async ({ target, path }: { target: string; path: string }) => {
        files.push({ target, sha256: await sha256Of({ path }) })
    }

    // Skills (every file directly in each skill folder), agents and commands.
    const copyArtifacts = async ({
        home,
        commands,
    }: {
        home: string
        commands: boolean
    }) => {
        for (const skill of await dirsIn({ dir: skills_root })) {
            for (const name of await filesIn({
                dir: join(skills_root, skill),
            })) {
                await add({
                    target: `${home}/skills/${skill}/${name}`,
                    path: join(skills_root, skill, name),
                })
            }
        }
        const buckets = commands ? ['agents', 'commands'] : ['agents']
        for (const bucket of buckets) {
            const from = join(claude_root, bucket)
            for (const name of await filesIn({ dir: from, ext: '.md' })) {
                await add({
                    target: `${home}/${bucket}/${name}`,
                    path: join(from, name),
                })
            }
        }
    }

    if (
        feature({ markers: CLAUDE_ARTIFACT_MARKERS, label: 'claude artifacts' })
    ) {
        assertByteForByte({ code, names: ARTIFACT_COPY_FUNCTIONS, version })
        await copyArtifacts({ home: CLAUDE_HOME, commands: true })
    }
    if (
        feature({
            markers: AGY_ARTIFACT_MARKERS,
            label: 'antigravity artifacts',
        })
    ) {
        await copyArtifacts({ home: AGY_HOME, commands: false })
    }
    if (feature({ markers: STATUSLINE_MARKERS, label: 'status line' })) {
        assertByteForByte({ code, names: ['installStatusline'], version })
        await add({
            target: `${CLAUDE_HOME}/luca-statusline.ts`,
            path: join(claude_root, 'luca-statusline.ts'),
        })
    }

    const settings: VersionInstall['settings'] = map(
        filter(STATIC_SETTINGS, (spec) =>
            feature({ markers: spec.markers, label: spec.id })
        ),
        (spec) => ({ spec })
    )
    if (feature({ markers: REPO_HOOK_MARKERS, label: 'repo hooks' })) {
        assertByteForByte({ code, names: ['installHooks'], version })
        const hooks_dir = join(claude_root, 'hooks')
        for (const name of await filesIn({ dir: hooks_dir, ext: '.ts' })) {
            await add({
                target: `${REPO}/.claude/hooks/${name}`,
                path: join(hooks_dir, name),
            })
        }
        for (const spec of await readRepoHookSettings({
            claude_root,
            version,
        })) {
            settings.push({ spec })
        }
    }

    const gitignore = feature({
        markers: GITIGNORE_MARKERS,
        label: 'gitignore block',
    })
        ? readGitignoreBlock({ code })
        : null

    return { version, files, settings, gitignore }
}

// ─── Building the manifest ──────────────────────────────────────────────────

const buildManifest = ({
    installs,
}: {
    installs: VersionInstall[]
}): V13Manifest => {
    const generated_from = sortVersions({ versions: map(installs, 'version') })

    const fileRows = flatMap(installs, ({ version, files }) =>
        map(files, (file) => ({ ...file, version }))
    )
    const files: V13File[] = sortBy(
        map(groupBy(fileRows, 'target'), (rows, target) => ({
            target,
            sha256: sortBy(uniq(map(rows, 'sha256'))),
            versions: sortVersions({ versions: map(rows, 'version') }),
        })),
        'target'
    )

    const settingRows = flatMap(installs, ({ version, settings }) =>
        map(settings, ({ spec }) => ({ spec, version }))
    )
    const settings: V13Setting[] = sortBy(
        map(groupBy(settingRows, 'spec.id'), (rows, id) => {
            const first = rows[0]
            if (first === undefined) throw new Error(`no rows for ${id}`)
            const { markers: _markers, ...spec } = first.spec
            const paths = uniqWith(map(rows, 'spec.path'), isEqual)
            if (paths.length !== 1) {
                throw new Error(`${id}: written at more than one path`)
            }
            return {
                ...spec,
                values: uniqWith(
                    flatMap(rows, ({ spec: row }) => row.values),
                    isEqual
                ),
                versions: sortVersions({ versions: map(rows, 'version') }),
            }
        }),
        'id'
    )

    const gitignoreRows = flatMap(installs, ({ version, gitignore }) =>
        gitignore === null ? [] : [{ version, ...gitignore }]
    )
    // Oldest variant first (semver order, not string order).
    const variants = map(
        groupBy(gitignoreRows, (row) =>
            JSON.stringify([row.header, row.entries])
        ),
        (rows) => {
            const header = rows[0]?.header ?? []
            const entries = rows[0]?.entries ?? []
            return {
                versions: sortVersions({ versions: map(rows, 'version') }),
                header,
                entries,
                end_marker: entries[entries.length - 1] ?? '',
            }
        }
    ).sort((a, b) => Bun.semver.order(a.versions[0] ?? '', b.versions[0] ?? ''))
    const start_markers = uniq(map(variants, (variant) => variant.header[0]))
    const start_marker = start_markers[0]
    if (start_markers.length !== 1 || start_marker === undefined) {
        throw new Error('the .gitignore block variants start differently')
    }

    return V13ManifestSchema.parse({
        generated_from,
        notes: NOTES,
        files,
        settings,
        gitignore_block: {
            file: `${REPO}/.gitignore`,
            start_marker,
            variants,
            note: 'v13 wrote the full block (header, then every entry) only when none of its entries were in the file yet, after one blank line when the file was not empty. When some already were, it appended just the missing entries, in this order, with no header (a partial block; seen in real repos, and users also edited the lines by hand). So remove header plus entries when a full variant matches; otherwise report the loose entries rather than guess. Nothing marks the end: the full block ends on end_marker.',
        },
    })
}

const generate = async ({ out }: { out: string }): Promise<void> => {
    const versions = sortVersions({
        versions: filter(
            z
                .array(z.string())
                .parse(
                    JSON.parse(
                        await $`npm view ${PACKAGE_NAME} versions --json`
                            .quiet()
                            .text()
                    )
                ),
            (version) => version.startsWith('13.')
        ),
    })
    const work_dir = await mkdtemp(join(tmpdir(), 'luca-v13-'))
    try {
        const installs: VersionInstall[] = []
        for (const version of versions) {
            console.log(`reading ${PACKAGE_NAME}@${version}`)
            installs.push(await readVersion({ version, work_dir }))
        }
        const manifest = buildManifest({ installs })
        await Bun.write(out, JSON.stringify(manifest, null, 4) + '\n')
        console.log(
            `wrote ${out}: ${manifest.files.length} files, ${manifest.settings.length} settings, ${manifest.gitignore_block.variants.length} .gitignore variants, from ${versions.length} versions`
        )
    } finally {
        await rm(work_dir, { recursive: true, force: true })
    }
}

// ─── Verifying this computer (read-only) ────────────────────────────────────

type FileStatus = 'match' | 'moved' | 'differs' | 'other'

type FileFinding = { status: FileStatus; target: string; detail: string }

/** Where a manifest location is on this computer; null without a repo. */
const resolveLocation = ({
    location,
    home,
    claude_home,
    repo,
}: {
    location: string
    home: string
    claude_home: string
    repo: string | null
}): string | null => {
    if (location.startsWith(`${REPO}/`)) {
        return repo === null
            ? null
            : join(repo, location.slice(REPO.length + 1))
    }
    if (location.startsWith(`${CLAUDE_HOME}/`)) {
        return join(claude_home, location.slice(CLAUDE_HOME.length + 1))
    }
    return join(home, location.slice(2))
}

/** Regular files under `dir`, at most `depth` folders deep, as relative paths. */
const listFiles = async ({
    dir,
    depth,
}: {
    dir: string
    depth: number
}): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const nested = await Promise.all(
        map(entries, async (entry) => {
            if (entry.isFile()) return [entry.name]
            if (!entry.isDirectory() || depth <= 1) return []
            const inner = await listFiles({
                dir: join(dir, entry.name),
                depth: depth - 1,
            })
            return map(inner, (name) => `${entry.name}/${name}`)
        })
    )
    return sortBy(flatMap(nested))
}

const classifyFile = async ({
    target,
    path,
    manifest,
}: {
    target: string
    path: string
    manifest: V13Manifest
}): Promise<FileFinding> => {
    const sha256 = await sha256Of({ path })
    const known = find(manifest.files, { target })
    if (known !== undefined && includes(known.sha256, sha256)) {
        return { status: 'match', target, detail: '' }
    }
    const elsewhere = find(manifest.files, (file) =>
        includes(file.sha256, sha256)
    )
    if (elsewhere !== undefined) {
        return {
            status: 'moved',
            target,
            detail: `content is v13's ${elsewhere.target}`,
        }
    }
    if (known !== undefined) {
        return {
            status: 'differs',
            target,
            detail: 'a v13 path, but the content is not from any published v13',
        }
    }
    return { status: 'other', target, detail: 'not a v13 path or content' }
}

/** The folders v13 copied into, scanned for files by manifest location. */
const scanRoots = ({ scope }: { scope: 'global' | 'repo' }) =>
    scope === 'global'
        ? [
              { location: `${CLAUDE_HOME}/skills`, depth: 2 },
              { location: `${CLAUDE_HOME}/agents`, depth: 1 },
              { location: `${CLAUDE_HOME}/commands`, depth: 1 },
              { location: `${AGY_HOME}/skills`, depth: 2 },
              { location: `${AGY_HOME}/agents`, depth: 1 },
          ]
        : [{ location: `${REPO}/.claude/hooks`, depth: 1 }]

const scanFiles = async ({
    scope,
    manifest,
    home,
    claude_home,
    repo,
}: {
    scope: 'global' | 'repo'
    manifest: V13Manifest
    home: string
    claude_home: string
    repo: string | null
}): Promise<FileFinding[]> => {
    const findings: FileFinding[] = []
    for (const { location, depth } of scanRoots({ scope })) {
        const dir = resolveLocation({ location, home, claude_home, repo })
        if (dir === null) continue
        for (const name of await listFiles({ dir, depth })) {
            findings.push(
                await classifyFile({
                    target: `${location}/${name}`,
                    path: join(dir, name),
                    manifest,
                })
            )
        }
    }
    if (scope === 'global') {
        const target = `${CLAUDE_HOME}/luca-statusline.ts`
        const path = resolveLocation({
            location: target,
            home,
            claude_home,
            repo,
        })
        if (path !== null && (await Bun.file(path).exists())) {
            findings.push(await classifyFile({ target, path, manifest }))
        }
    }
    return findings
}

/** Replace every string in a JSON value. */
const mapStrings = ({
    value,
    fn,
}: {
    value: Json
    fn: (text: string) => string
}): Json => {
    if (typeof value === 'string') return fn(value)
    if (Array.isArray(value)) {
        return map(value, (item) => mapStrings({ value: item, fn }))
    }
    if (value !== null && typeof value === 'object') {
        return mapValues(value, (item) => mapStrings({ value: item, fn }))
    }
    return value
}

/** A JSON object with v13's LangSmith keys; a record keeps the key order. */
const TraceMetadataSchema = z
    .record(z.string(), z.json())
    .refine((value) => 'repo' in value && 'luca_version' in value)

/**
 * Put the manifest's placeholders back into a value read from disk, so it
 * can be compared with v13's: a Bearer token, and the per-repo values in the
 * LangSmith metadata string.
 */
const maskText = ({ text }: { text: string }): string => {
    if (/^Bearer \S+$/.test(text)) return TOKEN_VALUE
    const metadata = TraceMetadataSchema.safeParse(
        z.json().safeParse(parseJsonText({ text })).data
    )
    return metadata.success
        ? JSON.stringify({
              ...metadata.data,
              repo: '{repo_name}',
              luca_version: '{luca_version}',
          })
        : text
}

const parseJsonText = ({ text }: { text: string }): unknown => {
    try {
        return JSON.parse(text)
    } catch {
        return undefined
    }
}

const readJsonFile = async ({
    path,
}: {
    path: string
}): Promise<Json | null> => {
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    const parsed = z.json().safeParse(await file.json().catch(() => undefined))
    return parsed.success ? parsed.data : null
}

/** Whether v13's setting is in the file, and whether it's exactly v13's. */
const checkSetting = async ({
    setting,
    home,
    claude_home,
    repo,
}: {
    setting: V13Setting
    home: string
    claude_home: string
    repo: string | null
}): Promise<string | null> => {
    const path = resolveLocation({
        location: setting.file,
        home,
        claude_home,
        repo,
    })
    if (path === null) return null
    const json = await readJsonFile({ path })
    if (json === null) return 'file absent or unreadable'
    const node = z.json().optional().parse(get(json, setting.path))
    const expected = map(setting.values, (value) =>
        mapStrings({
            value,
            fn: (text) => text.replaceAll(HOME_PLACEHOLDER, home),
        })
    )
    const masked = (value: Json) =>
        mapStrings({ value, fn: (text) => maskText({ text }) })
    const exact = (value: Json) =>
        some(expected, (candidate) => isEqual(masked(value), candidate))

    const { match } = setting
    if (match.kind === 'array_entry_hook_command_contains') {
        const entries = z.array(z.json()).safeParse(node)
        const found = filter(entries.success ? entries.data : [], (entry) => {
            const parsed = HookEntrySchema.safeParse(entry)
            return (
                parsed.success &&
                some(parsed.data.hooks, ({ command }) =>
                    command.includes(match.text)
                )
            )
        })
        if (found.length === 0) return 'absent'
        return `present (${found.length} entr${found.length === 1 ? 'y' : 'ies'}, ${
            some(found, exact) ? 'exactly v13' : 'differs from v13'
        })`
    }
    if (match.kind === 'command_equals') {
        const parsed = z.looseObject({ command: z.string() }).safeParse(node)
        if (!parsed.success) return 'absent'
        const commands = map(match.any_of, (command) =>
            command.replaceAll(HOME_PLACEHOLDER, home)
        )
        if (!includes(commands, parsed.data.command.trim())) {
            return "present but not v13's command (the user's own)"
        }
        return `present (${node !== undefined && exact(node) ? 'exactly v13' : 'differs from v13'})`
    }
    if (node === undefined) return 'absent'
    return `present (${exact(node) ? 'exactly v13' : 'differs from v13'})`
}

const checkGitignore = async ({
    manifest,
    repo,
}: {
    manifest: V13Manifest
    repo: string
}): Promise<string> => {
    const file = Bun.file(join(repo, '.gitignore'))
    if (!(await file.exists())) return 'no .gitignore'
    const lines = (await file.text()).split('\n')
    const { start_marker, variants } = manifest.gitignore_block
    const start = lines.indexOf(start_marker)
    if (start >= 0) {
        const variant = find(variants, ({ header, entries }) =>
            isEqual(
                lines.slice(start, start + header.length + entries.length),
                [...header, ...entries]
            )
        )
        return variant === undefined
            ? 'start marker found, but the block differs from every variant'
            : `full block, the variant from ${variant.versions[0]} on (line ${start + 1})`
    }
    // No header: look for loose entries, and the longest run of them in
    // v13's order (what a partial, header-less append leaves).
    const entries = last(variants)?.entries ?? []
    const present = filter(entries, (entry) => includes(lines, entry))
    if (present.length === 0) return 'absent'
    const runs = map(lines, (line, at) => {
        const from = indexOf(entries, line)
        let length = 0
        while (
            from >= 0 &&
            at + length < lines.length &&
            lines[at + length] === entries[from + length]
        ) {
            length += 1
        }
        return { at, length }
    })
    const longest = maxBy(runs, 'length')
    return `no header; ${present.length} of ${entries.length} entries present as loose lines, longest run in v13's order: ${longest?.length ?? 0} lines at line ${(longest?.at ?? 0) + 1}`
}

const printFindings = ({
    title,
    findings,
}: {
    title: string
    findings: FileFinding[]
}): void => {
    const counts = mapValues(groupBy(findings, 'status'), 'length')
    console.log(
        `\n${title}: ${findings.length} files; match ${counts.match ?? 0}, moved ${counts.moved ?? 0}, differs ${counts.differs ?? 0}, other ${counts.other ?? 0}`
    )
    for (const finding of filter(findings, (f) => f.status !== 'match')) {
        console.log(
            `  ${finding.status.padEnd(7)} ${finding.target}  ${finding.detail}`
        )
    }
}

const verify = async ({
    repos,
    claude_home,
}: {
    repos: string[]
    claude_home: string
}): Promise<void> => {
    const manifest = await loadV13Manifest()
    const home = homedir()
    console.log(
        `Read-only check against ${manifest.files.length} v13 files (${manifest.generated_from.length} versions). Claude home: ${claude_home}`
    )

    printFindings({
        title: 'Computer (~/.claude, ~/.gemini/antigravity-cli)',
        findings: await scanFiles({
            scope: 'global',
            manifest,
            home,
            claude_home,
            repo: null,
        }),
    })
    console.log('  settings:')
    for (const setting of filter(manifest.settings, (s) =>
        s.file.startsWith('~/')
    )) {
        const result = await checkSetting({
            setting,
            home,
            claude_home,
            repo: null,
        })
        console.log(`    ${setting.id} (${setting.action}): ${result}`)
    }

    for (const repo of repos) {
        printFindings({
            title: `Repo ${repo}`,
            findings: await scanFiles({
                scope: 'repo',
                manifest,
                home,
                claude_home,
                repo,
            }),
        })
        console.log('  settings:')
        for (const setting of filter(manifest.settings, (s) =>
            s.file.startsWith(`${REPO}/`)
        )) {
            const result = await checkSetting({
                setting,
                home,
                claude_home,
                repo,
            })
            console.log(`    ${setting.id} (${setting.action}): ${result}`)
        }
        console.log(`  .gitignore: ${await checkGitignore({ manifest, repo })}`)
    }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        verify: { type: 'boolean', default: false },
        repo: { type: 'string', multiple: true, default: [] },
        'claude-home': { type: 'string', default: join(homedir(), '.claude') },
        out: { type: 'string', default: V13_MANIFEST_PATH },
    },
    strict: true,
})

if (args.verify) {
    await verify({ repos: args.repo, claude_home: args['claude-home'] })
} else {
    await generate({ out: args.out })
}
