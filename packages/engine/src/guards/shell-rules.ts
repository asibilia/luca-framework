/**
 * Pure: which shell commands each role may run, checked one plain command at
 * a time.
 */
import {
    ALLOW,
    deny,
    isWriter,
    type GuardArgs,
    type GuardRole,
    type ToolDecision,
} from './guard-roles'
import { insideWorktree, mayWrite } from './write-rules'

import {
    slowTestCommands,
    testCommands,
    type EngineConfig,
    type TestCommand,
} from '../config/engine-config'

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

export const wordsOf = (command: string): string[] | null => {
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

/**
 * The check commands from the config a role may run: each test command,
 * each slow test command (#563), types, lint. A `bun` test command may take extra arguments; the rest run
 * only as written.
 */
export const checkCommands = ({
    role,
    config,
}: {
    role: GuardRole
    config: EngineConfig
}): { tests: TestCommand[]; others: string[] } => {
    if (!isWriter(role)) return { tests: [], others: [] }
    const { types, lint } = config.checks
    return {
        tests: [...testCommands({ config }), ...slowTestCommands({ config })],
        others: [types, lint].filter(
            (command): command is string => command !== undefined
        ),
    }
}

/** The configured commands that run only as written, tests included. */
const exactCommands = ({
    tests,
    others,
}: {
    tests: TestCommand[]
    others: string[]
}): string[] => [
    ...tests.filter(({ results }) => results !== 'bun').map(({ run }) => run),
    ...others,
]

export const GIT_READ_SUBCOMMANDS = [
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
export const PACKAGE_MANAGERS = ['npm', 'npx', 'yarn', 'pnpm', 'pnpx']

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
    const { tests, others } = checkCommands({ role, config })
    const checks = [
        ...tests.map(({ run, results }) =>
            results === 'bun' ? `${run} [args]` : run
        ),
        ...others,
        ...(isWriter(role) ? ['rm [-f] <files you may write>'] : []),
    ]
    return [
        `A ${role} may run: ${[...checks, ...READ_ONLY_COMMANDS].join('; ')}.`,
        'One command per call.',
    ].join(' ')
}

export const checkBash = ({
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
    const { tests, others } = checkCommands({ role, config })
    // The config's own commands may use shell syntax; only exact copies run.
    if (tests.some(({ run }) => run === trimmed) || others.includes(trimmed)) {
        return ALLOW
    }
    const split = splitCommand(trimmed)
    if (!split.ok) return deny(`${split.error} ${shellHelp({ role, config })}`)
    const words = split.words.map(({ text }) => text)
    const [name] = words
    if (name === undefined) return deny('An empty command.')
    const exact = exactCommands({ tests, others })
    if (exact.some((other) => wordsOf(other)?.join(' ') === words.join(' '))) {
        return ALLOW
    }
    if (isInstallCommand(words)) return deny(INSTALL_DENIED)
    for (const { run, results } of tests) {
        const testWords = results === 'bun' ? wordsOf(run) : null
        if (testWords !== null && startsWith({ words, prefix: testWords })) {
            return ALLOW
        }
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
