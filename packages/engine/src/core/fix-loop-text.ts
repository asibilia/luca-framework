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
