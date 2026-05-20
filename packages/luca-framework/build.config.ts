import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import { defineBuildConfig } from 'unbuild'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

/**
 * Copy the sibling `luca-mastracode` package — the custom Mastra Code harness
 * that is the core of the Luca framework — into `dist/mastracode/` so `luca
 * run` can spawn it from inside the published tarball. The mastracode package
 * is intentionally private and ships only as part of the framework; this step
 * is what makes it available to end users.
 *
 * Preserves the mastracode layout (src/, commands/, rules/, skills/) because
 * the harness does runtime `readFileSync` calls relative to `import.meta.url`.
 */
function bundleMastracode() {
    const mastracodeRoot = resolve(__dirname, '../luca-mastracode')
    const target = resolve(__dirname, 'dist/mastracode')

    if (!existsSync(mastracodeRoot)) {
        throw new Error(
            `[luca-framework build] Cannot bundle mastracode: ${mastracodeRoot} does not exist.`
        )
    }

    if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true })
    }
    mkdirSync(target, { recursive: true })

    const include = ['src', 'commands', 'rules', 'skills']
    for (const dir of include) {
        const from = join(mastracodeRoot, dir)
        if (!existsSync(from)) continue
        cpSync(from, join(target, dir), {
            recursive: true,
            filter: (src) => !src.includes(`${dir}${sep}__tests__`),
        })
    }
}

/**
 * Bundle the sibling `luca-core` package into `dist/node_modules/@alecsibilia/
 * luca-core/` so the bundled mastracode (which imports `@alecsibilia/luca-core`)
 * can resolve the dependency at runtime inside the published tarball.
 *
 * Node's resolution algorithm walks up from the requiring file looking for
 * `node_modules/<pkg>/`. Placing luca-core under `dist/node_modules/` means
 * any bundled mastracode file resolves the package without needing it to be
 * published to npm separately.
 *
 * luca-core is intentionally private and ships only as part of the
 * luca-framework tarball.
 */
function bundleLucaCore() {
    const lucaCoreRoot = resolve(__dirname, '../luca-core')
    const target = resolve(
        __dirname,
        'dist/node_modules/@alecsibilia/luca-core'
    )

    if (!existsSync(lucaCoreRoot)) {
        throw new Error(
            `[luca-framework build] Cannot bundle luca-core: ${lucaCoreRoot} does not exist.`
        )
    }

    if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true })
    }
    mkdirSync(target, { recursive: true })

    // Copy package.json so the `exports` map + `main` field resolve.
    cpSync(join(lucaCoreRoot, 'package.json'), join(target, 'package.json'))

    // Copy src/, excluding tests.
    const srcFrom = join(lucaCoreRoot, 'src')
    if (existsSync(srcFrom)) {
        cpSync(srcFrom, join(target, 'src'), {
            recursive: true,
            filter: (src) =>
                !src.endsWith('.test.ts') && !src.endsWith('.spec.ts'),
        })
    }
}

export default defineBuildConfig({
    entries: ['src/index'],
    clean: true,
    declaration: true,
    rollup: {
        emitCJS: false,
        inlineDependencies: true,
        replace: {
            preventAssignment: true,
            values: {
                __LUCA_VERSION__: JSON.stringify(pkg.version),
            },
        },
    },
    externals: [
        'citty',
        'consola',
        '@clack/prompts',
        'pathe',
        'semver',
        'zod',
        'update-notifier',
    ],
    hooks: {
        'build:done': () => {
            bundleLucaCore()
            bundleMastracode()
        },
    },
})
