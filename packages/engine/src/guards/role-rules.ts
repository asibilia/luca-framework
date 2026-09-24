import { basename, isAbsolute, normalize, relative, resolve } from 'node:path'

import { z } from 'zod'

import type { AgentRole } from '../agents/role-results'
import type { EngineConfig } from '../config/engine-config'
import { testFilesAmong } from '../gates/test-runner'

/**
 * The roles the **guard** knows. `reviewer` covers every reviewer (the ticket
 * reviewer and the final review's lenses). The learner has no agent
 * role yet (#370) but its rules are here already.
 */
export const GuardRoleSchema = z.enum([
    'test-writer',
    'implementer',
    'reviewer',
    'learner',
])

export type GuardRole = z.infer<typeof GuardRoleSchema>

const GUARD_ROLE_OF: Record<AgentRole, GuardRole> = {
    'test-writer': 'test-writer',
    implementer: 'implementer',
    'ticket-reviewer': 'reviewer',
    'architecture-lens': 'reviewer',
    'simplification-lens': 'reviewer',
    'security-lens': 'reviewer',
    'integration-lens': 'reviewer',
    'rules-lens': 'reviewer',
    learner: 'learner',
}

/** The guard role an agent role plays by. */
export const guardRoleOf = ({ role }: { role: AgentRole }): GuardRole =>
    GUARD_ROLE_OF[role]

/** Whether a guard role may change files at all. */
export const isWriter = (role: GuardRole): boolean =>
    role === 'test-writer' || role === 'implementer'

/** What the guard says about one tool call. */
export type ToolDecision = { allow: true } | { allow: false; reason: string }

const ALLOW: ToolDecision = { allow: true }

const deny = (reason: string): ToolDecision => ({ allow: false, reason })

/**
 * Worktree-relative, `..` resolved. `null` when the path leaves the worktree.
 * macOS reaches temp folders through `/var` and `/private/var` alike, so both
 * sides drop the `/private` prefix before they are compared.
 */
const insideWorktree = ({
    worktree,
    path,
}: {
    worktree: string
    path: string
}): string | null => {
    const canonical = (text: string) =>
        text.replace(/^\/private\/(var|tmp)(?=\/|$)/, '/$1')
    const root = canonical(resolve(worktree))
    const full = canonical(resolve(root, path))
    const inner = relative(root, full)
    if (inner.startsWith('..') || isAbsolute(inner)) return null
    return inner === '' ? '.' : inner
}

const isTestFile = ({
    path,
    config,
}: {
    path: string
    config: EngineConfig
}): boolean =>
    testFilesAmong({
        files: [path],
        test_file_patterns: config.test_file_patterns,
    }).length > 0

/** The lockfiles a package install writes. The engine owns them. */
export const LOCKFILES = [
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'pnpm-lock.yaml',
]

/**
 * Whether a worktree-relative path is the package install's: a lockfile, or
 * anything under a `node_modules` folder. Only the engine's install gate
 * writes these; no agent does.
 *
 * @example
 * isInstallPath('bun.lock') // true
 * isInstallPath('packages/app/node_modules/zod/index.js') // true
 * isInstallPath('src/sum.ts') // false
 */
export const isInstallPath = (path: string): boolean =>
    LOCKFILES.includes(basename(path)) ||
    normalize(path).split('/').includes('node_modules')

/** The rules an agent's guards check it against: its role, and whether it may edit tests. */
type GuardArgs = {
    role: GuardRole
    /**
     * Whether this agent may edit test files: true for the test-writer and a
     * refactor ticket's implementer. A test-writer without it writes nothing;
     * a reviewer or the learner never writes, whatever it says.
     */
    may_edit_tests: boolean
}

/**
 * Whether an agent may create, change, or delete a worktree-relative path.
 * Test-writers write test files only; implementers write anything but test
 * files (unless they may edit tests) and test setup files; reviewers and the
 * learner write nothing. No role writes a test setup file, `.git`, what
 * the package install writes (lockfiles, `node_modules`), or outside its
 * worktree.
 *
 * @example
 * mayWrite({ role: 'test-writer', may_edit_tests: true, path: 'src/sum.test.ts', config }) // true
 * mayWrite({ role: 'implementer', may_edit_tests: false, path: 'src/sum.test.ts', config }) // false
 * mayWrite({ role: 'implementer', may_edit_tests: true, path: 'src/sum.test.ts', config }) // true: a refactor ticket
 */
