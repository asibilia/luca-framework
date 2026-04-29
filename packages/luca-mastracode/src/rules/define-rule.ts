/**
 * defineRule — schema and type contract for repo-local rule packs.
 *
 * Rules live in `.luca/rules/*.ts` in the consuming repo. Each file
 * default-exports (or named-exports) one or more rules built with
 * `defineRule`. The harness discovers them at execute-verify time and
 * runs each rule against every file matching its `scope` glob.
 *
 * Rules return `RuleFinding[]` whose shape is intentionally compatible
 * with the `ReviewFinding` type in `pr-review/convergence.ts` so the
 * convergence detector can treat rule findings as a first-class
 * reviewer perspective.
 *
 * The `RuleFile` argument is hybrid: rules get raw `content` for cheap
 * regex checks, plus a lazy `ast()` getter for rules that need
 * structural matching. Parsing only happens when a rule actually calls
 * `ast()`, so simple rules stay fast.
 */
import type ts from 'typescript'

export type RuleSeverity =
    | 'must-fix'
    | 'should-fix'
    | 'nit'
    | 'info'

export interface RuleFinding {
    /** Stable id — typically `<rule.id>:<path>:<line>`. */
    id: string
    /** Path relative to repo root. */
    path: string
    /** 1-indexed line number. Omit for file-level findings. */
    line?: number
    /** Severity used by convergence promotion + execute verification. */
    severity: RuleSeverity
    /** Optional category (e.g. 'security', 'style'). */
    category?: string
    /** Short, action-oriented description. Surfaced in PR comments and review reports. */
    summary: string
    /** Optional longer explanation rendered in postmortem reports. */
    detail?: string
}

/**
 * The argument passed to a rule's `check` function.
 * `content` is the raw file text. `ast()` returns a parsed TypeScript
 * SourceFile lazily on first call and caches the result.
 */
export interface RuleFile {
    /** Path relative to the repo root. */
    path: string
    /** Absolute filesystem path. */
    absolutePath: string
    /** Raw file content. */
    content: string
    /**
     * Parse the file as a TypeScript SourceFile.
     *
     * Uses the host TypeScript installation. `ScriptKind` is inferred
     * from the file extension. Returns `null` for files the parser
     * cannot handle (binary, unknown extension).
     *
     * Result is cached per RuleFile instance; subsequent calls in the
     * same rule (or in different rules processing the same file in the
     * same run) reuse the parse.
     */
    ast(): ts.SourceFile | null
}

export interface RuleDefinition {
    /** Unique stable id, e.g. `convex/require-admin-identity`. Used for finding ids and pitfall keys. */
    id: string
    /** Default severity for findings produced by this rule. Individual findings may override via the `severity` field. */
    severity: RuleSeverity
    /** Short human-readable description shown in `--list` output and postmortem reports. */
    description: string
    /**
     * Glob (or array of globs) matched against repo-relative paths.
     * Rule runs once per matching file. Use the literal string `'repo'`
     * to declare a rule that runs once per repo with `path: ''` passed
     * in (the runner synthesizes a single RuleFile rooted at the repo).
     * Use repo scope only for cross-file invariants.
     */
    scope: string | string[] | 'repo'
    /** Optional category surfaced in findings. */
    category?: string
    /** Optional list of paths to exclude (relative to repo root). */
    exclude?: string | string[]
    /**
     * The rule body. Must be sync. Returns an array of findings; an
     * empty array means the rule passed for this file. Throwing is
     * caught by the runner and reported as a rule-error finding so a
     * single broken rule cannot crash the run.
     */
    check: (file: RuleFile) => RuleFinding[]
}

/**
 * Author entry point. Wraps the input so future versions can add
 * runtime validation, deprecation warnings, or schema migration
 * without breaking existing rule packs.
 */
export function defineRule(rule: RuleDefinition): RuleDefinition {
    if (!rule.id || typeof rule.id !== 'string') {
        throw new Error('defineRule: rule.id is required and must be a string')
    }
    if (!rule.scope) {
        throw new Error(`defineRule(${rule.id}): scope is required`)
    }
    if (typeof rule.check !== 'function') {
        throw new Error(`defineRule(${rule.id}): check must be a function`)
    }
    return rule
}
