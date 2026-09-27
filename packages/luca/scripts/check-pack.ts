#!/usr/bin/env bun
/**
 * Packs the publish package with `bun pm pack` into a throwaway folder and
 * fails if the packed `package.json` still has a `catalog:` or `workspace:`
 * range, which would make an install from the tarball fail.
 *
 * Usage: bun packages/luca/scripts/check-pack.ts
 */
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

const PACKAGE_DIR = join(import.meta.dir, '..')

const DependenciesSchema = z.record(z.string(), z.string()).default({})

const ManifestSchema = z.looseObject({
    dependencies: DependenciesSchema,
    devDependencies: DependenciesSchema,
    peerDependencies: DependenciesSchema,
    optionalDependencies: DependenciesSchema,
})

/** Runs a command, and throws when it exits non-zero. */
const run = async ({ cmd, cwd }: { cmd: string[]; cwd: string }) => {
    const child = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
    const exit_code = await child.exited
    if (exit_code !== 0) {
        throw new Error(`${cmd.join(' ')} exited ${exit_code}`)
    }
}

/** Every `catalog:` or `workspace:` range in the manifest, as `field.name: range`. */
const unresolvedRanges = (manifest: z.infer<typeof ManifestSchema>) =>
    Object.entries({
        dependencies: manifest.dependencies,
        devDependencies: manifest.devDependencies,
        peerDependencies: manifest.peerDependencies,
        optionalDependencies: manifest.optionalDependencies,
    }).flatMap(([field, ranges]) =>
        Object.entries(ranges)
            .filter(
                ([, range]) =>
                    range.startsWith('catalog:') ||
                    range.startsWith('workspace:')
            )
            .map(([name, range]) => `${field}.${name}: ${range}`)
    )

/** Packs the package and checks the packed manifest; throws on a problem. */
const checkPack = async ({ work_dir }: { work_dir: string }) => {
    await run({
        cmd: [process.execPath, 'pm', 'pack', '--destination', work_dir],
        cwd: PACKAGE_DIR,
    })
    const tarball = (await readdir(work_dir)).find((file) =>
        file.endsWith('.tgz')
    )
    if (tarball === undefined) throw new Error('bun pm pack made no tarball')
    await run({
        cmd: ['tar', '-xzf', tarball, 'package/package.json'],
        cwd: work_dir,
    })
    const manifest = ManifestSchema.parse(
        await Bun.file(join(work_dir, 'package', 'package.json')).json()
    )
    const unresolved = unresolvedRanges(manifest)
    if (unresolved.length > 0) {
        throw new Error(
            `The packed package.json has unresolved ranges:\n  ${unresolved.join('\n  ')}`
        )
    }
    console.log(`${tarball}: no catalog: or workspace: ranges.`)
}

const work_dir = await mkdtemp(join(tmpdir(), 'luca-check-pack-'))
try {
    await checkPack({ work_dir })
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
} finally {
    await rm(work_dir, { recursive: true, force: true })
}
