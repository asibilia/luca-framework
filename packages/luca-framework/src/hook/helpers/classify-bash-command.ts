import { parse, type ParseEntry } from 'shell-quote'

export type BashCategory =
    | 'bash-readonly'
    | 'bash-mutate'
    | 'bash-commit'
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
// Severity ordering for max-merge across subcommands
// ---------------------------------------------------------------------------

const SEVERITY: Record<BashCategory, number> = {
    'bash-readonly': 0,
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
    const targetsFromRedirect: string[] =
        sub.redirect?.target ? [sub.redirect.target] : []

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
        if (GH_COMMIT_PATTERNS.some((p) => p[0] === pair[0] && p[1] === pair[1])) {
            return { category: 'bash-commit', targetPaths: targetsFromRedirect }
        }
        if (
            GH_READONLY_PATTERNS.some(
                (p) => p[0] === pair[0] && p[1] === pair[1],
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

    // 5. Read-only multi-token patterns checked BEFORE generic mutate
    //    patterns so e.g. `bunx --bun tsc --noEmit` isn't conflated with
    //    arbitrary bunx invocations.
    if (cmd === 'bunx' && tokens.includes('tsc') && tokens.includes('--noEmit')) {
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

    // 7. Single-token mutate
    if (MUTATE_COMMANDS.has(cmd)) {
        // For cp/mv/ln, target = last positional arg.
        const lastArg =
            cmd === 'cp' || cmd === 'mv' || cmd === 'ln' ? lastNonFlag(rest) : undefined
        // For sed -i FILE, target = file after -i
        const sedTarget =
            cmd === 'sed' && rest.includes('-i')
                ? rest[rest.length - 1]
                : undefined
        const additionalTargets = [lastArg, sedTarget].filter(
            (x): x is string => Boolean(x),
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
                    subcommands.slice(0, i + 1).some((s) =>
                        s.tokens.some((t) => /^[A-Za-z0-9+/=]{16,}$/.test(t)),
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
