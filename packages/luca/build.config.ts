/**
 * Build config for @alecsibilia/luca — the publishable umbrella package.
 *
 * Bundles the three private workspace siblings — @alecsibilia/luca-cli,
 * @alecsibilia/luca-core, @alecsibilia/luca-tools — into a single
 * self-contained dist/ via unbuild's `inlineDependencies: true`. End
 * users `npm install @alecsibilia/luca` and never see the sub-packages.
 *
 * F-2 also compiles the luca-tools artifact set (agents, subagents,
 * commands, skills, rules, settings.json) into `dist/claude/` as a
 * `build:done` post-step. `luca init` reads from that directory to
 * install agents/commands/skills into `~/.claude/` and to merge the
 * compiled `settings.json` into the user's global Claude settings.
 *
 * The umbrella's `files: ["bin", "dist", "README.md", "LICENSE"]`
 * already ships everything under `dist/` in the published tarball, so
 * the compiled artifact set lands in `node_modules/@alecsibilia/luca/
 * dist/claude/` after `npm install` — bit-identical across machines,
 * no per-install compilation required.
 *
 * Precedent: packages/luca-framework/build.config.ts uses the same
 * pattern (`hooks: { 'build:done': ... }`) to bundle luca-core +
 * mastracode for the legacy 12.0.0-alpha tarball.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

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
    hooks: {
        // F-2: compile the luca-tools artifact set after the JS bundle
        // is built. We import the manifest + compiler from the
        // workspace sibling and call compile() directly — this is
        // cheaper than spawning the compile CLI as a child process and
        // produces the same on-disk output.
        //
        // `build:done` fires after dist/index.mjs and the declarations
        // are written, so the dist directory exists and we can layer
        // `dist/claude/` underneath it.
        async 'build:done'() {
            const distClaude = resolve(join('dist', 'claude'))
            const { ARTIFACTS } = await import(
                '@alecsibilia/luca-tools/artifacts'
            )
            const { compile } = await import('@alecsibilia/luca-tools/compile')
            const report = await compile(ARTIFACTS, distClaude)
            // Soft log — unbuild's own log lines are noisy enough; we
            // just emit a one-line summary so the build output shows
            // that the artifact compile fired.
            const c = report.counts
            console.log(
                `[luca] compiled artifacts → ${distClaude} (agents:${c.agent} subagents:${c.subagent} commands:${c.command} skills:${c.skill} hooks:${c.hook} rules:${c.rule})`,
            )

            // B3 (parity-review §B3, F-2 known gap): the compiler emits
            // a `settings.json` referencing handler scripts at
            // `$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.ts`, but those
            // handler scripts live in source at
            // `packages/luca-tools/src/hooks/<name>/handler.ts`.
            //
            // We BUNDLE (not copy) each handler into
            // `dist/claude/.claude/hooks/<name>.ts`. The handlers import
            // private workspace packages (`@alecsibilia/luca-core/ledger`,
            // `/orchestration`, `/state`) that are inlined into THIS
            // package's CLI bundle but are NOT present in a consumer's
            // `node_modules`. A raw copy therefore fails at runtime with
            // `Cannot find module '@alecsibilia/luca-core/ledger'` on every
            // hook fire. `bun build --target bun` inlines those deps so the
            // emitted handler is self-contained and runs anywhere bun does.
            //
            // We shell out to `bun build` rather than `Bun.build` because
            // this hook runs under unbuild's (Node) runtime, where the
            // `Bun` global is not available. `bun` is a hard prerequisite
            // of this repo, so it is always on PATH at build time.
            //
            // `packages/luca-tools/` is resolved relative to the umbrella
            // (cwd is `packages/luca/` at build time), so the sibling lives
            // at `../luca-tools/src/hooks/`.
            const hooksSrcRoot = resolve('..', 'luca-tools', 'src', 'hooks')
            const hooksDestRoot = join(distClaude, '.claude', 'hooks')
            const bundledHookHandlers: string[] = []
            if (existsSync(hooksSrcRoot)) {
                mkdirSync(hooksDestRoot, { recursive: true })
                for (const entry of readdirSync(hooksSrcRoot)) {
                    const dir = join(hooksSrcRoot, entry)
                    if (!statSync(dir).isDirectory()) continue
                    const handlerSrc = join(dir, 'handler.ts')
                    if (!existsSync(handlerSrc)) continue
                    const handlerDest = join(hooksDestRoot, `${entry}.ts`)
                    mkdirSync(dirname(handlerDest), { recursive: true })
                    // Throws (failing the umbrella build) if a handler can't
                    // be bundled — better than silently shipping a broken,
                    // unresolvable hook. stderr is inherited so the bundler's
                    // diagnostics are visible in the build/CI log on failure;
                    // stdout is suppressed to keep the success path quiet
                    // (the one-line summary below reports what was bundled).
                    execFileSync(
                        'bun',
                        [
                            'build',
                            handlerSrc,
                            '--target',
                            'bun',
                            '--outfile',
                            handlerDest,
                        ],
                        { stdio: ['ignore', 'ignore', 'inherit'] },
                    )
                    bundledHookHandlers.push(`${entry}.ts`)
                }
            }
            console.log(
                `[luca] bundled hook handlers → ${hooksDestRoot} (${bundledHookHandlers.length}: ${bundledHookHandlers.join(', ')})`,
            )

            // Statusline handler: same bundle-don't-copy rationale as the
            // hook handlers above. Emitted next to them under
            // `dist/claude/.claude/` so `luca init`'s install-statusline
            // helper can resolve it via resolveBundledArtifactsForHooks().
            const statuslineSrc = resolve(
                '..',
                'luca-tools',
                'src',
                'statusline',
                'handler.ts',
            )
            if (existsSync(statuslineSrc)) {
                const statuslineDest = join(
                    distClaude,
                    '.claude',
                    'luca-statusline.ts',
                )
                mkdirSync(dirname(statuslineDest), { recursive: true })
                execFileSync(
                    'bun',
                    [
                        'build',
                        statuslineSrc,
                        '--target',
                        'bun',
                        '--outfile',
                        statuslineDest,
                    ],
                    { stdio: ['ignore', 'ignore', 'inherit'] },
                )
                console.log(`[luca] bundled statusline → ${statuslineDest}`)
            }
        },
    },
})
