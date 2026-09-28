import { existsSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'
import { z } from 'zod'

/**
 * The publish package (seam 5): `@alecsibilia/luca`, packed with
 * `bun pm pack` in its own folder and unpacked into a throwaway folder. No
 * network: packing only copies files and rewrites the manifest.
 */

const LUCA_DIR = import.meta.dir
const PACKAGES_DIR = join(import.meta.dir, '..')
const ENGINE_SRC = join(PACKAGES_DIR, 'engine', 'src')
const BOARD_DIR = join(PACKAGES_DIR, 'board')

/** Packing copies the engine and board, so the first test waits for it. */
const PACK_TIMEOUT_MS = 120_000

/**
 * The module in the board's folder that holds its Luca version, which its
 * server imports: the dev version in the repo, stamped by the pack step.
 */
const BOARD_VERSION_MODULE = 'server/luca-version.ts'

/** Luca's version when it runs from the repo's source, not an install. */
const DEV_VERSION = 'dev (source)'

/** The packages Paseo supplies a plugin's server, left out of its bundle. */
const PASEO_SUPPLIED = ['@getpaseo/*', 'zod']

const DependenciesSchema = z.record(z.string(), z.string()).default({})

const ManifestSchema = z.looseObject({
    name: z.string(),
    version: z.string(),
    private: z.boolean().optional(),
    publishConfig: z.looseObject({ access: z.string().optional() }).optional(),
    bin: z.record(z.string(), z.string()).default({}),
    dependencies: DependenciesSchema,
    devDependencies: DependenciesSchema,
    peerDependencies: DependenciesSchema,
    optionalDependencies: DependenciesSchema,
})

type Manifest = z.infer<typeof ManifestSchema>

const readManifest = async (file: string): Promise<Manifest> =>
    ManifestSchema.parse(JSON.parse(await Bun.file(file).text()))

const isTestFile = (path: string) => /\.test\.[cm]?[jt]sx?$/.test(path)

/** Every file under `dir`, as paths relative to it. */
const filesUnder = async (dir: string): Promise<string[]> =>
    Array.fromAsync(
        new Bun.Glob('**/*').scan({ cwd: dir, dot: true, onlyFiles: true })
    )

/** Runs a command and fails with its output when it exits non-zero. */
const run = async ({ cmd, cwd }: { cmd: string[]; cwd: string }) => {
    const child = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr, exit_code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ])
    if (exit_code !== 0) {
        throw new Error(
            `${cmd.join(' ')} exited ${exit_code}\n${stdout}\n${stderr}`
        )
    }
}

/** The engine's source files the package must carry (not its tests). */
const engineFiles = async (): Promise<string[]> =>
    (await filesUnder(ENGINE_SRC)).filter((file) => !isTestFile(file))

/**
 * The board's plugin files Paseo loads from a folder source: its manifest,
 * entry points, and client, server, and shared code (not its tests or test
 * helpers).
 */
const boardFiles = async (): Promise<string[]> => [
    'paseo-plugin.json',
    'index.server.ts',
    'index.client.tsx',
    ...(await filesUnder(BOARD_DIR)).filter(
        (file) =>
            /^(client|server|shared)\//.test(file) &&
            !isTestFile(file) &&
            !file.includes('/testing/')
    ),
]

/** The board's files that run in Paseo's daemon, not in the app. */
const boardServerFiles = async (): Promise<string[]> =>
    (await boardFiles()).filter(
        (file) =>
            /\.tsx?$/.test(file) &&
            (file === 'index.server.ts' || /^(server|shared)\//.test(file))
    )

const BUILTINS = new Set(builtinModules)

const isBuiltin = (specifier: string) =>
    specifier.startsWith('node:') ||
    specifier === 'bun' ||
    specifier.startsWith('bun:') ||
    BUILTINS.has(specifier)

/** `@scope/name/deep/path` → `@scope/name`; `name/deep` → `name`. */
const packageOf = (specifier: string): string => {
    const parts = specifier.split('/')
    return specifier.startsWith('@')
        ? parts.slice(0, 2).join('/')
        : (parts[0] ?? specifier)
}

/**
 * The packages a source file imports at runtime: its bare `import` and
 * `export ... from` specifiers, minus `import type`, builtins, and relative
 * paths.
 */
const runtimeImports = (source: string): string[] => {
    const statements = source.matchAll(
        /^(?:import|export)\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/gm
    )
    const dynamic = source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)
    return [
        ...[...statements]
            .filter((match) => match[1] === undefined)
            .map((match) => match[2] ?? ''),
        ...[...dynamic].map((match) => match[1] ?? ''),
    ]
        .filter((specifier) => specifier !== '')
        .filter((specifier) => !specifier.startsWith('.'))
        .filter((specifier) => !isBuiltin(specifier))
        .map(packageOf)
}

