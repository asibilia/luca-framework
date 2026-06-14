import { parse, type ParseEntry } from 'shell-quote'

export type BashCategory =
    | 'bash-readonly'
    | 'bash-mutate'
    | 'bash-commit'
    | 'luca-write'
    | 'denied'

export interface ClassifyBashResult {
    category: BashCategory
    /** Human-readable explanation when category is 'denied'. */
    reason?: string
    /** Paths the command writes to (for path-level allow/deny). */
    targetPaths: string[]
}

// ---------------------------------------------------------------------------
// Command allowlists
// ---------------------------------------------------------------------------

const READONLY_COMMANDS = new Set([
    // Shell navigation/no-ops: mutate shell state, not files — benign for
    // the file/repo-mutation policy this classifier enforces. `cd` is the
    // big one: agents prefix nearly every command with `cd <dir> && …`, so
    // omitting it made every compound command classify as a mutate.
    'cd',
    'pushd',
    'popd',
    'ls',
    'cat',
    'grep',
    'find',
    'pwd',
    'head',
    'tail',
    'wc',
    'basename',
    'dirname',
    'type',
    'which',
    'echo',
    'printf',
    'true',
    'false',
    // Read-only text filters. These read stdin/files and write to stdout —
    // they never mutate files on their own. Omitting them made any pipeline
    // through a filter (e.g. `find . | sort`) promote to bash-mutate via the
    // unknown-command fallback, blocking read-only inspection in restrictive
    // phases (v13 run report, M1). `tee`/`xargs` are deliberately EXCLUDED:
    // `tee` writes files and `xargs` runs an arbitrary (possibly mutating)
    // command, so they stay conservative.
    'sort',
    'uniq',
    'cut',
    'tr',
    'comm',
    'diff',
    'jq',
    'rg',
    'column',
    'nl',
    'tac',
    'rev',
    'paste',
    'fold',
    'join',
    // NOTE: `playwright-cli` is NOT in this set — it has a dedicated
    // clause (step 4c in classifySubcommand) that extracts `--filename`
    // output paths and enforces the `.playwright-cli/` artifact dir.
])

const GIT_READONLY_SUBCOMMANDS = new Set([
    'status',
    'log',
    'diff',
    'show',
    'branch',
    'remote',
    'rev-parse',
    'rev-list',
    'config',
    'describe',
    'blame',
])

const GIT_COMMIT_SUBCOMMANDS = new Set(['commit', 'push', 'tag'])

const GIT_MUTATE_SUBCOMMANDS = new Set([
    'add',
    'mv',
    'rm',
    'checkout',
    'reset',
    'restore',
    'switch',
    'stash',
    'merge',
    'rebase',
    'cherry-pick',
    'apply',
    'clean',
    'fetch',
    'pull',
    'clone',
    'init',
    'gc',
    'prune',
])

const GH_READONLY_PATTERNS: Array<[string, string]> = [
    ['pr', 'view'],
    ['pr', 'list'],
    ['pr', 'checks'],
    ['pr', 'status'],
    ['pr', 'diff'],
    ['issue', 'view'],
    ['issue', 'list'],
    ['repo', 'view'],
    ['release', 'list'],
    ['release', 'view'],
    ['api', 'GET'],
]

const GH_COMMIT_PATTERNS: Array<[string, string]> = [
    ['pr', 'create'],
    ['pr', 'merge'],
    ['pr', 'close'],
    ['pr', 'comment'],
    ['issue', 'create'],
    ['issue', 'close'],
    ['issue', 'comment'],
    ['release', 'create'],
]

const MUTATE_COMMANDS = new Set([
    'cp',
    'mv',
    'rm',
    'mkdir',
    'rmdir',
    'touch',
    'ln',
    'install',
    'unlink',
    'chmod',
    'chown',
    'sed',
    'awk', // can have -i side effects via gsub('foo', val, file) — conservative
    'patch',
    'tar',
    'unzip',
    'zip',
])

