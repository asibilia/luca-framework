#!/usr/bin/env bun
/**
 * compile CLI — driver for the luca-tools artifact compiler.
 *
 * Two ways to invoke:
 *
 *   bun src/compile/bin/compile.ts --manifest <path> [--out <path>]
 *     - `--manifest` is a TS or JS module whose default export is an
 *       array of Artifact objects, OR a function returning that array
 *       (sync or async). Anything that can be `await import()`-ed.
 *     - `--out` defaults to `<package-root>/dist/claude/` so the
 *       repo's tracked .claude/ and skills/ are not clobbered while
 *       developing the compiler (per the D-2 task contract).
 *
 *   bun run --filter @alecsibilia/luca-tools compile -- \
 *     --manifest <path> [--out <path>]
 *     - Same thing through the workspace runner.
 *
 * The CLI's job is to:
 *   1. Parse argv into a small, typed shape.
 *   2. Resolve + load the manifest module.
 *   3. Validate it's an Artifact[] (we do a runtime structural check
 *      — every entry must have a `.kind` string).
 *   4. Call `compile()` from `../index.ts`.
 *   5. Print a deterministic report to stdout (so callers can pipe it).
 *
 * Exits with code 0 on success, 1 on any failure (missing argv,
 * unresolvable manifest, malformed artifact list, emitter throw).
 *
 * NOT a build:all — this is a small, foreground, intentional invoke.
 * (build:all crashes Claude Code; we never run it.)
 */
import { resolve } from 'node:path'

import { stringifyError } from '@alecsibilia/luca-core'

import { type Artifact, compile } from '../index.ts'

interface ParsedArgs {
    manifest: string
    out: string
}

function parseArgs(argv: readonly string[]): ParsedArgs {
    // We accept long flags only (`--manifest`, `--out`). No aliases —
    // this CLI is a thin driver; brevity matters less than legibility
    // in CI logs and shell scripts.
    let manifest: string | null = null
    let out: string | null = null
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i]
        if (token === '--manifest') {
            manifest = argv[++i] ?? null
        } else if (token === '--out') {
            out = argv[++i] ?? null
        } else if (token === '--help' || token === '-h') {
            printHelp()
            process.exit(0)
        } else if (token !== undefined && token.startsWith('--manifest=')) {
            manifest = token.slice('--manifest='.length)
        } else if (token !== undefined && token.startsWith('--out=')) {
            out = token.slice('--out='.length)
        } else if (token !== undefined) {
            console.error(`compile: unknown argument: ${token}`)
            printHelp()
            process.exit(1)
        }
    }
    if (manifest === null) {
        console.error('compile: --manifest <path> is required')
        printHelp()
        process.exit(1)
    }
    return {
        manifest: resolve(process.cwd(), manifest),
        out: resolve(process.cwd(), out ?? defaultOut()),
    }
}

function defaultOut(): string {
    // Package-relative default — keeps the dev surface out of the repo's
    // tracked .claude/ and skills/ directories while D-2 stabilizes.
    // The path is resolved against process.cwd(); the script docstring
    // calls this out so callers can override per their own workflow.
    return 'packages/luca-tools/dist/claude'
}

function printHelp(): void {
    const lines = [
        'compile — luca-tools artifact compiler',
        '',
        'Usage:',
        '  bun src/compile/bin/compile.ts --manifest <path> [--out <path>]',
        '',
        'Options:',
        '  --manifest <path>  TS/JS module whose default export is an',
        '                     Artifact[] (or an async function returning one).',
        '  --out <path>       Output root (default: packages/luca-tools/dist/claude).',
        '  --help, -h         Print this help.',
        '',
    ]
    console.log(lines.join('\n'))
}

/**
 * Load the manifest module and coerce its default export into an
 * Artifact[]. Accepts either a literal array or a function returning
 * one (sync or async).
 */
async function loadManifest(modulePath: string): Promise<readonly Artifact[]> {
    let mod: unknown
    try {
        mod = await import(modulePath)
    } catch (err) {
        console.error(`compile: failed to import manifest ${modulePath}`)
        console.error(stringifyError(err))
        process.exit(1)
    }
    const raw = (mod as { default?: unknown }).default
    let resolved: unknown = raw
    if (typeof raw === 'function') {
        resolved = await (raw as () => unknown | Promise<unknown>)()
    }
    if (!Array.isArray(resolved)) {
        console.error(
            'compile: manifest default export must be an Artifact[] (or a ' +
                'function returning one). Got: ' +
                typeof resolved,
        )
        process.exit(1)
    }
    // Runtime structural check: every entry must carry a string `kind`.
    // The full Artifact validation happens inside the Define* factories
    // at authoring time — by the time we see them here, we trust them.
    // This is a defense against someone passing a raw config object.
    for (const [i, entry] of resolved.entries()) {
        if (
            entry === null ||
            typeof entry !== 'object' ||
            typeof (entry as { kind?: unknown }).kind !== 'string'
        ) {
            console.error(
                `compile: manifest entry ${i} is not a frozen Artifact ` +
                    '(missing `.kind` string). Was it constructed with one of ' +
                    'the Define* factories?',
            )
            process.exit(1)
        }
    }
    return resolved as readonly Artifact[]
}

/**
 * Format the compile report as a stable, deterministic string. We
 * group by kind, then list paths within each group in input order.
 */
function formatReport(report: Awaited<ReturnType<typeof compile>>): string {
    const lines: string[] = []
    lines.push('compile: report')
    lines.push('---')
    for (const [kind, count] of Object.entries(report.counts)) {
        lines.push(`  ${kind}: ${count}`)
    }
    if (report.settingsPath !== null) {
        lines.push(`  settings: ${report.settingsPath}`)
    }
    lines.push('---')
    lines.push('paths:')
    for (const p of report.paths) {
        lines.push(`  ${p.kind}\t${p.path}`)
    }
    return lines.join('\n')
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2))
    const artifacts = await loadManifest(args.manifest)
    const report = await compile(artifacts, args.out)
    console.log(formatReport(report))
}

await main()