/** The unpacked tarball: its folder, its files, and its manifest. */
type Tarball = { dir: string; files: string[]; manifest: Manifest }

let workDir = ''

/** Packs the package with Bun and unpacks the tarball. */
const packAndUnpack = async (): Promise<Tarball> => {
    workDir = realpathSync(await mkdtemp(join(tmpdir(), 'luca-pack-')))
    const out = join(workDir, 'out')
    const unpacked = join(workDir, 'unpacked')
    await mkdir(out)
    await mkdir(unpacked)

    await run({
        cmd: [process.execPath, 'pm', 'pack', '--destination', out],
        cwd: LUCA_DIR,
    })
    const tarballs = (await filesUnder(out)).filter((file) =>
        file.endsWith('.tgz')
    )
    const tarball = tarballs[0]
    if (tarballs.length !== 1 || tarball === undefined) {
        throw new Error(`Expected one tarball, found: ${tarballs.join(', ')}`)
    }
    await run({
        cmd: ['tar', '-xzf', join(out, tarball), '-C', unpacked],
        cwd: workDir,
    })

    const dir = join(unpacked, 'package')
    return {
        dir,
        files: await filesUnder(dir),
        manifest: await readManifest(join(dir, 'package.json')),
    }
}

let packing: Promise<Tarball> | undefined

/** The package packed once for every test here; each test waits for it. */
const packed = (): Promise<Tarball> => (packing ??= packAndUnpack())

/**
 * The folder in the tarball (as a prefix, `''` or ending in `/`) that holds
 * a copied source folder, found by a file that folder has (`anchor`).
 */
const rootHolding = (tarball: Tarball, anchor: string): string | undefined => {
    const hit = tarball.files.find(
        (file) => file === anchor || file.endsWith(`/${anchor}`)
    )
    return hit === undefined ? undefined : hit.slice(0, -anchor.length)
}

/** The source files missing from, or changed in, their copy in the tarball. */
const copyProblems = async ({
    tarball,
    root,
    source_dir,
    files,
}: {
    tarball: Tarball
    root: string
    source_dir: string
    files: string[]
}): Promise<{ missing: string[]; changed: string[] }> => {
    const missing: string[] = []
    const changed: string[] = []
    for (const file of files) {
        const copy = join(tarball.dir, `${root}${file}`)
        if (!existsSync(copy)) {
            missing.push(file)
            continue
        }
        const same =
            (await Bun.file(copy).text()) ===
            (await Bun.file(join(source_dir, file)).text())
        if (!same) changed.push(file)
    }
    return { missing, changed }
}

/**
 * Loads the bundled board with a stand-in for Paseo's plugin server, asks
 * `board.version`, and prints the answer as JSON.
 */
const BUNDLE_RUNNER = `import contribute from './board-server.js'

const handlers = new Map()
const cleanup = contribute({
    registerSettings: () => ({
        read: async () => ({ status: 'invalid', revision: '0', error: 'none' }),
        subscribe: () => async () => {},
    }),
    handle: (contract, handler) => handlers.set(contract.name, handler),
    registerProvider: () => {},
    on: () => () => {},
    before: () => () => {},
})
const answer = await handlers.get('board.version')({}, { paseo: {} })
await cleanup()
console.log(JSON.stringify(answer))
process.exit(0)
`

const BoardVersionAnswerSchema = z.object({ version: z.string().nullable() })

let bundles = 0

