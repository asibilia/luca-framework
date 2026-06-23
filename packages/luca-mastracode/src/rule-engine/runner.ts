/**
 * Rules runner — discover, load, and execute repo-local rule packs.
 *
 * Discovery:
 *   - Walks `.luca/rules/` (default) for `*.ts` and `*.js` files,
 *     ignoring `*.test.ts`, `*.spec.ts`, and dotfiles.
 *   - Dynamically imports each file. Pulls every export that looks
 *     like a `RuleDefinition` (default export, named exports, or
 *     arrays thereof). A single file may export multiple rules.
 *
 * Execution:
 *   - For each rule, resolve the `scope` glob(s) into a candidate
 *     file list (excluding paths in `exclude`).
 *   - Build one `RuleFile` per candidate with a lazy AST parser.
 *   - Call `rule.check(file)` and collect findings.
 *   - Errors thrown by a rule become a single `rule-error` finding
 *     so one bad rule cannot crash the run.
 *
 * Reporting:
 *   - Returns `RuleRunReport` with all findings, per-rule timing,
 *     and any load/runtime errors. Caller decides what to do
 *     (block phase, surface as advisory, etc.).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { stringifyError } from '@alecsibilia/luca-core'
import type ts from 'typescript'

import type { RuleDefinition, RuleFile, RuleFinding } from './define-rule.js'

// TypeScript is a devDependency of this package, but rule consumers
// might invoke the runner from a project that doesn't have `typescript`
// installed. We resolve it lazily via createRequire so AST-using rules
// can degrade gracefully (ast() returns null) when the package is
// missing, while regex-only rules keep working.
let tsModuleCache: typeof ts | null | undefined = undefined
function resolveTypeScript(): typeof ts | null {
    if (tsModuleCache !== undefined) return tsModuleCache
    try {
        const req = createRequire(import.meta.url)
        tsModuleCache = req('typescript') as typeof ts
    } catch {
        tsModuleCache = null
    }
    return tsModuleCache
}

export interface RuleLoadError {
    file: string
    message: string
}

export interface RuleExecutionError {
    ruleId: string
    path: string
    message: string
}

export interface RuleRunReport {
    /** Number of rule files discovered. */
    rulesFilesDiscovered: number
    /** Number of rules successfully loaded. */
    rulesLoaded: number
    /** Per-rule timing in milliseconds. */
    timings: Record<string, number>
    /** Total findings produced across all rules. */
    findings: RuleFinding[]
    /** Files that failed to load (syntax error, throw on import, etc.). */
    loadErrors: RuleLoadError[]
    /** Rule executions that threw at runtime. */
    executionErrors: RuleExecutionError[]
}

/**
 * Recursively walk a directory and return absolute paths of files
 * matching the provided extensions. Skips dotfiles and `node_modules`.
 */
function walkDir(
    dir: string,
    extensions: string[],
    out: string[] = []
): string[] {
    if (!existsSync(dir)) return out
    let entries: string[]
    try {
        entries = readdirSync(dir)
    } catch {
        return out
    }
    for (const name of entries) {
        if (name.startsWith('.') || name === 'node_modules') continue
        const full = join(dir, name)
        let stats
        try {
            stats = statSync(full)
        } catch {
            continue
        }
        if (stats.isDirectory()) {
            walkDir(full, extensions, out)
        } else if (extensions.includes(extname(name))) {
            // Skip test files
            if (name.endsWith('.test.ts')) continue
            if (name.endsWith('.test.js')) continue
            if (name.endsWith('.spec.ts')) continue
            if (name.endsWith('.spec.js')) continue
            out.push(full)
        }
    }
    return out
}

/**
 * Type guard — does this object look like a `RuleDefinition`?
 * We don't use `instanceof` because rule packs may import
 * `defineRule` from a different module instance after dynamic
 * import; we duck-type instead.
 */
function isRuleDefinition(value: unknown): value is RuleDefinition {
    if (!value || typeof value !== 'object') return false
    const v = value as Record<string, unknown>
    return (
        typeof v.id === 'string' &&
        typeof v.severity === 'string' &&
        typeof v.description === 'string' &&
        typeof v.check === 'function' &&
        v.scope !== undefined &&
        v.scope !== null
    )
}

/**
 * Pull all rule definitions from a dynamically-imported module.
 * Accepts default export, named exports, and arrays.
 */