const PKG_MUTATE_PATTERNS: Array<[string, ...string[]]> = [
    ['bun', 'install'],
    ['bun', 'add'],
    ['bun', 'remove'],
    ['bun', 'update'],
    ['bun', 'run', 'build'],
    ['bunx'], // generic — could mutate via build
    ['npm', 'install'],
    ['npm', 'i'],
    ['npm', 'run', 'build'],
    ['yarn', 'install'],
    ['yarn', 'add'],
    ['pnpm', 'install'],
    ['pnpm', 'add'],
]

const ALWAYS_DENIED_COMMANDS = new Set(['eval', 'source', '.'])

// ---------------------------------------------------------------------------
// `luca` CLI command recognition (v13 write-surface, Phase C)
//
// The `luca` CLI is the structured/operational write surface. The hook
// recognises `luca <noun> <verb>` invocations so they classify as a
// dedicated category instead of falling through to the generic
// unknown-command → bash-mutate path (which the stage-gate matrix would
// block in restrictive phases).
//
// The matrix allows `luca-write` in every non-IDLE phase; the CLI itself
// self-enforces each verb's per-step phase precondition (WRITE_COMMAND_PHASES),
// so the hook only needs to NOT block genuine `luca` subcommands.
//
// LUCA_NOUN_VERBS is the precise allowlist of every (noun → verbs) pair on
// the v13 CLI surface. The guard is exact:
//   - the command word must be exactly `luca` (not `luca-bridge`, etc.)
//   - the second token must be a known noun
//   - the third token, when present, is matched against that noun's verbs
// Read verbs classify as `bash-readonly`; write verbs as `luca-write`.
// ---------------------------------------------------------------------------

// Top-level `luca` commands (no noun/verb pair) that only READ/report —
// safe to allow in any phase. Without these, `luca version`, `luca telemetry`,
// etc. fell through to the unknown-command → bash-mutate path and got blocked
// at plan/REVIEWING (v13 run report, M1).
const LUCA_TOPLEVEL_READ = new Set(['version', 'telemetry', 'rules'])

// Top-level `luca` commands that mutate (or may mutate). Classified as
// `luca-write` — the matrix allows `luca-write` in every non-IDLE phase and
// each command self-enforces its own preconditions, so they are never wrongly
// blocked as a generic bash-mutate (e.g. `luca repair`). `hook` is omitted
// deliberately (internal; invoked by wrappers, not agents).
const LUCA_TOPLEVEL_WRITE = new Set([
    'init',
    'vault:init',
    'retro',
    'claim-verify',
    'classify',
    'doctor',
    'repair',
])

// Read-only `luca` verbs — these do not mutate state.
const LUCA_READ_VERBS = new Set([
    'read',
    'current',
    'list',
    'guard',
    'aggregate',
    'filter-stale',
    'detect-convergence',
    'regression-check',
    'lint',
])

// Every noun → verbs pair on the v13 `luca` CLI surface. Mirrors the
// noun-group commands registered in src/cli.ts and their leaf subcommands.
const LUCA_NOUN_VERBS: Record<string, Set<string>> = {
    state: new Set(['read', 'advance', 'claim-owner', 'set-current-phase']),
    phase: new Set(['current', 'advance', 'archive']),
    roadmap: new Set(['read', 'create']),
    preferences: new Set(['read', 'write']),
    todo: new Set(['add', 'list', 'update']),
    'pr-review': new Set([
        'filter-stale',
        'detect-convergence',
        'regression-check',
    ]),
    repo: new Set(['cleanup-apply']),
    checks: new Set(['run']),
    branch: new Set(['guard']),
    workflow: new Set(['reset']),
    confidence: new Set(['log']),
    // Read-side surfaces over the per-phase verify.json files.
    verification: new Set(['read', 'aggregate']),
    // Read-only plan-quality linter over a plan.md file.
    plan: new Set(['lint']),
}

/**
 * Classify a `luca` CLI invocation (the command word is already known to
 * be exactly `luca`). Returns a BashCategory, or `undefined` when the
 * token sequence is not a recognised `luca` subcommand (the caller then
 * falls through to the generic command classification).
 */
