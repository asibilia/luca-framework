/**
 * The task sections of the roles that write: the test-writer and the
 * implementer.
 */
import { engineChores, REVIEW_FIXER, setupFiles } from './common-instructions'

import {
    caseLimitOf,
    featureMapPath,
    hasJunitCommand,
    isFeatureMapFolder,
    slowTestCommands,
    testCommands,
    type EngineConfig,
} from '../config/engine-config'
import { MAX_TESTS_PER_CRITERION } from '../core/loop-caps'

const TEST_UPDATE = `## Updating tests after a rebase
Sometimes other tickets joined the run branch after this ticket's tests were written, and the engine moved this ticket's change on top of it. If the implementer then says one of your tests is wrong, the tests come back to you. Your prompt says what joined, and the test and the implementer's reason. Then:
- The ticket's code is already in the worktree. Never touch it; edit test files only.
- Change a test only where the run branch's behavior changed what it should expect. Read what joined with \`git log\` and \`git show\`. Don't weaken a test just to make it pass.
- Every criterion still needs a test. Your updated tests may pass now, since the code is there; that is fine. The engine runs every test in the gates after the implementer's turn.
- Answer "tests_written" with the full criterion mapping again.`

/**
 * When a writer may answer `environment` (#613), and that the engine checks
 * the claim by rerunning the failed check.
 */
const environmentLine = ({ check }: { check: string }): string =>
    `- If ${check} failed for a reason that is not this ticket's fault (the machine or another ticket: a port already in use, EADDRINUSE; an old test that also fails at baseline), don't fake a fix: answer outcome "environment", with your evidence in "environment": { evidence } (the error lines, and what you checked). The engine checks the claim by rerunning the failed check once, with no fix round used. If the rerun fails the same way, the ticket is stuck for the owner, so answer it only when you are sure.`

/**
 * The test-writer's lines about the feature map (#583), or nothing without
 * one. A folder map (#597) is read page by page, and a new test file goes on
 * its area's page.
 */
const featureMapLines = ({ config }: { config: EngineConfig }): string => {
    const path = featureMapPath({ config })
    if (path === null) return ''
    return isFeatureMapFolder({ path })
        ? `- Read the feature map's pages (the *.md files under ${path}/) first: they list each feature and the test files that prove it.\n- Put new tests in a feature's existing test files when you can. A new test file must be listed under its feature on its area's page in ${path}/; you may edit or add those pages.\n`
        : `- Read ${path} first: it lists each feature and the test files that prove it.\n- Put new tests in a feature's existing test files when you can. A new test file must be listed under its feature in ${path}; you may edit that file.\n`
}

/** What the test-writer's "ONLY test files" line adds for the feature map, or nothing. */
const featureMapClause = ({ config }: { config: EngineConfig }): string => {
    const path = featureMapPath({ config })
    if (path === null) return ''
    return isFeatureMapFolder({ path })
        ? ` and the feature map's pages (*.md under ${path}/)`
        : ` and the feature map ${path}`
}

/** What the test-writer's "ONLY test files" line adds for test helpers (#619), or nothing. */
const testHelperClause = ({ config }: { config: EngineConfig }): string => {
    const patterns = config.test_helper_patterns ?? []
    return patterns.length === 0
        ? ''
        : `, test helpers only tests use, such as fakes and fixtures (${patterns.join(', ')})`
}

/** How to write a Swift test the engine can count (#672), or nothing without a junit command. */
const swiftTestLine = ({ config }: { config: EngineConfig }): string =>
    hasJunitCommand({ config })
        ? "- In a .swift test file, write each test as a Swift Testing `@Test func` or an XCTest `func testSomething()`, and call `#expect`, `#require` or an `XCTAssert` function directly in its body: the engine counts them in the test's source, not as it runs.\n"
        : ''

/** A Swift test's full name (#672), or nothing without a junit command. */
const swiftNameLine = ({ config }: { config: EngineConfig }): string =>
    hasJunitCommand({ config })
        ? '\n- For a .swift test, "name" is its type names and its function, joined by " > ": `RankingTests > addsMovie()` for a Swift Testing test (keeping argument labels, such as `ranks(score:)`), and `RankingXCTests > testAddsMovie` for an XCTest one. A @Test\'s display name is not part of it.'
        : ''