function extractRules(module: unknown): RuleDefinition[] {
    if (!module || typeof module !== 'object') return []
    const collected: RuleDefinition[] = []
    const visit = (value: unknown): void => {
        if (isRuleDefinition(value)) {
            collected.push(value)
            return
        }
        if (Array.isArray(value)) {
            for (const v of value) visit(v)
            return
        }
        // Don't recurse into nested objects to avoid pulling in random
        // structures that happen to have an `id` and a `check` function.
    }
    for (const key of Object.keys(module)) {
        visit((module as Record<string, unknown>)[key])
    }
    return collected
}

/**
 * Discover and load all rule definitions from a directory.
 */
export async function loadRules(opts: { rulesDir: string }): Promise<{
    rules: RuleDefinition[]
    filesDiscovered: number
    loadErrors: RuleLoadError[]
}> {
    const { rulesDir } = opts
    const loadErrors: RuleLoadError[] = []
    const files = walkDir(rulesDir, ['.ts', '.mts', '.js', '.mjs'])
    const rules: RuleDefinition[] = []
    const seenIds = new Set<string>()

    for (const file of files) {
        try {
            const url = pathToFileURL(file).href
            const mod = await import(url)
            for (const rule of extractRules(mod)) {
                if (seenIds.has(rule.id)) {
                    loadErrors.push({
                        file,
                        message: `duplicate rule id: ${rule.id} (already defined elsewhere)`,
                    })
                    continue
                }
                seenIds.add(rule.id)
                rules.push(rule)
            }
        } catch (err) {
            loadErrors.push({
                file,
                message: stringifyError(err),
            })
        }
    }

    return { rules, filesDiscovered: files.length, loadErrors }
}

/**
 * Convert a glob-or-glob-array into an array.
 */
function asArray(value: string | string[] | undefined): string[] {
    if (value === undefined) return []
    return Array.isArray(value) ? value : [value]
}

/**
 * Resolve a rule's `scope` against the repo root. Returns relative
 * paths. Uses `Bun.Glob` when available (bundled with Bun), else
 * falls back to a directory walk + minimatch-style filter.
 */
function resolveScope(opts: {
    repoRoot: string
    scope: string | string[] | 'repo'
    exclude: string[]
}): string[] {
    const { repoRoot, scope, exclude } = opts
    if (scope === 'repo') return ['']

    const globs = asArray(scope as string | string[])
    if (globs.length === 0) return []

    const collected = new Set<string>()
    // Bun's runtime provides `Bun.Glob` with `scanSync`. We are
    // running inside Bun (per the project's bunfig.toml).
    const BunGlobal = (
        globalThis as unknown as {
            Bun?: {
                Glob: new (pattern: string) => {
                    scanSync(opts: {
                        cwd: string
                        onlyFiles?: boolean
                        followSymlinks?: boolean
                    }): IterableIterator<string>
                }
            }
        }
    ).Bun
    if (!BunGlobal?.Glob) {
        throw new Error(
            'rules-runner: Bun runtime required for glob scope resolution'
        )
    }
    for (const pattern of globs) {
        const glob = new BunGlobal.Glob(pattern)
        for (const match of glob.scanSync({ cwd: repoRoot, onlyFiles: true })) {
            collected.add(match)
        }
    }

    if (exclude.length > 0) {
        const excludeMatches = new Set<string>()
        for (const pattern of exclude) {
            const glob = new BunGlobal.Glob(pattern)
            for (const match of glob.scanSync({
                cwd: repoRoot,
                onlyFiles: true,
            })) {
                excludeMatches.add(match)
            }
        }
        for (const path of collected) {
            if (excludeMatches.has(path)) collected.delete(path)
        }
    }

    return [...collected]
}

/**
 * Infer a TypeScript ScriptKind from a file extension.
 */
function scriptKindFor(tsMod: typeof ts, path: string): ts.ScriptKind {
    const ext = extname(path).toLowerCase()
    switch (ext) {
        case '.ts':
            return tsMod.ScriptKind.TS
        case '.tsx':
            return tsMod.ScriptKind.TSX
        case '.js':
        case '.mjs':
        case '.cjs':
            return tsMod.ScriptKind.JS
        case '.jsx':
            return tsMod.ScriptKind.JSX
        case '.json':
            return tsMod.ScriptKind.JSON
        default:
            return tsMod.ScriptKind.Unknown
    }
}

/**
 * Build a hybrid RuleFile with raw content + lazy AST.
 * AST parses are cached on the RuleFile instance, so multiple rules
 * processing the same file pay the parse cost only once.
 */
