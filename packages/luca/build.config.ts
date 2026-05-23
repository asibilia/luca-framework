/**
 * Build config for @alecsibilia/luca — the publishable umbrella package.
 *
 * Bundles the three private workspace siblings — @alecsibilia/luca-cli,
 * @alecsibilia/luca-core, @alecsibilia/luca-tools — into a single
 * self-contained dist/ via unbuild's `inlineDependencies: true`. End
 * users `npm install @alecsibilia/luca` and never see the sub-packages.
 *
 * The artifact set shipped with luca-tools (the compiled .claude/
 * skills/, commands/, agents/, hooks/) is NOT carried here yet — that
 * lands in F-2 (rewire `luca init` to consume them at install time)
 * and F-3 (publish prep). For F-1, the build produces dist/index.mjs
 * with all three workspace siblings inlined as source.
 *
 * Precedent: packages/luca-framework/build.config.ts already uses this
 * pattern to inline luca-core + bundle mastracode for the legacy
 * 12.0.0-alpha tarball.
 */
import { readFileSync } from 'node:fs'

import { defineBuildConfig } from 'unbuild'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineBuildConfig({
    entries: ['src/index'],
    clean: true,
    declaration: true,
    rollup: {
        emitCJS: false,
        // Roll workspace:* siblings into dist/index.mjs. Without this
        // the published tarball would carry unresolvable workspace
        // references — luca-cli / luca-core / luca-tools are PRIVATE
        // and never see npm.
        inlineDependencies: true,
        replace: {
            preventAssignment: true,
            values: {
                // luca-cli reads its version through a `__LUCA_VERSION__`
                // sentinel that unbuild's replace plugin substitutes at
                // build time. Since we inline luca-cli into this
                // tarball, this build is now the one that has to do the
                // substitution — luca-cli's own build never runs in
                // production.
                __LUCA_VERSION__: JSON.stringify(pkg.version),
            },
        },
    },
    // Everything EXCEPT the three workspace siblings stays external.
    // unbuild treats anything imported as `node:*` as external by
    // default; this list adds the runtime npm deps declared in
    // package.json so they are NOT inlined.
    externals: [
        '@clack/prompts',
        'citty',
        'consola',
        'pathe',
        'semver',
        'shell-quote',
        'update-notifier',
        'zod',
    ],
})