/**
 * The version the packed board answers at `board.version` once loaded the
 * way Paseo loads a folder plugin: its server entry compiled into one file
 * in another folder (the packages Paseo supplies left external), run in its
 * own process. `beside` is a package.json to put next to the bundle.
 */
const bundledBoardVersion = async ({
    tarball,
    beside,
}: {
    tarball: Tarball
    beside?: object
}): Promise<string | null> => {
    const root = rootHolding(tarball, 'paseo-plugin.json') ?? ''
    const dir = join(workDir, `bundle-${++bundles}`)
    await mkdir(dir)
    const build = await Bun.build({
        entrypoints: [join(tarball.dir, `${root}index.server.ts`)],
        outdir: dir,
        naming: 'board-server.js',
        target: 'node',
        format: 'esm',
        external: PASEO_SUPPLIED,
    })
    if (!build.success) {
        throw new Error(`The board didn't bundle:\n${build.logs.join('\n')}`)
    }
    // The packages Paseo supplies, where the bundle can import them.
    await symlink(join(BOARD_DIR, 'node_modules'), join(dir, 'node_modules'))
    await Bun.write(join(dir, 'run-board.mjs'), BUNDLE_RUNNER)
    if (beside !== undefined) {
        await Bun.write(join(dir, 'package.json'), JSON.stringify(beside))
    }

    const child = Bun.spawn([process.execPath, 'run-board.mjs'], {
        cwd: dir,
        env: {
            ...process.env,
            HOME: join(dir, 'home'),
            LUCA_BOARD_STATE_DIR: join(dir, 'state'),
            LUCA_RUNS_DIR: join(dir, 'runs'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [stdout, stderr, exit_code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ])
    if (exit_code !== 0) {
        throw new Error(`The bundled board exited ${exit_code}\n${stderr}`)
    }
    return BoardVersionAnswerSchema.parse(JSON.parse(stdout)).version
}

afterAll(async () => {
    if (workDir !== '') await rm(workDir, { recursive: true, force: true })
})

describe('the packed @alecsibilia/luca tarball', () => {
    test(
        'it is @alecsibilia/luca',
        async () => {
            const { manifest } = await packed()

            expect(manifest.name).toBe('@alecsibilia/luca')
        },
        PACK_TIMEOUT_MS
    )

    test(
        'it has every engine source file, unchanged, in one folder',
        async () => {
            const tarball = await packed()
            const root = rootHolding(tarball, 'cli/luca-run.ts')
            expect(root).toBeDefined()

            const problems = await copyProblems({
                tarball,
                root: root ?? '',
                source_dir: ENGINE_SRC,
                files: await engineFiles(),
            })
            expect(problems).toEqual({ missing: [], changed: [] })
        },
        PACK_TIMEOUT_MS
    )

    test(
        'it has the board plugin folder with its paseo-plugin.json, code, and package.json',
        async () => {
            const tarball = await packed()
            const root = rootHolding(tarball, 'paseo-plugin.json')
            expect(root).toBeDefined()

            // The version module is stamped in the copy, so it differs.
            const problems = await copyProblems({
                tarball,
                root: root ?? '',
                source_dir: BOARD_DIR,
                files: (await boardFiles()).filter(
                    (file) => file !== BOARD_VERSION_MODULE
                ),
            })
            expect(problems).toEqual({ missing: [], changed: [] })
            expect(tarball.files).toContain(`${root}package.json`)
        },
        PACK_TIMEOUT_MS
    )

    test(
        "its board's version module holds the package's version",
        async () => {
            const tarball = await packed()
            const root = rootHolding(tarball, 'paseo-plugin.json') ?? ''
            expect(tarball.files).toContain(`${root}${BOARD_VERSION_MODULE}`)

            const module = await Bun.file(
                join(tarball.dir, `${root}${BOARD_VERSION_MODULE}`)
            ).text()
            expect(module).toContain(tarball.manifest.version)
            expect(module).not.toContain(DEV_VERSION)
        },
        PACK_TIMEOUT_MS
    )

    test(
        'its two bins, luca and luca-run, point at Bun scripts in the tarball',
        async () => {
            const tarball = await packed()
            const bins = tarball.manifest.bin
            expect(Object.keys(bins).sort()).toEqual(['luca', 'luca-run'])

            for (const target of Object.values(bins)) {
                const file = normalize(target)
                expect(tarball.files).toContain(file)
                const text = await Bun.file(join(tarball.dir, file)).text()
                expect(text.startsWith('#!/usr/bin/env bun')).toBe(true)
            }
        },
        PACK_TIMEOUT_MS
    )

    test(
        'it has no test files',
        async () => {
            const { files } = await packed()

            expect(files.length).toBeGreaterThan(0)
            expect(files.filter(isTestFile)).toEqual([])
        },
        PACK_TIMEOUT_MS
    )

    test(
        'its manifest has no catalog: or workspace: ranges',
        async () => {
            const { manifest } = await packed()
            const ranges = [
                manifest.dependencies,
                manifest.devDependencies,
                manifest.peerDependencies,
                manifest.optionalDependencies,
            ].flatMap((deps) => Object.entries(deps))
            const unresolved = ranges.filter(
                ([, range]) =>
                    range.startsWith('catalog:') ||
                    range.startsWith('workspace:')
            )

            expect(Object.keys(manifest.dependencies).length).toBeGreaterThan(0)
            expect(unresolved).toEqual([])
        },
        PACK_TIMEOUT_MS
    )

    test(
        'it depends on every package the engine and the board server import at runtime',
        async () => {
            const { manifest } = await packed()
            const sources = [
                ...(await engineFiles())
                    .filter((file) => /\.tsx?$/.test(file))
                    .map((file) => join(ENGINE_SRC, file)),
                ...(await boardServerFiles()).map((file) =>
                    join(BOARD_DIR, file)
                ),
            ]
            const imported = new Set<string>()
            for (const source of sources) {
                const text = await Bun.file(source).text()
                for (const name of runtimeImports(text)) imported.add(name)
            }
            const dependencies = Object.keys(manifest.dependencies)
            const undeclared = [...imported].filter(
                (name) => !dependencies.includes(name)
            )

            expect(imported.size).toBeGreaterThan(0)
            expect(undeclared).toEqual([])
        },
        PACK_TIMEOUT_MS
    )

    test(
        'it has the README and the LICENSE',
        async () => {
            const { files } = await packed()

            expect(files).toContain('README.md')
            expect(files).toContain('LICENSE')
        },
        PACK_TIMEOUT_MS
    )
})

describe('the packed board, bundled and loaded the way Paseo loads it', () => {
    test(
        'board.version answers the package version',
        async () => {
            const tarball = await packed()

            expect(await bundledBoardVersion({ tarball })).toBe(
                tarball.manifest.version
            )
        },
        PACK_TIMEOUT_MS
    )

    test(
        'board.version ignores a package.json next to the bundle',
        async () => {
            const tarball = await packed()

            const version = await bundledBoardVersion({
                tarball,
                beside: {
                    name: '@luca/board',
                    version: '0.0.0-beside-the-bundle',
                    type: 'module',
                },
            })
            expect(version).toBe(tarball.manifest.version)
        },
        PACK_TIMEOUT_MS
    )
})

describe('the @alecsibilia/luca package', () => {
    test('its version is a release version and it is public', async () => {
        const manifest = await readManifest(join(LUCA_DIR, 'package.json'))

        expect(manifest.name).toBe('@alecsibilia/luca')
        // Changesets bumps the version on every Version PR, so only its shape
        // is checked: `X.Y.Z`, or `X.Y.Z-alpha.N` while in pre mode.
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+(-alpha\.\d+)?$/)
        expect(manifest.private).not.toBe(true)
        expect(manifest.publishConfig?.access).toBe('public')
    })

    test('its README says to pack it with bun pm pack, and why', async () => {
        const readme = await Bun.file(join(LUCA_DIR, 'README.md')).text()

        expect(readme).toContain('bun pm pack')
        expect(readme).toContain('catalog:')
        expect(readme).toContain('workspace:')
        expect(readme).toContain('npm pack')
    })
})