function makeRuleFile(opts: {
    repoRoot: string
    relPath: string
    contentCache: Map<string, string>
    astCache: Map<string, ts.SourceFile | null>
}): RuleFile | null {
    const { repoRoot, relPath, contentCache, astCache } = opts
    const absolutePath = resolve(repoRoot, relPath)

    let content = contentCache.get(relPath)
    if (content === undefined) {
        try {
            content = readFileSync(absolutePath, 'utf-8')
        } catch {
            return null
        }
        contentCache.set(relPath, content)
    }

    return {
        path: relPath,
        absolutePath,
        content,
        ast(): ts.SourceFile | null {
            if (astCache.has(relPath)) return astCache.get(relPath) ?? null
            const tsMod = resolveTypeScript()
            if (!tsMod) {
                astCache.set(relPath, null)
                return null
            }
            const kind = scriptKindFor(tsMod, relPath)
            if (kind === tsMod.ScriptKind.Unknown) {
                astCache.set(relPath, null)
                return null
            }
            try {
                const sf = tsMod.createSourceFile(
                    relPath,
                    content!,
                    tsMod.ScriptTarget.Latest,
                    /* setParentNodes */ true,
                    kind
                )
                astCache.set(relPath, sf)
                return sf
            } catch {
                astCache.set(relPath, null)
                return null
            }
        },
    }
}

/**
 * Run a set of loaded rules against the working tree.
 */
export function runRules(opts: { repoRoot: string; rules: RuleDefinition[] }): {
    timings: Record<string, number>
    findings: RuleFinding[]
    executionErrors: RuleExecutionError[]
} {
    const { repoRoot, rules } = opts
    const findings: RuleFinding[] = []
    const executionErrors: RuleExecutionError[] = []
    const timings: Record<string, number> = {}
    const contentCache = new Map<string, string>()
    const astCache = new Map<string, ts.SourceFile | null>()

    for (const rule of rules) {
        const start = performance.now()
        const exclude = asArray(rule.exclude)
        let candidates: string[]
        try {
            candidates = resolveScope({
                repoRoot,
                scope: rule.scope,
                exclude,
            })
        } catch (err) {
            executionErrors.push({
                ruleId: rule.id,
                path: '',
                message: `scope resolution failed: ${stringifyError(err)}`,
            })
            timings[rule.id] = performance.now() - start
            continue
        }

        for (const relPath of candidates) {
            // `scope: 'repo'` produces a single sentinel candidate (`''`). For
            // repo-scoped rules we synthesize a RuleFile pointing at the repo
            // root rather than trying to read it as a file.
            const file =
                relPath === ''
                    ? ({
                          path: '',
                          absolutePath: repoRoot,
                          content: '',
                          ast: () => null,
                      } satisfies RuleFile)
                    : makeRuleFile({
                          repoRoot,
                          relPath,
                          contentCache,
                          astCache,
                      })
            if (!file) continue
            try {
                const ruleFindings = rule.check(file)
                if (Array.isArray(ruleFindings)) {
                    for (const finding of ruleFindings) {
                        // Default the category from the rule when missing.
                        if (!finding.category && rule.category) {
                            finding.category = rule.category
                        }
                        findings.push(finding)
                    }
                }
            } catch (err) {
                executionErrors.push({
                    ruleId: rule.id,
                    path: relPath,
                    message: stringifyError(err),
                })
            }
        }

        timings[rule.id] = performance.now() - start
    }

    return { timings, findings, executionErrors }
}

/**
 * One-shot: discover, load, and run all rules in a repo's `.luca/rules/`.
 */
export async function discoverAndRun(opts: {
    repoRoot: string
    rulesDir?: string
}): Promise<RuleRunReport> {
    const repoRoot = isAbsolute(opts.repoRoot)
        ? opts.repoRoot
        : resolve(opts.repoRoot)
    const rulesDir = opts.rulesDir
        ? isAbsolute(opts.rulesDir)
            ? opts.rulesDir
            : resolve(repoRoot, opts.rulesDir)
        : join(repoRoot, '.luca', 'rules')

    const { rules, filesDiscovered, loadErrors } = await loadRules({ rulesDir })

    const { timings, findings, executionErrors } = runRules({
        repoRoot,
        rules,
    })

    return {
        rulesFilesDiscovered: filesDiscovered,
        rulesLoaded: rules.length,
        timings,
        findings,
        loadErrors,
        executionErrors,
    }
}

// Helper used below — kept private to avoid a circular re-export.
export function _formatRelative(repoRoot: string, absPath: string): string {
    return relative(repoRoot, absPath)
}
