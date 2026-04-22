import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

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

    const include = ['src', 'commands', 'rules', 'skills']
    for (const dir of include) {
        const from = join(mastracodeRoot, dir)
        if (!existsSync(from)) continue
        cpSync(from, join(target, dir), {
            recursive: true,
            filter: (src) => !src.includes(`${dir}/__tests__`),
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
            bundleMastracode()
        },
    },
})