function classifyLucaCommand(rest: string[]): BashCategory | undefined {
    // `--help`/`-h`/`--version` anywhere → usage/version output, which
    // mutates nothing. This holds for ANY noun (e.g. `luca verification --help`,
    // `luca state --help`), so check it before noun resolution — otherwise a
    // help probe on a noun with no read verb fell through to bash-mutate.
    //
    // NOTE: `-v` is deliberately EXCLUDED. The CLI uses `-v` as an alias for
    // `--verbose` (e.g. `luca doctor`), not `--version`. Treating `-v` as a
    // version probe would classify a mutating command like `luca doctor --fix
    // -v` as read-only and let it bypass the stage gate. Only the unambiguous
    // help/version flags get the shortcut.
    if (rest.some((t) => ['--help', '-h', '--version'].includes(t))) {
        return 'bash-readonly'
    }
    const noun = rest.find((t) => !t.startsWith('-'))
    // `luca` with no noun (only flags handled above) — bare usage, read-only.
    if (!noun) return 'bash-readonly'
    const verbs = LUCA_NOUN_VERBS[noun]
    if (!verbs) {
        // Not a write-surface noun group — it may still be a recognised
        // top-level command (`luca repair`, `luca doctor`, `luca version`, …).
        if (LUCA_TOPLEVEL_READ.has(noun)) return 'bash-readonly'
        if (LUCA_TOPLEVEL_WRITE.has(noun)) return 'luca-write'
        return undefined
    }
    // Second non-flag token after the noun is the verb.
    const afterNoun = rest.slice(rest.indexOf(noun) + 1)
    const verb = afterNoun.find((t) => !t.startsWith('-'))
    if (!verb || !verbs.has(verb)) {
        // Known noun but no/unknown verb (e.g. `luca state` with no verb,
        // or `luca state --help`). Treat conservatively as a write — it is
        // still a genuine `luca` subcommand, so it must not be blocked as
        // an unknown bash command, and erring toward `luca-write` is safe
        // (the matrix allows it in every non-IDLE phase and the CLI
        // self-enforces). Read intent can't be assumed here.
        return 'luca-write'
    }
    return LUCA_READ_VERBS.has(verb) ? 'bash-readonly' : 'luca-write'
}

// ---------------------------------------------------------------------------
// Severity ordering for max-merge across subcommands
// ---------------------------------------------------------------------------

const SEVERITY: Record<BashCategory, number> = {
    'bash-readonly': 0,
    // `luca-write` and `bash-mutate` share a tier: both are "mutating" but
    // neither escalates past a commit. In a mixed pipeline `maxCategory`
    // keeps the first-seen at equal severity — acceptable, mixed
    // `luca`+mutate command strings are not a real pattern.
    'luca-write': 1,
    'bash-mutate': 1,
    'bash-commit': 2,
    denied: 3,
}

function maxCategory(a: BashCategory, b: BashCategory): BashCategory {
    return SEVERITY[a] >= SEVERITY[b] ? a : b
}

// ---------------------------------------------------------------------------
// Tokens — split shell-quote output by major operators
// ---------------------------------------------------------------------------

interface Subcommand {
    /** String args only (operators stripped). */
    tokens: string[]
    /** Operator that ENDED this subcommand (or undefined for last). */
    follower?: string
    /** Output redirect operator present in this subcommand, if any. */
    redirect?: { op: '>' | '>>' | '&>'; target?: string }
    /** Whether this subcommand is piped to another via |. */
    pipedTo?: 'sh' | 'bash' | 'other' | undefined
}

function splitIntoSubcommands(entries: ParseEntry[]): Subcommand[] {
    const subcommands: Subcommand[] = []
    let current: Subcommand = { tokens: [] }
    let i = 0
    while (i < entries.length) {
        const t = entries[i]!
        if (typeof t === 'string') {
            current.tokens.push(t)
            i++
            continue
        }
        if ('op' in t) {
            // @types/shell-quote's ControlOperator union doesn't include the
            // redirect operators (>, >>, &>) even though the runtime emits
            // them. Cast to string for comparison.
            const op = String(t.op)
            if (op === '>' || op === '>>' || op === '&>') {
                const target = entries[i + 1]
                current.redirect = {
                    op: op as '>' | '>>' | '&>',
                    target: typeof target === 'string' ? target : undefined,
                }
                i += 2
                continue
            }
            if (op === ';' || op === '&&' || op === '||' || op === '|') {
                current.follower = op
                subcommands.push(current)
                current = { tokens: [] }
                i++
                continue
            }
            // Unknown operator — skip
            i++
            continue
        }
        // glob / etc — treat the pattern as a string token if available
        if (typeof t === 'object' && 'pattern' in t) {
            current.tokens.push(t.pattern as string)
        }
        i++
    }
    subcommands.push(current)
    return subcommands
}

