import { rejoinOpening, type RejoinContext } from '../agents/role-prompts'
import type { AgentFailure } from '../journal/journal-record'
import type { ReplayedGates, ReplayedRedCheck } from '../journal/replay'
import { clipOutput } from '../shell/run-command'

/** Each failed gate's name and (clipped) output. */
export const failedChecks = ({ gates }: { gates: ReplayedGates }): string =>
    gates.checks
        .filter(({ ok }) => !ok)
        .map(
            ({ name, output }) =>
                `${name} failed:\n${clipOutput({ text: output })}`
        )
        .join('\n\n')

/**
 * The follow-up a test-writer gets when its tests fail the red check: the
 * problems and the test run's output. The engine journals it word for word.
 *
 * @example
 * const message = redFixMessage({ red_check })
 */
export const redFixMessage = ({
    red_check,
}: {
    red_check: ReplayedRedCheck
}): string =>
    [
        'The red check failed. Every criterion needs a test, every new test must fail before any code is written, and every old test must still pass.',
        'Fix the tests, then answer again with the full criterion mapping.',
        `## Problems\n\n${red_check.problems.map((problem) => `- ${problem}`).join('\n')}`,
        `## Test output\n\n${clipOutput({ text: red_check.output })}`,
    ].join('\n\n')

/**
 * The follow-up an implementer gets when the gates fail: each failed gate's
 * output. The engine journals it word for word.
 *
 * @example
 * const message = gateFixMessage({ gates })
 */
export const gateFixMessage = ({ gates }: { gates: ReplayedGates }): string =>
    [
        'The gates failed. Fix the code so every gate passes, then answer again.',
        failedChecks({ gates }),
    ].join('\n\n')

const FAILED_TRY_OPENINGS: Record<Exclude<AgentFailure, 'engine'>, string> = {
    agent: 'Your last turn failed before it gave a result.',
    result: "Your last turn ended without a result that fits your role's schema.",
    guard: 'Your last turn changed things your role may not change.',
}

/**
 * The follow-up an agent gets after a failed try (its turn failed, gave no
 * usable result, or broke its role's rules): what failed, the error, that
 * the engine undid every change the role may not make, and to try again.
 * The engine journals it word for word.
 *
 * @example
 * const message = failedTryMessage({ failure: 'guard', error: '- wrote src/sum.ts, which a test-writer may not write' })
 */
export const failedTryMessage = ({
    failure,
    error,
}: {
    failure: Exclude<AgentFailure, 'engine'>
    error: string
}): string =>
    [
        FAILED_TRY_OPENINGS[failure],
        `## Error\n\n${clipOutput({ text: error })}`,
        "The engine undid every change your role may not make; the rest of your work is still in the worktree. Try again, keeping to your role's rules, then answer with your full result.",
    ].join('\n\n')

/**
 * The follow-up the implementer gets when its ticket's code clashed with the
 * run branch: what happened, the files with conflict markers, and to resolve
 * them. The engine journals it word for word.
 *
 * @example
 * const message = clashFixMessage({ rejoin })
 * // "... These files have conflict markers:\n\n- src/index.ts ..."
 */
export const clashFixMessage = ({
    rejoin,
}: {
    rejoin: RejoinContext
}): string =>
    [
        rejoinOpening({ rejoin }),
        `These files have conflict markers:\n\n${rejoin.code.map((file) => `- ${file}`).join('\n')}`,
        'Resolve them so the code keeps both what the run branch has and what this ticket adds. ' +
            'Never edit a test file. Make every gate pass, then answer again.',
    ].join('\n\n')

/**
 * The section a fresh agent gets when a crash cut off an earlier agent's
 * turn at its step: it starts fresh, and the worktree may hold that turn's
 * partial edits.
 *
 * @example
 * const sections = [CRASH_SECTION]
 */
export const CRASH_SECTION = [
    '## A crash cut off an earlier try',
    "The engine crashed while an earlier agent in your role was working on this step, and that agent's session is gone, so you start fresh. " +
        'The worktree may still hold its partial, uncommitted edits: look at them, keep what is right, and finish the job.',
].join('\n\n')

/**
 * The section a fresh agent gets in place of a follow-up whose session is
 * gone (a crash cut it off): the follow-up message, word for word.
 *
 * @example
 * followUpSection({ message: gateFixMessage({ gates }) })
 * // '## A message for your role\n\n...\n\nThe gates failed. ...'
 */
export const followUpSection = ({ message }: { message: string }): string =>
    [
        '## A message for your role',
        'The engine sent this to an earlier agent in your role, whose session is gone. It is yours now: act on it.',
        message,
    ].join('\n\n')
