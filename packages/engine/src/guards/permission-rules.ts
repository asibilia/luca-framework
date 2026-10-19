/**
 * Pure: each role's SDK permission settings, the layer under the guard hook.
 */
import {
    READ_TOOLS,
    TOOLS,
    type GuardArgs,
    type GuardRole,
} from './guard-roles'
import {
    checkCommands,
    GIT_READ_SUBCOMMANDS,
    PACKAGE_MANAGERS,
    wordsOf,
} from './shell-rules'
import { LOCKFILES } from './write-rules'

import {
    featureMapPath,
    isFeatureMapFolder,
    type EngineConfig,
} from '../config/engine-config'

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
    const commands = checkCommands({ role, config })
    const shell = role === 'learner' ? [] : readOnlyRules()
    // A bun test command takes extra args (a file, `-t`) only when it is one
    // plain command; one with shell syntax runs as its exact copy.
    const testRules = commands.tests.flatMap(({ run, results }) =>
        results !== 'bun' || wordsOf(run) === null
            ? [`Bash(${run})`]
            : [`Bash(${run})`, `Bash(${run} *)`]
    )
    const checks = [
        ...testRules,
        ...commands.others.map((command) => `Bash(${command})`),
    ]
    const setup = config.test_setup_files.map((path) => `Edit(${path})`)
    const tests = config.test_file_patterns.map((glob) => `Edit(${glob})`)
    // The feature map is the test-writer's too (#583): the file, or every
    // page of a folder map (#597).
    const map_path = featureMapPath({ config })
    const map =
        map_path === null
            ? []
            : isFeatureMapFolder({ path: map_path })
              ? [`Edit(${map_path}/**/*.md)`]
              : [`Edit(${map_path})`]
    const writes: Record<
        GuardRole,
        { allowed: string[]; disallowed: string[] }
    > = {
        'test-writer': may_edit_tests
            ? { allowed: [...tests, ...map, 'Bash(rm *)'], disallowed: setup }
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