// ---------------------------------------------------------------------------
// Classification of a single subcommand
// ---------------------------------------------------------------------------

function classifySubcommand(sub: Subcommand): {
    category: BashCategory
    reason?: string
    targetPaths: string[]
} {
    const tokens = sub.tokens
    if (tokens.length === 0) {
        // Empty subcommand (e.g. trailing ;). Treat as readonly.
        return { category: 'bash-readonly', targetPaths: [] }
    }

    const cmd = tokens[0]!
    const rest = tokens.slice(1)

    // 1. Always-denied
    if (ALWAYS_DENIED_COMMANDS.has(cmd)) {
        return {
            category: 'denied',
            reason: `'${cmd}' is always denied`,
            targetPaths: [],
        }
    }

    // 2. Output redirect — automatic mutate, target = redirect.target
    const targetsFromRedirect: string[] = sub.redirect?.target
        ? [sub.redirect.target]
        : []

    // 3. git <subcommand> classification
    if (cmd === 'git' && rest.length > 0) {
        const sub1 = rest[0]!
        if (GIT_COMMIT_SUBCOMMANDS.has(sub1)) {
            return {
                category: 'bash-commit',
                targetPaths: targetsFromRedirect,
            }
        }
        if (GIT_MUTATE_SUBCOMMANDS.has(sub1)) {
            const target = lastNonFlag(rest)
            return {
                category: 'bash-mutate',
                targetPaths: [
                    ...targetsFromRedirect,
                    ...(target ? [target] : []),
                ],
            }
        }
        if (GIT_READONLY_SUBCOMMANDS.has(sub1)) {
            return {
                category: sub.redirect ? 'bash-mutate' : 'bash-readonly',
                targetPaths: targetsFromRedirect,
            }
        }
        // Unknown git subcommand — conservative mutate
        return { category: 'bash-mutate', targetPaths: targetsFromRedirect }
    }

    // 4. gh <subcommand> <subsubcommand> classification
    if (cmd === 'gh' && rest.length >= 2) {
        const pair: [string, string] = [rest[0]!, rest[1]!]
        if (
            GH_COMMIT_PATTERNS.some((p) => p[0] === pair[0] && p[1] === pair[1])
        ) {
            return { category: 'bash-commit', targetPaths: targetsFromRedirect }
        }
        if (
            GH_READONLY_PATTERNS.some(
                (p) => p[0] === pair[0] && p[1] === pair[1]
            )
        ) {
            return {
                category: sub.redirect ? 'bash-mutate' : 'bash-readonly',
                targetPaths: targetsFromRedirect,
            }
        }
        // Unknown gh subcommand — conservative mutate
        return { category: 'bash-mutate', targetPaths: targetsFromRedirect }
    }

    // 4b. `luca` CLI commands (v13 write-surface). The command word must
    //     be exactly `luca` — `luca-bridge` and other `luca`-prefixed
    //     binaries do NOT match here and fall through to generic handling.
    if (cmd === 'luca') {
        const lucaCategory = classifyLucaCommand(rest)
        if (lucaCategory) {
            // An output redirect on a `luca` invocation is still a write to
            // the redirect target — keep that path classified as a mutate.
            if (sub.redirect) {
                return {
                    category: 'bash-mutate',
                    targetPaths: targetsFromRedirect,
                }
            }
            return { category: lucaCategory, targetPaths: [] }
        }
        // cmd === 'luca' but not a recognised subcommand — fall through to
        // generic classification (conservative bash-mutate).
    }

    // 4c. Browser UAT driver. Observing a running app (navigate, snapshot,
    //     screenshot to stdout) never mutates repo files, so plain
    //     invocations classify read-only — without this, playwright-cli
    //     fell to the unknown-command → bash-mutate default and blocked
    //     browser UAT in PLANNING/REVIEWING, exactly the steps where
    //     visual verification belongs.
    //
    //     But `--filename=<path>` IS a file write, and unlike shell
    //     redirects it would otherwise never reach path classification —
    //     `--filename=.git/hooks/x.png` or `--filename=/tmp/luca-foo.json`
    //     would sail through as readonly with empty targetPaths. The
    //     output path is therefore extracted into targetPaths (so the
    //     hook's always-denied path rules apply) and the `.playwright-cli/`
    //     artifact-dir convention (shared subagent prefix) is enforced
    //     deterministically: an output path outside `.playwright-cli/`
    //     (or attempting `..` traversal out of it) classifies bash-mutate,
    //     so the phase matrix blocks it in read-only steps.
    if (cmd === 'playwright-cli') {
        const target = extractFilenameFlag(rest)
        if (target !== undefined) {
            const inArtifactDir =
                target.startsWith('.playwright-cli/') &&
                !target.split('/').includes('..')
            return {
                category:
                    inArtifactDir && !sub.redirect
                        ? 'bash-readonly'
                        : 'bash-mutate',
                targetPaths: [...targetsFromRedirect, target],
            }
        }
        return {
            category: sub.redirect ? 'bash-mutate' : 'bash-readonly',
            targetPaths: targetsFromRedirect,
        }
    }

    // 5. Read-only multi-token patterns checked BEFORE generic mutate
    //    patterns so e.g. `bunx --bun tsc --noEmit` isn't conflated with
    //    arbitrary bunx invocations.
    if (
        cmd === 'bunx' &&
        tokens.includes('tsc') &&
        tokens.includes('--noEmit')
    ) {
        return {
            category: sub.redirect ? 'bash-mutate' : 'bash-readonly',
            targetPaths: targetsFromRedirect,
        }
    }

    // 6. Package-manager mutate patterns (bun install, bun add, etc.)
    for (const pattern of PKG_MUTATE_PATTERNS) {
        if (matchesPrefix(tokens, pattern)) {
            return {
                category: 'bash-mutate',
                targetPaths: targetsFromRedirect,
            }
        }
    }

    // 6b. sed / awk are read-only UNLESS they edit in place. `sed -n '1,60p'`
    //     (print) and `awk '{…}'` (filter) read; only `sed -i…` / gawk
    //     `-i inplace` mutate. Treating all sed/awk as mutate blocked plain
    //     file reads in read-only phases.
    if (cmd === 'sed' || cmd === 'awk') {
        const sedInPlace =
            cmd === 'sed' &&
            rest.some((a) => a === '--in-place' || a.startsWith('-i'))
        // gawk in-place is the flag PAIR `-i inplace` (load the inplace
        // extension). Match the adjacent pair, not a bare "inplace" token —
        // which could appear in the awk program text or a filename.
        const awkInPlace =
            cmd === 'awk' &&
            rest.some((a, i) => a === '-i' && rest[i + 1] === 'inplace')
        if (!sedInPlace && !awkInPlace) {
            return {
                category: sub.redirect ? 'bash-mutate' : 'bash-readonly',
                targetPaths: targetsFromRedirect,
            }
        }
    }

    // 7. Single-token mutate
    if (MUTATE_COMMANDS.has(cmd)) {
        // For cp/mv/ln, target = last positional arg.
        const lastArg =
            cmd === 'cp' || cmd === 'mv' || cmd === 'ln'
                ? lastNonFlag(rest)
                : undefined
        // For sed -i FILE, target = file after -i
        const sedTarget =
            cmd === 'sed' && rest.includes('-i')
                ? rest[rest.length - 1]
                : undefined
        const additionalTargets = [lastArg, sedTarget].filter(
            (x): x is string => Boolean(x)
        )
        return {
            category: 'bash-mutate',
            targetPaths: [...targetsFromRedirect, ...additionalTargets],
        }
    }

    // 8. Single-token readonly
    if (READONLY_COMMANDS.has(cmd)) {
        return {
            category: sub.redirect ? 'bash-mutate' : 'bash-readonly',
            targetPaths: targetsFromRedirect,
        }
    }

    // 9. Unknown command — conservative mutate
    return {
        category: 'bash-mutate',
        targetPaths: targetsFromRedirect,
    }
}

