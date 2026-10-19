import type { BoardRecord } from './board-vocabulary'
import {
    COMMITTED,
    event,
    finalFinishedText,
    finalStartedText,
    finishedText,
    ignoredText,
    learnerFinishedText,
    lowerFirst,
    messageText,
    nothingToDoText,
    on,
    recalledText,
    savedText,
    SHIPPED_TEXT,
    startedText,
} from './record-texts'
import {
    failureText,
    finalReasonText,
    LEARNER,
    reasonText,
    RETRY_REFUSED_TEXT,
    rebasedText,
    runReasonText,
    roleWords,
    shortSha,
    testsSentBackText,
} from './reduce-board'

import type { Tone } from '../shared/board-rows'
import {
    LOOP_CAP,
    stoppedText,
    windowWords,
    type BoardState,
    type FindingCounts,
} from '../shared/board-state'

const findingsText = ({ findings }: { findings: FindingCounts }): string => {
    const parts = [
        findings.blocker > 0 ? `${findings.blocker} blocker` : null,
        findings.should_fix > 0 ? `${findings.should_fix} should-fix` : null,
        findings.nit > 0 ? `${findings.nit} nit` : null,
    ].filter((part) => part !== null)
    return parts.length > 0 ? parts.join(', ') : 'no findings'
}

/**
 * What a record means in one line, or `null` for records that are noise in
 * a chat (snapshots, session summaries, a clean leftover scan, the decision
 * model's asks in shadow mode, ...).
 */
