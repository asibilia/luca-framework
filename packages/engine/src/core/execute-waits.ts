/**
 * Carries out the run's waits: a plan limit wait or a billing stop, and a
 * usage-line wait.
 */
import type { PlanAction } from './decide-plan'
import type { UsageLineAction } from './decide-usage-line'

import type { Journal } from '../journal/journal'
import {
    LIMIT_WAIT_NAP_MS,
    limitWaitComment,
    waitUntil,
    type EngineClock,
} from '../limits/limit-wait'
import {
    LINE_OF,
    usageLineEndedComment,
    usageLineWaitComment,
    type UsageLines,
} from '../limits/usage-line'
import { postCommentOnce, type CommentStep } from '../tracker/post-comment-once'
import type { Tracker } from '../tracker/tracker'

/**
 * Carries out a limit wait or a billing stop. A limit wait's start tells the
 * spec issue (unless it already heard of this reset) before it is journaled;
 * the wait itself sleeps by `clock` until its end, so a restarted engine
 * waits out only what is left.
 */
export const executePlanAction = async ({
    action,
    journal,
    tracker,
    clock,
    step,
}: {
    action: Exclude<PlanAction, { type: 'done' }>
    journal: Journal
    tracker: Tracker
    clock: EngineClock
    step: CommentStep
}): Promise<void> => {
    switch (action.type) {
        case 'start_limit_wait': {
            const { rate_limit_type, resets_at, until, ticket, role } = action
            if (action.announce) {
                await postCommentOnce({
                    tracker,
                    number: action.spec_number,
                    body: limitWaitComment({
                        rate_limit_type,
                        resets_at,
                        until,
                    }),
                    step,
                    n: 0,
                })
            }
            journal.append({
                kind: 'limit_wait_started',
                ticket: null,
                role: null,
                content: {
                    resets_at,
                    until,
                    rate_limit_type,
                    hit_ticket: ticket,
                    hit_role: role,
                },
            })
            return
        }
        case 'wait_for_limit':
            await waitUntil({ clock, until: action.until })
            journal.append({
                kind: 'limit_wait_ended',
                ticket: null,
                role: null,
                content: { until: action.until },
            })
            return
        case 'stop_for_billing':
            journal.append({
                kind: 'run_stopped',
                ticket: null,
                role: null,
                content: { reason: action.reason, role: null, billing: true },
            })
            return
    }
}

/**
 * Carries out a usage-line wait. Its start tells the spec issue, then is
 * journaled. The wait sleeps by `clock` in naps until its end, re-reading
 * the lines before each nap: a line raised above the reading ends it at
 * once. Its end tells the spec issue why the run carries on, then is
 * journaled.
 */
export const executeUsageLineAction = async ({
    action,
    journal,
    tracker,
    clock,
    read_usage_lines,
    step,
}: {
    action: UsageLineAction
    journal: Journal
    tracker: Tracker
    clock: EngineClock
    read_usage_lines: () => Promise<UsageLines>
    step: CommentStep
}): Promise<void> => {
    const { spec_number, window, line, percent, until } = action
    if (action.type === 'start_usage_line_wait') {
        const { resets_at } = action
        await postCommentOnce({
            tracker,
            number: spec_number,
            body: usageLineWaitComment({ window, line, percent, resets_at }),
            step,
            n: 0,
        })
        journal.append({
            kind: 'usage_line_wait_started',
            ticket: null,
            role: null,
            content: { window, line, percent, resets_at, until },
        })
        return
    }
    const end = Date.parse(until)
    let reason: 'reset' | 'line_raised' = 'reset'
    for (;;) {
        const lines = await read_usage_lines()
        if (lines[LINE_OF[window]] > percent) {
            reason = 'line_raised'
            break
        }
        const left = end - clock.now()
        if (left <= 0) break
        await clock.sleep(Math.min(left, LIMIT_WAIT_NAP_MS))
    }
    await postCommentOnce({
        tracker,
        number: spec_number,
        body: usageLineEndedComment({ window, percent, reason }),
        step,
        n: 0,
    })
    journal.append({
        kind: 'usage_line_wait_ended',
        ticket: null,
        role: null,
        content: { until, reason },
    })
}