/**
 * Extract the value of a `--filename=<path>` or `--filename <path>` flag.
 * Returns undefined when the flag is absent or has no value. Used by the
 * playwright-cli clause; covers the one output flag the playwright-cli
 * skill documents (extend here if more output flags appear).
 */
function extractFilenameFlag(args: string[]): string | undefined {
    for (let i = 0; i < args.length; i += 1) {
        const a = args[i]!
        if (a.startsWith('--filename=')) {
            const value = a.slice('--filename='.length)
            return value.length > 0 ? value : undefined
        }
        if (a === '--filename') {
            const value = args[i + 1]
            return value !== undefined && !value.startsWith('-')
                ? value
                : undefined
        }
    }
    return undefined
}

function lastNonFlag(args: string[]): string | undefined {
    for (let i = args.length - 1; i >= 0; i -= 1) {
        if (!args[i]!.startsWith('-')) return args[i]
    }
    return undefined
}

function matchesPrefix(tokens: string[], pattern: string[]): boolean {
    for (let i = 0; i < pattern.length; i += 1) {
        if (tokens[i] !== pattern[i]) return false
    }
    return true
}

// ---------------------------------------------------------------------------
// Pipe-to-shell detection (curl | bash, base64 -d | bash, etc.)
// ---------------------------------------------------------------------------