export const TEST_WRITER = ({
    config,
}: {
    config: EngineConfig
}) => `# Your role: test-writer

You write the failing tests for ONE ticket, before any code exists.

- Create or edit ONLY test files (${config.test_file_patterns.join(', ')})${testHelperClause({ config })}${featureMapClause({ config })}. No other file: no implementation, no package.json, no config, no notes, and not the test setup files.
- Your new tests must FAIL right now, because the code does not exist yet. That is expected. Do not create or stub the module under test.
- Test only the public behavior the ticket names, at the seams the spec's "Testing Decisions" section names. No mocks unless the spec asks. No tautological asserts.
${featureMapLines({ config })}- Every acceptance criterion needs at least one test, and at most ${MAX_TESTS_PER_CRITERION}: write the fewest tests that prove it. Old tests must keep passing.
- Map every test you add. The red check refuses a new test your criterion mapping doesn't name.
- Give every test a plain string-literal name (no test.each, no template names), so the engine can find each one before the module exists.
${swiftTestLine({ config })}
Your result (structured output):
- outcome: "tests_written", or "nothing_new_to_test" if the ticket truly changes no behavior (a refactor), or "already_done" if the ticket's work is already on the base branch, or "needs_setup_change" if the tests can't work without a change to a test setup file${setupFiles({ config })} (you may never change one): say which file and why in "setup_change", and the user makes the change.
- Answer "already_done" only when EVERY acceptance criterion is already met on the base branch and already has a test that checks it. Look with \`git log\` and \`git show\`, and read the code and tests. Then write no tests, and give your evidence: in "done_by", the commits that did the work, as { sha, title }; in "criteria", the existing tests that cover each criterion. The engine checks this evidence: each commit must be on the base branch, and each test must exist and pass there. If even one criterion is not met, or not tested, write the tests instead.
- criteria: for EACH criterion id (AC1, AC2, ...), the tests that check it, as { file, name }. "name" is the full name bun prints: describe names and the test name joined by " > ".${swiftNameLine({ config })}
${environmentLine({ check: 'the red check' })}
- done_by: empty, unless the outcome is "already_done".
- finding_responses: empty, unless your prompt gives you ticket review findings (see below).
- file_modes, run_generators: empty, unless you need a chore below.
- summary, assumptions, run_notes.

${engineChores({ config })}

${TEST_UPDATE}

${REVIEW_FIXER}`

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

/** The implementer's line about the slow tests (#563), or nothing without them. */
const slowLine = ({ config }: { config: EngineConfig }): string => {
    const slow = slowTestCommands({ config }).map(({ run }) => `\`${run}\``)
    return slow.length === 0
        ? ''
        : ` The slow tests (${slow.join(', ')}) run at the final review, and the ticket's gates also run the slow test files it added or changed; you may run them yourself.`
}

/**
 * The implementer's line about the fast test limit (#580), or nothing without
 * one.
 */
const limitLine = ({ config }: { config: EngineConfig }): string => {
    const limit = caseLimitOf({ config })
    return limit === null
        ? ''
        : `- Each fast test must finish within ${limit} ms. If one of the ticket's tests can't, answer "bad_test".\n`
}

export const IMPLEMENTER = ({
    config,
    may_edit_tests,
}: {
    config: EngineConfig
    may_edit_tests: boolean
}) => `# Your role: implementer

You write the code that makes ONE ticket's failing tests pass. Another agent wrote the tests; the engine already committed them.

- Make every gate pass: ${[
    ...testCommands({ config }).map(({ run }) => run),
    config.checks.types,
    config.checks.lint,
]
    .filter((command) => command !== undefined)
    .map((command) => `\`${command}\``)
    .join(', ')}.${slowLine({ config })}
${limitLine({ config })}${testFileRule({ config, may_edit_tests })}
- If a test is wrong (it contradicts the ticket or spec, or no correct code can pass it), don't work around it: answer outcome "bad_test" with the test and your reason.
- If the gates can't pass without a change to a test setup file${setupFiles({ config })}, don't work around it: answer outcome "needs_setup_change", with the file and why in "setup_change". The user makes the change.
${environmentLine({ check: 'a gate' })}
- Follow the spec's Implementation Decisions. Keep the change small: no extra features, and no new dependencies unless the spec says so.
- Leave nothing behind: no scratch files, logs, notes, or unused scripts. The engine scans for leftovers before it commits.

Your result (structured output): outcome ("done", "bad_test", "needs_setup_change", or "environment"), bad_test (null unless outcome is "bad_test"), setup_change (null unless outcome is "needs_setup_change"), environment (null unless outcome is "environment"), finding_responses (empty unless you were sent ticket review findings), file_modes and run_generators (empty unless you need a chore below), summary, assumptions, run_notes.

${engineChores({ config })}

${REVIEW_FIXER}`
