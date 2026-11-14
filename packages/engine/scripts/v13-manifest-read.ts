/**
 * Reading every published v13 version and building the manifest from what
 * each installs (`generate`), for `generate-v13-manifest.ts`.
 */
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import filter from 'lodash/filter'
import flatMap from 'lodash/flatMap'
import groupBy from 'lodash/groupBy'
import isEqual from 'lodash/isEqual'
import kebabCase from 'lodash/kebabCase'
import map from 'lodash/map'
import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'
import uniqWith from 'lodash/uniqWith'
import { z } from 'zod'

import {
    PACKAGE_NAME,
    CLAUDE_HOME,
    AGY_HOME,
    REPO,
    type Marker,
    type SettingSpec,
    type GitignoreBlock,
    type VersionInstall,
    CLAUDE_ARTIFACT_MARKERS,
    AGY_ARTIFACT_MARKERS,
    REPO_HOOK_MARKERS,
    STATUSLINE_MARKERS,
    GITIGNORE_MARKERS,
    ARTIFACT_COPY_FUNCTIONS,
    STATIC_SETTINGS,
    NOTES,
} from './v13-manifest-specs'

import {
    V13ManifestSchema,
    type V13File,
    type V13Manifest,
    type V13Setting,
} from '../src/doctor/v13-manifest'

export const sortVersions = ({ versions }: { versions: string[] }): string[] =>
    uniq(versions).sort(Bun.semver.order)

export const sha256Of = async ({ path }: { path: string }): Promise<string> =>
    new Bun.CryptoHasher('sha256')
        .update(await Bun.file(path).arrayBuffer())
        .digest('hex')

export const hasMarker = ({
    code,
    marker,
}: {
    code: string
    marker: Marker
}) => (typeof marker === 'string' ? code.includes(marker) : marker.test(code))

/**
 * Whether a version's install code has a feature. The first marker says
 * whether the feature is there; when it is, every other marker must be too.
 * A missing one means v13's code changed shape, so stop rather than write a
 * manifest that guesses.
 */
export const hasFeature = ({
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
export const functionSource = ({
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
export const assertByteForByte = ({
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
export const filesIn = async ({
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
export const dirsIn = async ({ dir }: { dir: string }): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    return sortBy(
        map(
            filter(entries, (entry) => entry.isDirectory()),
            'name'
        )
    )
}

/** Every `.mjs` file under `dist/`, joined: the version's install code. */
export const readInstallCode = async ({
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

export const HookEntrySchema = z.looseObject({
    hooks: z.array(z.looseObject({ command: z.string() })),
})

export const BundledSettingsSchema = z.looseObject({
    hooks: z.record(z.string(), z.array(z.json())),
})

/** The per-repo hook entries in a version's bundled `settings.json`. */
export const readRepoHookSettings = async ({
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
export const readGitignoreBlock = ({
    code,
}: {
    code: string
}): GitignoreBlock => {
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
export const readVersion = async ({
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

export const buildManifest = ({
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

export const generate = async ({ out }: { out: string }): Promise<void> => {
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