export const mayWrite = ({
    role,
    may_edit_tests,
    path,
    config,
}: GuardArgs & {
    path: string
    config: EngineConfig
}): boolean => {
    if (!isWriter(role) || isAbsolute(path)) return false
    const clean = normalize(path).replace(/^\.\//, '')
    if (clean === '.' || clean.startsWith('..')) return false
    if (clean === '.git' || clean.startsWith('.git/')) return false
    if (config.test_setup_files.includes(clean)) return false
    if (isInstallPath(clean)) return false
    const test = isTestFile({ path: clean, config })
    if (role === 'test-writer') return test && may_edit_tests
    return !test || may_edit_tests
}

/** One word of a shell command, and whether the shell would expand it. */
type Word = { text: string; expands: boolean }

/**
 * Splits a command the way `sh` would, for the plain commands the guard
 * allows. Fails on anything that chains, pipes, redirects, substitutes, or
 * runs in the background, so one call is one command.
 */
const splitCommand = (
    command: string
): { ok: true; words: Word[] } | { ok: false; error: string } => {
    const words: Word[] = []
    let text = ''
    let expands = false
    let inWord = false
    let quote: "'" | '"' | null = null
    const bad = (char: string) => ({
        ok: false as const,
        error: `"${char}" is not allowed: run one plain command per shell call, with no chains, pipes, redirects, or subshells.`,
    })
    for (const char of command) {
        if (quote === "'") {
            if (char === "'") quote = null
            else text += char
            continue
        }
        if (quote === '"') {
            if (char === '"') quote = null
            else if ('$`\\'.includes(char)) return bad(char)
            else text += char
            continue
        }
        if (char === "'" || char === '"') {
            quote = char
            inWord = true
            continue
        }
        if (char === ' ' || char === '\t') {
            if (inWord) words.push({ text, expands })
            text = ''
            expands = false
            inWord = false
            continue
        }
        if (';&|<>`$(){}\\!#\n\r'.includes(char)) return bad(char)
        if ('*?[]~'.includes(char)) expands = true
        text += char
        inWord = true
    }
    if (quote !== null) return { ok: false, error: 'An unclosed quote.' }
    if (inWord) words.push({ text, expands })
    return { ok: true, words }
}

const wordsOf = (command: string): string[] | null => {
    const split = splitCommand(command)
    return split.ok ? split.words.map(({ text }) => text) : null
}

const startsWith = ({
    words,
    prefix,
}: {
    words: string[]
    prefix: string[]
}): boolean => prefix.every((word, index) => words[index] === word)

/** The check commands from the config a role may run: tests, types, lint. */
export const checkCommands = ({
    role,
    config,
}: {
    role: GuardRole
    config: EngineConfig
}): { test: string | null; others: string[] } => {
    if (!isWriter(role)) return { test: null, others: [] }
    const { test, types, lint } = config.checks
    return {
        test: test ?? null,
        others: [types, lint].filter(
            (command): command is string => command !== undefined
        ),
    }
}

const GIT_READ_SUBCOMMANDS = [
    'status',
    'diff',
    'log',
    'show',
    'ls-files',
    'blame',
]

const FIND_WRITES = [
    '-exec',
    '-execdir',
    '-ok',
    '-okdir',
    '-delete',
    '-fprint',
    '-fprint0',
    '-fprintf',
    '-fls',
]

/** `sed -n` with a line-range print script only: `5p`, `1,20p`, `$p`. */
const SED_PRINT = /^(\d+|\$)(,(\d+|\$))?p$/

/**
 * The read-only commands every role with a shell may run, each a check of
 * its words (the command name is `words[0]`).
 */
const READ_ONLY: Record<string, (words: string[]) => boolean> = {
    ls: () => true,
    cat: () => true,
    head: () => true,
    wc: () => true,
    grep: () => true,
    pwd: (words) => words.length === 1,
    tail: (words) =>
        !words.some(
            (word) =>
                /^-[a-zA-Z]*[fF]/.test(word) || word.startsWith('--follow')
        ),
    rg: (words) => !words.some((word) => word.startsWith('--pre')),
    find: (words) => !words.some((word) => FIND_WRITES.includes(word)),
    sed: (words) =>
        words[1] === '-n' &&
        SED_PRINT.test(words[2] ?? '') &&
        words.slice(3).every((word) => !word.startsWith('-')),
    git: (words) =>
        GIT_READ_SUBCOMMANDS.includes(words[1] ?? '') &&
        !words.some(
            (word) => word.startsWith('--output') || word === '--ext-diff'
        ),
}

/** The read-only commands, as a person reads them. */
export const READ_ONLY_COMMANDS = [
    'ls',
    'cat',
    'head',
    'tail',
    'wc',
    'grep',
    'rg',
    'find (no -exec, -delete, or -fprint)',
    'pwd',
    "sed -n '<from>,<to>p' <file>",
    `git ${GIT_READ_SUBCOMMANDS.join('|')} (no options before the subcommand)`,
]

/** Package managers other than Bun: any use of one may install. */
const PACKAGE_MANAGERS = ['npm', 'npx', 'yarn', 'pnpm', 'pnpx']

/** `bun` subcommands that install, remove, or fetch packages. */
const BUN_INSTALLS = [
    'install',
    'i',
    'add',
    'a',
    'remove',
    'rm',
    'update',
    'upgrade',
    'link',
    'unlink',
    'pm',
    'patch',
    'create',
    'x',
]

/** Bun's flags that turn on installing missing packages in any command. */
const isInstallFlag = (word: string): boolean =>
    word === '-i' || word === '--install' || word.startsWith('--install=')

/**
 * Whether a command runs a package install, or may: a package manager, a
 * `bun` install subcommand, `bunx`, or `bun` with an auto-install flag.
 */
const isInstallCommand = (words: string[]): boolean => {
    const [name, sub] = words
    if (name === undefined) return false
    if (PACKAGE_MANAGERS.includes(name) || name === 'bunx') return true
    if (name !== 'bun') return false
    return BUN_INSTALLS.includes(sub ?? '') || words.some(isInstallFlag)
}

const INSTALL_DENIED =
    'The engine runs the package install, never an agent: if you change a package manifest, the engine installs after your turn and commits the lockfile.'

const checkRm = ({
    role,
    may_edit_tests,
    words,
    worktree,
    config,
}: GuardArgs & {
    words: Word[]
    worktree: string
    config: EngineConfig
}): ToolDecision => {
    if (!isWriter(role)) return deny(`A ${role} may not delete files.`)
    const paths: Word[] = []
    let options = true
    for (const word of words.slice(1)) {
        if (options && word.text === '--') {
            options = false
            continue
        }
        if (options && word.text.startsWith('-')) {
            if (word.text !== '-f') {
                return deny(
                    'rm takes only -f: delete files one by one, not folders.'
                )
            }
            continue
        }
        paths.push(word)
    }
    if (paths.length === 0) return deny('rm needs at least one path.')
    for (const word of paths) {
        const inner = insideWorktree({ worktree, path: word.text })
        if (word.expands || inner === null) {
            return deny(
                `rm ${word.text}: name each file inside your worktree, with no wildcards or ~.`
            )
        }
        if (!mayWrite({ role, may_edit_tests, path: inner, config })) {
            return deny(`A ${role} may not delete ${inner}.`)
        }
    }
    return ALLOW
}

const shellHelp = ({
    role,
    config,
}: {
    role: GuardRole
    config: EngineConfig
}): string => {
    const { test, others } = checkCommands({ role, config })
    const checks = [
        ...(test === null ? [] : [`${test} [args]`]),
        ...others,
        ...(isWriter(role) ? ['rm [-f] <files you may write>'] : []),
    ]
    return [
        `A ${role} may run: ${[...checks, ...READ_ONLY_COMMANDS].join('; ')}.`,
        'One command per call.',
    ].join(' ')
}

const checkBash = ({
    role,
    may_edit_tests,
    command,
    worktree,
    config,
}: GuardArgs & {
    command: string
    worktree: string
    config: EngineConfig
}): ToolDecision => {
    if (role === 'learner') return deny('The learner has no shell.')
    const trimmed = command.trim()
    const { test, others } = checkCommands({ role, config })
    // The config's own commands may use shell syntax; only exact copies run.
    if (trimmed === test || others.includes(trimmed)) return ALLOW
    const split = splitCommand(trimmed)
    if (!split.ok) return deny(`${split.error} ${shellHelp({ role, config })}`)
    const words = split.words.map(({ text }) => text)
    const [name] = words
    if (name === undefined) return deny('An empty command.')
    if (others.some((other) => wordsOf(other)?.join(' ') === words.join(' '))) {
        return ALLOW
    }
    if (isInstallCommand(words)) return deny(INSTALL_DENIED)
    const testWords = test === null ? null : wordsOf(test)
    if (testWords !== null && startsWith({ words, prefix: testWords })) {
        return ALLOW
    }
    if (name === 'rm') {
        return checkRm({
            role,
            may_edit_tests,
            words: split.words,
            worktree,
            config,
        })
    }
    const readOnly = READ_ONLY[name]
    if (readOnly !== undefined && readOnly(words)) return ALLOW
    return deny(
        `"${trimmed}" is not allowed. ${shellHelp({ role, config })} No git writes, GitHub, or network.`
    )
}

const FileInputSchema = z.object({ file_path: z.string().min(1) })

const SearchInputSchema = z.object({ path: z.string().min(1).optional() })

const BashInputSchema = z.object({
    command: z.string(),
    run_in_background: z.boolean().optional(),
    dangerouslyDisableSandbox: z.boolean().optional(),
})

const READ_TOOLS = ['Read', 'Grep', 'Glob']

const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit']

/** Tools every agent may call: the SDK's structured result, and the engine's own. */
const isEngineTool = (tool_name: string): boolean =>
    tool_name === 'StructuredOutput' || tool_name.startsWith('mcp__luca__')

/** The engine's message tool: only test-writers and implementers send. */
const SEND_MESSAGE_TOOL = 'mcp__luca__send_message'

const TOOLS: Record<GuardRole, string[]> = {
    'test-writer': ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
    implementer: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
    reviewer: ['Read', 'Grep', 'Glob', 'Bash'],
    learner: ['Read', 'Grep', 'Glob'],
}

/**
 * The guard's decision for one tool call, made before it runs (the SDK's
 * PreToolUse hook). Reviewers and the learner may not send agent messages.
 * It fails closed: an unknown tool, an input of the wrong
 * shape, a path outside the worktree, or a shell command off the role's list
 * is denied with a reason the agent can act on.
 *
 * @example
 * checkToolCall({ role: 'reviewer', may_edit_tests: false, tool_name: 'Bash', tool_input: { command: 'git commit' }, worktree, config })
 * // { allow: false, reason: '"git commit" is not allowed. ...' }
 */
export const checkToolCall = ({
    role,
    may_edit_tests,
    tool_name,
    tool_input,
    worktree,
    config,
}: GuardArgs & {
    tool_name: string
    tool_input: unknown
    /** The agent's worktree, as an absolute path. */
    worktree: string
    config: EngineConfig
}): ToolDecision => {
    if (tool_name === SEND_MESSAGE_TOOL && !isWriter(role)) {
        return deny(`A ${role} may not send agent messages.`)
    }
    if (isEngineTool(tool_name)) return ALLOW
    if (!TOOLS[role].includes(tool_name) && !WRITE_TOOLS.includes(tool_name)) {
        return deny(`A ${role} may not use ${tool_name}.`)
    }
    if (WRITE_TOOLS.includes(tool_name)) {
        const input = FileInputSchema.safeParse(tool_input)
        if (!input.success) return deny(`${tool_name} needs a file_path.`)
        const inner = insideWorktree({ worktree, path: input.data.file_path })
        if (inner === null) {
            return deny(`${input.data.file_path} is outside your worktree.`)
        }
        return mayWrite({ role, may_edit_tests, path: inner, config })
            ? ALLOW
            : deny(`A ${role} may not write ${inner}.`)
    }
    if (READ_TOOLS.includes(tool_name)) {
        const input =
            tool_name === 'Read'
                ? FileInputSchema.safeParse(tool_input)
                : SearchInputSchema.safeParse(tool_input)
        if (!input.success)
            return deny(`${tool_name} got an input of the wrong shape.`)
        const path =
            'file_path' in input.data ? input.data.file_path : input.data.path
        if (path !== undefined && insideWorktree({ worktree, path }) === null) {
            return deny(`${path} is outside your worktree.`)
        }
        return ALLOW
    }
    if (tool_name === 'Bash') {
        const input = BashInputSchema.safeParse(tool_input)
        if (!input.success) return deny('Bash needs a command.')
        if (input.data.run_in_background === true) {
            return deny('No background commands.')
        }
        if (input.data.dangerouslyDisableSandbox === true) {
            return deny('Every command runs in the sandbox.')
        }
        return checkBash({
            role,
            may_edit_tests,
            command: input.data.command,
            worktree,
            config,
        })
    }
    return deny(`A ${role} may not use ${tool_name}.`)
}

/** Built-in tools no agent gets, and secret files no agent reads. */
export const BASE_DISALLOWED_TOOLS = [
    'Agent',
    'Task',
    'Workflow',
    'Skill',
    'WebFetch',
    'WebSearch',
    'Monitor',
    'PowerShell',
    'NotebookEdit',
    'SendMessage',
    'Artifact',
    'RemoteTrigger',
    'CronCreate',
    'PushNotification',
    'SendUserFile',
    'EnterWorktree',
    'ExitWorktree',
    'ListMcpResourcesTool',
    'ReadMcpResourceTool',
    'Bash(run_in_background:true)',
    'Read(~/.claude.json)',
    'Read(~/.claude/**)',
    'Read(~/.paseo/**)',
    'Read(~/.ssh/**)',
    'Read(~/.config/gh/**)',
]

/**
 * Deny rules every role gets, so the package install and what it writes are
 * shut at the SDK's permission layer too. `bunx` is left to the guard hook:
 * a config's type check may run through it.
 */
export const INSTALL_DENY_RULES = [
    ...['install', 'i', 'add', 'remove', 'update', 'pm'].flatMap((sub) => [
        `Bash(bun ${sub})`,
        `Bash(bun ${sub} *)`,
    ]),
    ...PACKAGE_MANAGERS.flatMap((name) => [`Bash(${name})`, `Bash(${name} *)`]),
    'Edit(node_modules/**)',
    'Edit(**/node_modules/**)',
    ...LOCKFILES.flatMap((name) => [`Edit(${name})`, `Edit(**/${name})`]),
]

const readOnlyRules = (): string[] => [
    'Bash(ls)',
    'Bash(ls *)',
    'Bash(cat *)',
    'Bash(head *)',
    'Bash(tail *)',
    'Bash(wc *)',
    'Bash(grep *)',
    'Bash(rg *)',
    'Bash(find *)',
    'Bash(pwd)',
    'Bash(sed -n *)',
    ...GIT_READ_SUBCOMMANDS.flatMap((sub) => [
        `Bash(git ${sub})`,
        `Bash(git ${sub} *)`,
    ]),
]

/**
 * A role's SDK permission settings. Under `dontAsk` only pre-approved calls
 * run, so `allowed` lists exactly what the role may do; `disallowed` shuts
 * the rest; `tools` is the only built-in tools the agent sees. The guard hook
 * (`checkToolCall`) still checks every call these let through.
 */
export const permissionRules = ({
    role,
    may_edit_tests,
    config,
}: GuardArgs & {
    config: EngineConfig
}): { tools: string[]; allowed: string[]; disallowed: string[] } => {
    const { test, others } = checkCommands({ role, config })
    const shell = role === 'learner' ? [] : readOnlyRules()
    // A test command takes extra args (a file, `-t`) only when it is one
    // plain command; one with shell syntax runs as its exact copy.
    const testRules =
        test === null
            ? []
            : wordsOf(test) === null
              ? [`Bash(${test})`]
              : [`Bash(${test})`, `Bash(${test} *)`]
    const checks = [
        ...testRules,
        ...others.map((command) => `Bash(${command})`),
    ]
    const setup = config.test_setup_files.map((path) => `Edit(${path})`)
    const tests = config.test_file_patterns.map((glob) => `Edit(${glob})`)
    const writes: Record<
        GuardRole,
        { allowed: string[]; disallowed: string[] }
    > = {
        'test-writer': may_edit_tests
            ? { allowed: [...tests, 'Bash(rm *)'], disallowed: setup }
            : { allowed: [], disallowed: ['Edit', 'Write'] },
        implementer: {
            allowed: ['Edit(**)', 'Bash(rm *)'],
            disallowed: may_edit_tests ? setup : [...tests, ...setup],
        },
        reviewer: { allowed: [], disallowed: ['Edit', 'Write'] },
        learner: { allowed: [], disallowed: ['Edit', 'Write', 'Bash'] },
    }
    return {
        tools: TOOLS[role],
        allowed: [
            ...READ_TOOLS,
            ...writes[role].allowed,
            ...checks,
            ...shell,
            'mcp__luca',
        ],
        disallowed: [
            ...BASE_DISALLOWED_TOOLS,
            ...INSTALL_DENY_RULES,
            ...writes[role].disallowed,
        ],
    }
}
