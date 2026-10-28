/**
 * A refactor ticket's bad test outside a rebase (#686): its first one gets
 * one refactor test update, where a fresh test-writer may change only the
 * named test file; then the implementer carries on.
 */

import { stuck, type BuildAction, type StepArgs } from './build-action'
import { launch } from './build-launch'
import { badTestDetail } from './stuck-text'

import { refactorTestFixedMessage } from '../agents/refactor-update-prompts'

/**
 * A refactor ticket's implementer answered `bad_test`. With a named file,
 * the first opens a refactor test update; one with no file, or one after
 * the update, is stuck.
 */
export const refactorBadTestStep = ({
    ticket,
    progress,
}: Pick<StepArgs, 'ticket' | 'progress'>): BuildAction => {
    const number = ticket.number
    const { bad_test } = progress
    const file = bad_test?.file ?? ''
    if (file === '') {
        return stuck({
            ticket: number,
            reason: 'bad_test',
            detail: `The implementer of a refactor ticket sent a test back as bad without naming its file: ${badTestDetail({ bad_test })}`,
        })
    }
    if (progress.refactor_updates > 0) {
        return stuck({
            ticket: number,
            reason: 'bad_test',
            detail: `The implementer of a refactor ticket sent a test back as bad a second time: ${badTestDetail({ bad_test })}`,
        })
    }
    return {
        type: 'open_refactor_update',
        ticket: number,
        file,
        reason: bad_test?.reason ?? '',
    }
}

/**
 * The open refactor test update: a fresh test-writer, the engine's check
 * of the test files it changed, then the implementer's follow-up (a fresh
 * one with the same message if its session is gone). No red check, and the
 * test-writer's mapping is not checked. `null` with no update open.
 */
export const refactorUpdateStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
}: StepArgs): BuildAction | null => {
    const update = progress.refactor_update
    if (update === null) return null
    const number = ticket.number
    const { result, changed, file } = update
    if (result === null) {
        return launch({
            role: 'test-writer',
            snapshot,
            ticket,
            progress,
            run_notes,
        })
    }
    if (changed === null) {
        return { type: 'check_refactor_update', ticket: number }
    }
    const others = changed.filter((path) => path !== file)
    if (others.length > 0) {
        return stuck({
            ticket: number,
            reason: 'bad_test',
            detail: `The test-writer fixing a refactor ticket's bad test changed other test files: ${others.join(', ')}`,
        })
    }
    if (result.outcome !== 'tests_written') {
        return stuck({
            ticket: number,
            reason: 'bad_test',
            detail: `The test-writer couldn't fix a refactor ticket's bad test: ${result.outcome}: ${result.summary}`,
        })
    }
    const message = refactorTestFixedMessage({ file })
    const session_id = progress.sessions.implementer
    if (session_id === undefined) {
        return launch({
            role: 'implementer',
            snapshot,
            ticket,
            progress,
            run_notes,
            follow_up: message,
        })
    }
    return {
        type: 'follow_up_agent',
        ticket: number,
        role: 'implementer',
        session_id,
        message,
    }
}
