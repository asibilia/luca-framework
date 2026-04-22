import { readFileSync } from 'node:fs'

import { defineBuildConfig } from 'unbuild'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

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
})
