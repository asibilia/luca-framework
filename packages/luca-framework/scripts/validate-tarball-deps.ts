#!/usr/bin/env bun
/**
 * Validate that the packed tarball pins every Mastra-family dependency
 * to an exact version (no caret, no tilde, no range, no `*`).
 *
 * Why: `mastracode` releases its harness alongside specific exact pins
 * of `@mastra/core` and friends. Publishing with caret ranges lets npm
 * silently swap in a newer `@mastra/core` at user install time, which
 * has produced runtime breakage like
 *     `Error: Exhausted all fallback models. Last error: Unsupported role: signal`
 * when `mastracode@0.19` (built against `@mastra/core@1.34`) ended up
 * paired with a stale older core that does not recognise the `signal`
 * message role. Pinning eliminates this drift class entirely.
 *
 * This runs in the publish job, after `bun pm pack`, before
 * `npm publish`. Exit 1 if any Mastra dep in the packed
 * `package.json` is non-exact.
 *
 * Usage: bun run scripts/validate-tarball-deps.ts [path/to/tarball.tgz]
 *        (defaults to packages/luca-framework/.pack/*.tgz)
 */
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const PINNED_PREFIXES = ['mastracode', '@mastra/']
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/

const isMastraFamilyDep = (name: string): boolean =>
    PINNED_PREFIXES.some(
        (p) => name === p.replace(/\/$/, '') || name.startsWith(p)
    )

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

console.log(
    `[validate-tarball-deps] Inspecting ${tarball}\n` +
        `  Mastra deps must be exact-pinned (no ^, no ~, no ranges).`
)

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
        console.error(`  - ${v.name}: "${v.spec}" (must be exact, e.g. "1.34.0")`)
    }
    console.error(
        `\nFix: update the catalog in the root package.json to use exact versions ` +
            `(remove leading ^ or ~), then \`bun install\` and re-pack.`
    )
    process.exit(1)
}

console.log(`\n[validate-tarball-deps] OK: all Mastra deps exact-pinned.`)