function detectPipeToShell(subcommands: Subcommand[]): string | undefined {
    // Look for any pipeline where an earlier stage produces content and a
    // later stage is sh/bash. Conservatively flag any pipe ending in sh/bash.
    for (let i = 0; i < subcommands.length; i += 1) {
        const sub = subcommands[i]!
        if (sub.follower !== '|') continue
        // Find the next subcommand in the pipeline.
        const next = subcommands[i + 1]
        if (!next) continue
        const nextCmd = next.tokens[0]
        if (nextCmd === 'sh' || nextCmd === 'bash') {
            const upstreamCmd = sub.tokens[0]
            if (
                upstreamCmd === 'curl' ||
                upstreamCmd === 'wget' ||
                (upstreamCmd === 'base64' && sub.tokens.includes('-d')) ||
                (upstreamCmd === 'echo' &&
                    subcommands
                        .slice(0, i + 1)
                        .some((s) =>
                            s.tokens.some((t) =>
                                /^[A-Za-z0-9+/=]{16,}$/.test(t)
                            )
                        ))
            ) {
                return `pipe-to-${nextCmd} pattern (${upstreamCmd} | … | ${nextCmd})`
            }
            // Even unknown upstream piped to sh/bash is suspicious.
            return `pipe-to-${nextCmd} pattern (${upstreamCmd ?? '?'} | … | ${nextCmd})`
        }
    }
    return undefined
}

// ---------------------------------------------------------------------------
// Public classifier
// ---------------------------------------------------------------------------

export function classifyBashCommand(cmd: string): ClassifyBashResult {
    const trimmed = cmd.trim()
    if (!trimmed) {
        return { category: 'bash-readonly', targetPaths: [] }
    }

    let entries: ParseEntry[]
    try {
        entries = parse(trimmed)
    } catch {
        return {
            category: 'bash-mutate',
            reason: 'command could not be parsed; treating as mutating (conservative)',
            targetPaths: [],
        }
    }

    if (entries.length === 0) {
        return {
            category: 'bash-mutate',
            reason: 'command parsed to empty (malformed)',
            targetPaths: [],
        }
    }

    const subcommands = splitIntoSubcommands(entries)

    // Always-deny patterns checked first
    const pipeToShellReason = detectPipeToShell(subcommands)
    if (pipeToShellReason) {
        return {
            category: 'denied',
            reason: pipeToShellReason,
            targetPaths: [],
        }
    }

    // Classify each subcommand; take max severity, accumulate targetPaths.
    let category: BashCategory = 'bash-readonly'
    let reason: string | undefined
    const targetPaths: string[] = []

    for (const sub of subcommands) {
        const r = classifySubcommand(sub)
        category = maxCategory(category, r.category)
        if (r.category === 'denied' && !reason) reason = r.reason
        for (const p of r.targetPaths) {
            if (!targetPaths.includes(p)) targetPaths.push(p)
        }
    }

    return { category, reason, targetPaths }
}