export const describeRecord = ({
    before,
    after,
    record,
}: {
    before: BoardState
    after: BoardState
    record: BoardRecord
}): { text: string; tone: Tone } | null => {
    const at = on({ ticket: record.ticket })
    switch (record.kind) {
        case 'run_started':
            return event({
                text: `The run started on spec #${record.content.spec_number}.`,
                tone: 'info',
            })
        // Only a resume on a different Luca version is worth a row.
        case 'engine_resumed':
            return after.run.version_note !== null &&
                after.run.version_note !== before.run.version_note
                ? event({ text: after.run.version_note, tone: 'warning' })
                : null
        case 'config_reloaded':
            return event({
                text: `Config reloaded: ${record.content.changes.map(({ field }) => field).join(', ')} changed.`,
                tone: 'info',
            })
        case 'decision_model_off':
            return event({
                text: `Decision model off: ${record.content.detail}`,
                tone: 'info',
            })
        case 'config_reload_refused':
            return event({
                text: `Config not reloaded, so the run keeps its own: ${record.content.reason.split('\n')[0] ?? ''}`,
                tone: 'warning',
            })
        case 'intake_refused':
            return event({
                text: `Intake refused the run. ${after.run.refusal.join('; ')}`,
                tone: 'danger',
            })
        case 'nothing_to_do':
            return event({
                text: nothingToDoText({ content: record.content }),
                tone: 'info',
            })
        case 'spec_snapshot': {
            const { spec, ticket_order, left_out } = record.content
            const people =
                left_out.length === 0
                    ? ''
                    : ` ${left_out.length} left for a person: ${left_out.map(({ number }) => `#${number}`).join(', ')}.`
            return event({
                text: `Intake passed: spec #${spec.number}, ${ticket_order.length} tickets.${people}`,
                tone: 'success',
            })
        }
        case 'run_branch_created':
            return event({
                text: `The run branch ${record.content.branch} is ready.`,
                tone: 'info',
            })
        case 'ticket_worktree_created':
            return event({ text: `${at}started.`, tone: 'info' })
        case 'usage_line_wait_started': {
            const { line, percent, resets_at } = record.content
            const window = windowWords({ window: record.content.window })
            return event({
                text: `Paused at the ${window} usage line: the account's ${window} window is at ${percent}% (line ${line}%). The run carries on when it resets at ${resets_at}, or once the line is raised.`,
                tone: 'warning',
            })
        }
        case 'usage_line_wait_ended':
            return event({
                text: 'The run carries on from the usage line.',
                tone: 'info',
            })
        case 'dependencies_installed': {
            const { check } = record.content
            if (check === null || check.ok) return null
            const where =
                record.ticket === null
                    ? "The run branch's install"
                    : `${at}the install`
            return event({
                text: `${where} failed: \`${check.command}\`.`,
                tone: 'danger',
            })
        }
        case 'agent_started':
            if (record.content.role === LEARNER) {
                return event({
                    text: "The learner reads the run's journal for lessons to keep.",
                    tone: 'info',
                })
            }
            return record.ticket === null
                ? finalStartedText({ record })
                : startedText({ before, after, record })
        case 'agent_finished':
            if (record.content.role === LEARNER) {
                return learnerFinishedText({ record })
            }
            return record.ticket === null
                ? finalFinishedText({ record })
                : finishedText({ before, record })
        case 'agent_failed': {
            const { role, error, failure } = record.content
            const who =
                role === LEARNER
                    ? 'The learner'
                    : record.ticket === null
                      ? `Final review: the ${roleWords({ role })}`
                      : `${at}the ${role}`
            return event({
                text: `${who} ${failureText({ failure })}: ${error.split('\n')[0] ?? ''}`,
                tone: failure === 'engine' ? 'warning' : 'danger',
            })
        }
        case 'run_stopped': {
            const text = stoppedText(record.content)
            return event({
                text: `${at}${text.charAt(0).toLowerCase()}${text.slice(1)}`,
                tone: 'danger',
            })
        }
        case 'worktree_reset':
            return event({
                text: `${at}starting over from the tests after a bad test.`,
                tone: 'warning',
            })
        case 'red_check': {
            const failing = after.tickets.find(
                (ticket) => ticket.number === record.ticket
            )?.tests?.failing
            return record.content.ok
                ? event({
                      text: `${at}red check passed${failing ? ` (${failing} new tests fail)` : ''}.`,
                      tone: 'success',
                  })
                : event({
                      text: `${at}red check failed: ${record.content.problems[0] ?? 'no detail'}`,
                      tone: 'danger',
                  })
        }
        case 'leftover_scan':
            return record.content.hits.length === 0
                ? null
                : event({
                      text: `${record.ticket === null ? 'Final review: ' : at}the leftover scan found ${record.content.hits.map((hit) => hit.path).join(', ')}.`,
                      tone: 'warning',
                  })
        case 'commit_made':
            return record.ticket === null
                ? event({
                      text: 'Final review: the fixes committed on the run branch.',
                      tone: 'info',
                  })
                : event({
                      text: `${at}${COMMITTED[record.content.stage] ?? 'tests'} committed.`,
                      tone: 'info',
                  })
        case 'gates_run': {
            const failed = record.content.checks
                .filter((check) => !check.ok)
                .map((check) => check.name)
            // The final review's slow tests, after round 1's lenses (#563).
            if (record.content.target === 'final_slow') {
                return record.content.ok
                    ? event({
                          text: 'Final review: slow tests passed.',
                          tone: 'success',
                      })
                    : event({
                          text: `Final review: slow tests failed: ${failed.join(', ') || 'no detail'}.`,
                          tone: 'danger',
                      })
            }
            const where =
                record.ticket === null
                    ? ' on the fixes'
                    : record.content.target === 'run_branch'
                      ? ' after joining'
                      : ''
            const who = record.ticket === null ? 'Final review: ' : at
            return record.content.ok
                ? event({
                      text: `${who}checks passed${where}.`,
                      tone: 'success',
                  })
                : event({
                      text: `${who}checks failed${where}: ${failed.join(', ') || 'no detail'}.`,
                      tone: 'danger',
                  })
        }
        case 'ticket_joined':
            return record.content.ok
                ? event({
                      text: `${at}joined the run branch.`,
                      tone: 'success',
                  })
                : event({
                      text: `${at}couldn't join the run branch: ${record.content.error ?? 'no detail'}`,
                      tone: 'danger',
                  })
        case 'ticket_rebased':
            return event({
                text: `${at}${lowerFirst({ text: rebasedText({ content: record.content }) })}.`,
                tone: 'warning',
            })
        case 'tests_sent_back':
            return event({
                text: `${at}${lowerFirst({ text: testsSentBackText({ content: record.content }) })}.`,
                tone: 'warning',
            })
        case 'ticket_stuck':
            return event({
                text: `${at}stuck. ${reasonText({ reason: record.content.reason })}`,
                tone: 'danger',
            })
        case 'run_stuck':
            return event({
                text: `The run is stuck. ${runReasonText({ reason: record.content.reason })}`,
                tone: 'danger',
            })
        case 'pull_request_opened':
            return event({
                text: `Pull request #${record.content.number} opened: ${record.content.url}`,
                tone: 'success',
            })
        case 'reply_received': {
            const ticket = record.content.ticket ?? record.ticket
            return event({
                text: `You replied \`${record.content.word}${ticket === null ? '' : ` #${ticket}`}\`.`,
                tone: 'info',
            })
        }
        case 'ticket_already_done':
            return event({
                text: `${at}already done on the base branch, by ${record.content.shas.map((sha) => shortSha({ sha })).join(', ')}. Nothing to build.`,
                tone: 'success',
            })
        case 'ticket_closed':
            return event({
                text: `${at}closed, since its work was already done.`,
                tone: 'info',
            })
        case 'ticket_skipped': {
            const { because } = record.content
            return event({
                text:
                    because === null
                        ? `${at}skipped. It stays open for a later run.`
                        : `${at}skipped, since it waits on #${because}, which was skipped. It stays open for a later run.`,
                tone: 'info',
            })
        }
        case 'ticket_retried':
            switch (record.content.mode) {
                case 'resume':
                    return null
                case 'restart':
                    return event({
                        text: `${at}starts over from the edited ticket.`,
                        tone: 'info',
                    })
                case 'refused':
                    return event({
                        text: `${at}the retry was refused: ${lowerFirst({ text: RETRY_REFUSED_TEXT })} ${record.content.problems.join(' ')}`.trimEnd(),
                        tone: 'warning',
                    })
            }
            break
        case 'reply_ignored':
            return event({
                text: `Your reply was sent back: ${ignoredText({ reason: record.content.reason, before })}. The answer is on the spec issue.`,
                tone: 'warning',
            })
        case 'final_review_started':
            return event({
                text: `The final review started (round ${after.final_review.round}).`,
                tone: 'info',
            })
        case 'lens_finished':
            return event({
                text: `Final review, ${record.content.lens} lens: ${findingsText({ findings: record.content.findings })}.`,
                tone:
                    record.content.findings.blocker +
                        record.content.findings.should_fix >
                    0
                        ? 'warning'
                        : 'success',
            })
        case 'final_review_fixing':
            return event({
                text: `Final review: fix round ${record.content.round}/${LOOP_CAP}.`,
                tone: 'warning',
            })
        case 'final_review_stuck':
            return event({
                text: `The final review is stuck. ${finalReasonText({ reason: record.content.reason })}`,
                tone: 'danger',
            })
        case 'final_review_passed':
            return event({ text: 'The final review passed.', tone: 'success' })
        case 'agent_message':
            return messageText({ record })
        case 'final_review_shipped':
            return event({ text: SHIPPED_TEXT, tone: 'info' })
        case 'memory_recalled':
            return recalledText({ record })
        case 'memories_saved':
            return savedText({ record })
        case 'learning_skipped':
            return event({
                text: `The learner was skipped: ${record.content.reason.split('\n')[0] ?? ''} The run ends without new memories.`,
                tone: 'warning',
            })
        case 'memories_reported':
            return event({
                text: `The ${record.content.count} new ${record.content.count === 1 ? 'memory went' : 'memories went'} on the spec issue, since there is no PR.`,
                tone: 'info',
            })
        case 'intake_read':
        case 'ticket_snapshot':
        case 'baseline_tests':
        case 'baseline_reused':
        case 'run_branch_pushed':
        case 'worktrees_removed':
        case 'agent_session':
        case 'jev_asked':
        case 'jev_answered':
        case 'jev_failed':
        case 'agent_message_delivered':
        case 'shared_git_changed':
        case 'limit_wait_started':
        case 'limit_wait_ended':
        case 'usage_recorded':
        case 'lens_started':
        case 'step_started':
        case 'step_ended':
            return null
    }
}
