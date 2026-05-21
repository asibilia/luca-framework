#!/usr/bin/env bun
/**
 * Validate the packed luca-framework tarball before `npm publish`.
 *
 * Two checks; either failing exits 1.
 *
 * Check 1 — no private workspace package in `dependencies`.
 *   Private `@alecsibilia/*` packages (luca-core, luca-mastracode) are
 *   bundled into the tarball and never published to the registry. If one
 *   is listed under `dependencies`, the publish tooling rewrites its
 *   `workspace:*` spec to a concrete version and a consumer's package
 *   manager tries — and fails with a 404 — to resolve it from npm. Such
 *   packages belong in `devDependencies`, which consumers do not install.
 *
 * Check 2 — every Mastra-family dependency is exact-pinned (no ^, ~,
 *   range, or `*`). `mastracode` releases its harness alongside specific
 *   exact pins of `@mastra/core` and friends. Caret ranges let npm
 *   silently swap in a newer `@mastra/core` at install time, which has
 *   produced runtime breakage like
 *       `Error: Exhausted all fallback models. Last error: Unsupported role: signal`
 *   when `mastracode@0.19` (built against `@mastra/core@1.34`) ended up
 *   paired with a stale older core. Pinning eliminates that drift class.
 *
 * This runs in the publish job, after `bun pm pack`, before `npm publish`.
 *
 * Usage: bun run scripts/validate-tarball-deps.ts [path/to/tarball.tgz]
 *        (defaults to packages/luca-framework/.pack/*.tgz)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PINNED_PREFIXES = ['mastracode', '@mastra/']
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/

const isMastraFamilyDep = (name: string): boolean =>
    PINNED_PREFIXES.some(
        (p) => name === p.replace(/\/$/, '') || name.startsWith(p)
    )

/**
 * Names of every workspace package marked `private: true`. These are
 * bundled into publishable tarballs and never published standalone, so
 * they must never appear in a published package's `dependencies`.
 *
 * Derived from the workspace itself so a newly added private package is
 * covered automatically — and a package that later drops `private` is
 * automatically allowed.
 */
function collectPrivateWorkspacePackages(packagesDir: string): Set<string> {
    const names = new Set<string>()
    if (!existsSync(packagesDir)) return names
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const manifest = resolve(packagesDir, entry.name, 'package.json')
        if (!existsSync(manifest)) continue
        try {
            const p = JSON.parse(readFileSync(manifest, 'utf-8')) as {
                name?: string
                private?: boolean
            }
            if (p.private === true && typeof p.name === 'string') {
                names.add(p.name)
            }
        } catch {
            // Unreadable/malformed manifest — skip it.
        }
    }
    return names
}

const pkgDir = resolve(import.meta.dir, '..')
const tarballArg = process.argv[2]

let tarball: string
if (tarballArg) {
    tarball = resolve(tarballArg)
} else {
    const packDir = resolve(pkgDir, '.pack')
    if (!existsSync(packDir)) {
        console.error(
            `[validate-tarball-deps] No tarball directory at ${packDir}. ` +
                `Run \`bun pm pack --destination ./.pack\` first.`
        )
        process.exit(1)
    }
    const tgz = readdirSync(packDir).filter((f) => f.endsWith('.tgz'))
    if (tgz.length === 0) {
        console.error(
            `[validate-tarball-deps] No tarball found in ${packDir}. ` +
                `Run \`bun pm pack --destination ./.pack\` first.`
        )
        process.exit(1)
    }
    if (tgz.length > 1) {
        console.error(
            `[validate-tarball-deps] Multiple tarballs found in ${packDir}: ${tgz.join(', ')}. ` +
                `Pass the tarball path explicitly.`
        )
        process.exit(1)
    }
    tarball = resolve(packDir, tgz[0]!)
}

const result = spawnSync('tar', ['-xzOf', tarball, 'package/package.json'], {
    encoding: 'utf-8',
})
if (result.error || result.status === null) {
    console.error(
        `[validate-tarball-deps] Failed to spawn \`tar\` for ${tarball}: ` +
            `${result.error?.message ?? 'process did not exit normally'}`
    )
    process.exit(1)
}
if (result.status !== 0) {
    console.error(
        `[validate-tarball-deps] \`tar\` exited ${result.status} reading ${tarball}: ` +
            `${result.stderr || '(no stderr)'}`
    )
    process.exit(1)
}

let pkg: { dependencies?: Record<string, string> }
try {
    pkg = JSON.parse(result.stdout)
} catch (err) {
    console.error(
        `[validate-tarball-deps] Failed to parse package.json from ${tarball}: ` +
            `${(err as Error).message}`
    )
    process.exit(1)
}
const deps: Record<string, string> = pkg.dependencies ?? {}

console.log(`[validate-tarball-deps] Inspecting ${tarball}`)

// --- Check 1: no private workspace package leaked into `dependencies` ---
const privatePkgs = collectPrivateWorkspacePackages(resolve(pkgDir, '..'))
const privateLeaks = Object.keys(deps).filter((name) => privatePkgs.has(name))
if (privateLeaks.length > 0) {
    console.error(
        `\n[validate-tarball-deps] FAIL: ${privateLeaks.length} private ` +
            `workspace package(s) leaked into the published \`dependencies\`:`
    )
    for (const name of privateLeaks) {
        console.error(
            `  - ${name}: "${deps[name]}" — private packages are bundled into ` +
                `the tarball, not published to npm. Move it to devDependencies ` +
                `(consumers do not install devDependencies).`
        )
    }
    process.exit(1)
}
console.log(`  ✔ no private workspace package in dependencies`)

// --- Check 2: every Mastra-family dep is exact-pinned ---
console.log(`  Mastra deps must be exact-pinned (no ^, no ~, no ranges).`)

const violations: { name: string; spec: string }[] = []
for (const [name, spec] of Object.entries(deps)) {
    if (!isMastraFamilyDep(name)) continue
    const ok = EXACT_VERSION_RE.test(spec)
    console.log(`  ${ok ? '✔' : '✘'} ${name}@${spec}`)
    if (!ok) {
        violations.push({ name, spec })
    }
}

if (violations.length > 0) {
    console.error(
        `\n[validate-tarball-deps] FAIL: ${violations.length} Mastra dep(s) are not exact-pinned:`
    )
    for (const v of violations) {
        console.error(
            `  - ${v.name}: "${v.spec}" (must be exact, e.g. "1.34.0")`
        )
    }
    console.error(
        `\nFix: update the catalog in the root package.json to use exact versions ` +
            `(remove leading ^ or ~), then \`bun install\` and re-pack.`
    )
    process.exit(1)
}

console.log(`\n[validate-tarball-deps] OK: all Mastra deps exact-pinned.`)
