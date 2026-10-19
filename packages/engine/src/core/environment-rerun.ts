/**
 * A writer's `environment` answer (#613): when its rerun makes the ticket
 * (or the final review) stuck as `environment_failed`, and the stuck
 * detail, with the agent's evidence and the clipped output. Pure.
 */
import { MAX_ENVIRONMENT_RERUNS } from './loop-caps'

import type {
    EnvironmentRerun,
    ReplayedGates,
    ReplayedRedCheck,
} from '../journal/replay'
import { clipOutput } from '../shell/run-command'

/** A red check or a gate run. */
type CheckRun = ReplayedRedCheck | ReplayedGates

/**
 * Longest output kept per failed check in the stuck detail, so the stuck
 * comment shows its start and its end.
 */
const OUTPUT_MAX = 2000

/** How a check failed: the red check's problems, or the failed gates' names. */
const failureKey = (run: CheckRun): string =>
    'checks' in run
        ? run.checks
              .filter(({ ok }) => !ok)
              .map(({ name }) => name)
              .sort()
              .join('\n')
        : [...run.problems].sort().join('\n')

/** The failure, with its clipped output. */
const failureText = (run: CheckRun): string =>
    'checks' in run
        ? run.checks
              .filter(({ ok }) => !ok)
              .map(
                  ({ name, output }) =>
                      `${name} failed:\n${clipOutput({ text: output, max: OUTPUT_MAX })}`
              )
              .join('\n\n')
        : [
              `The red check's problems:\n${run.problems.map((problem) => `- ${problem}`).join('\n')}`,
              `Test output:\n${clipOutput({ text: run.output, max: OUTPUT_MAX })}`,
          ].join('\n\n')

/**
 * Why an `environment` answer leaves the work stuck, or `null` to go on:
 * its rerun is past the cap of `MAX_ENVIRONMENT_RERUNS`, or `latest`, the
 * rerun, failed the same way (the same problems, or the same failed
 * gates). `latest` is `null` while the rerun is due.
 */
export const environmentFailedDetail = ({
    environment,
    reruns,
    latest,
}: {
    environment: EnvironmentRerun | null
    /** `environment` answers so far, this one included. */
    reruns: number
    latest: CheckRun | null
}): string | null => {
    if (environment === null) return null
    const answer = `The ${environment.role} answered "environment": ${environment.evidence}`
    if (latest === null) {
        if (reruns <= MAX_ENVIRONMENT_RERUNS) return null
        return [
            answer,
            `That is past the cap of ${MAX_ENVIRONMENT_RERUNS} environment reruns, so the check did not run again. It failed like this:`,
            failureText(environment.failed),
        ].join('\n\n')
    }
    if (latest.ok || failureKey(latest) !== failureKey(environment.failed)) {
        return null
    }
    return [
        answer,
        'The engine reran the check, and it failed the same way:',
        failureText(latest),
    ].join('\n\n')
}
