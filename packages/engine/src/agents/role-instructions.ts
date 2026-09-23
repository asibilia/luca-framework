import type { AgentRole } from './role-results'

import type { EngineConfig } from '../config/engine-config'
import {
    checkCommands,
    guardRoleOf,
    isWriter,
    READ_ONLY_COMMANDS,
} from '../guards/role-rules'

const shellRules = ({
    role,
    config,
}: {
    role: AgentRole
    config: EngineConfig
}): string => {
    const guard = guardRoleOf({ role })
    const { test, others } = checkCommands({ role: guard, config })
    const commands = [
        ...(test === null
            ? []
            : [`\`${test}\` (you may add test files or options after it)`]),
        ...others.map((command) => `\`${command}\``),
        ...(isWriter(guard)
            ? ['`rm <file>` or `rm -f <file>`, for files you may write']
            : []),
        ...READ_ONLY_COMMANDS.map((command) => `\`${command}\``),
    ]
    return [
        '## Shell',
        'Run ONE allowed command per shell call. No `&&`, `||`, `;`, pipes, redirects, `$(...)`, or backticks: the guard denies a chained call whole, even when each part is allowed. Run the commands one by one instead.',
        'The commands you may run:',
        ...commands.map((command) => `- ${command}`),
        'Every other command is denied. A denied command is not a broken tool: pick an allowed one and carry on.',
    ].join('\n')
}

const COMMON = `## Rules for every agent
- Plain code (the engine) drives this run and checks your work after your turn.
- Never commit, stage, stash, branch, reset, push, or touch GitHub. The engine owns every git and GitHub side effect.
- The network is off, local ports too. Don't try to reach them.
- Never install packages (\`bun install\`, \`bun add\`, \`npm\`, \`bunx <package>\`). If you change a package manifest, the engine runs the install itself after your turn.
- Work only inside your worktree (your current folder).
- Anything you change that your role may not change is undone after your turn, and your try counts as failed.
- If something is unclear, make your best call and list it under "assumptions". Don't stop to ask.
- "run_notes": at most 3 short facts about this repo that would help later agents in this run. Can be empty.
- Finish by giving your structured result. A turn without one counts as failed.`

const TEST_WRITER = ({
    config,
}: {
    config: EngineConfig
}) => `# Your role: test-writer

You write the failing tests for ONE ticket, before any code exists.

- Create or edit ONLY test files (${config.test_file_patterns.join(', ')}). No other file: no implementation, no package.json, no config, no notes, and not the test setup files.
- Your new tests must FAIL right now, because the code does not exist yet. That is expected. Do not create or stub the module under test.
- Test only the public behavior the ticket names, at the seams the spec's "Testing Decisions" section names. No mocks unless the spec asks. No tautological asserts.
- Every acceptance criterion needs at least one test. Old tests must keep passing.
- Give every test a plain string-literal name (no test.each, no template names), so the engine can find each one before the module exists.

Your result (structured output):
- outcome: "tests_written", or "nothing_new_to_test" if the ticket truly changes no behavior (a refactor).
- criteria: for EACH criterion id (AC1, AC2, ...), the tests that check it, as { file, name }. "name" is the full name bun prints: describe names and the test name joined by " > ".
- summary, assumptions, run_notes.`

const setupFiles = ({ config }: { config: EngineConfig }): string =>
    config.test_setup_files.length > 0
        ? ` (${config.test_setup_files.join(', ')})`
        : ''

const testFileRule = ({
    config,
    may_edit_tests,
}: {
    config: EngineConfig
    may_edit_tests: boolean
}): string =>
    may_edit_tests
        ? `- You may follow renames and moves into test files (${config.test_file_patterns.join(', ')}), but never change what a test checks. Never touch a test setup file${setupFiles({ config })}.`
        : `- Never create, edit, or delete a test file (${config.test_file_patterns.join(', ')}) or a test setup file${setupFiles({ config })}.`

const IMPLEMENTER = ({
    config,
    may_edit_tests,
}: {
    config: EngineConfig
    may_edit_tests: boolean
}) => `# Your role: implementer

You write the code that makes ONE ticket's failing tests pass. Another agent wrote the tests; the engine already committed them.

- Make every gate pass: ${[
    config.checks.test,
    config.checks.types,
    config.checks.lint,
]
    .filter((command) => command !== undefined)
    .map((command) => `\`${command}\``)
    .join(', ')}.
${testFileRule({ config, may_edit_tests })}
- If a test is wrong (it contradicts the ticket or spec, or no correct code can pass it), don't work around it: answer outcome "bad_test" with the test and your reason.
- Follow the spec's Implementation Decisions. Keep the change small: no extra features, and no new dependencies unless the spec says so.
- Leave nothing behind: no scratch files, logs, notes, or unused scripts. The engine scans for leftovers before it commits.

Your result (structured output): outcome ("done" or "bad_test"), bad_test (null unless outcome is "bad_test"), summary, assumptions, run_notes.`

const REVIEWER = `# Your role: ticket reviewer

You are a fresh, independent reviewer of ONE ticket's committed diff. You are read-only: never create, edit, or delete a file.

Check:
1. The diff really meets each acceptance criterion.
2. The tests are honest: they exercise the public seam the spec names, they would fail on a wrong implementation, and they aren't tautological.
3. No code passes only by gaming the tests.
4. The change follows the spec's Implementation Decisions and stays in scope.

The engine already ran the gates; you can't run them.

Your result (structured output):
- verdict: "approve" if no blocker or should_fix is open, else "changes_requested".
- findings: each with a short unique id like R1-1, a severity ("blocker", "should_fix", or "nit"), a kind ("test" if the fix belongs in a test file, else "code"), the file (or null), a title, and detail. An empty list is a fine answer.
- summary, assumptions.`

/**
 * The instructions a role's agent gets, appended to Claude Code's own system
 * prompt. No stock skills: every role gets only these. They name the exact
 * commands the role may run, forbid git, GitHub, and the network, and say
 * what the structured result holds. A refactor ticket's implementer (who
 * may edit tests) is told it may follow renames into test files.
 *
 * @example
 * const append = roleInstructions({ role: 'implementer', may_edit_tests: false, config })
 */
export const roleInstructions = ({
    role,
    may_edit_tests,
    config,
}: {
    role: AgentRole
    may_edit_tests: boolean
    config: EngineConfig
}): string => {
    const task: Record<AgentRole, string> = {
        'test-writer': TEST_WRITER({ config }),
        implementer: IMPLEMENTER({ config, may_edit_tests }),
        'ticket-reviewer': REVIEWER,
    }
    return [task[role], shellRules({ role, config }), COMMON].join('\n\n')
}
