import type {
    CriterionTests,
    DoneCommit,
    TestWriterResult,
} from '../agents/role-results'
import type { TicketSnapshot } from '../intake/intake-schemas'

/**
 * A ticket whose work is already on the base branch (#484): its
 * test-writer answered `already_done`, with the commits that did the work
 * and the tests that already cover each criterion. The ticket is done, not
 * stuck, and nobody has to reply. The run's PR closes it; a run with no PR
 * closes it itself, and a run where every ticket was already done ends with
 * nothing to do.
 */
export type AlreadyDoneAction =
    /**
     * Tell the spec issue (`body`) that the ticket's work is already done by
     * `shas`, then journal the ticket as done.
     */
    | {
          type: 'mark_already_done'
          ticket: number
          spec_number: number
          shas: string[]
          body: string
      }
    /** Close an already-done ticket, with `body` as a comment on it. */
    | { type: 'close_ticket'; ticket: number; body: string }
    /**
     * End the run with nothing to do: at intake (`already_done` is empty),
     * or once every ticket's work was already done and those are closed.
     */
    | {
          type: 'finish_nothing_to_do'
          closed_tickets: number[]
          already_done: number[]
      }

/** How many characters of a sha the engine shows. */
const SHORT_SHA = 7

/**
 * A commit's short sha, as git and GitHub show it.
 *
 * @example
 * shortSha({ sha: '3559c25f5a1b2c3d' }) // '3559c25'
 */
export const shortSha = ({ sha }: { sha: string }): string =>
    sha.slice(0, SHORT_SHA)

/** The commits in words: `3559c25`, or `3559c25 (feat: add sum)`. */
const commitsText = ({ done_by }: { done_by: DoneCommit[] }): string =>
    done_by
        .map(({ sha, title }) =>
            title === '' ? shortSha({ sha }) : `${shortSha({ sha })} (${title})`
        )
        .join(', ')

const testsText = ({ criteria }: { criteria: CriterionTests[] }): string[] =>
    criteria.flatMap(({ criterion_id, tests }) =>
        tests.map(({ file, name }) => `- ${criterion_id}: ${file} > ${name}`)
    )

/**
 * The step that marks a ticket already done, from its test-writer's
 * `already_done`: the comment on the spec issue names the commits that
 * did the work and the tests that cover each criterion, and says nobody
 * has to reply.
 *
 * @example
 * alreadyDoneStep({ spec_number: 10, base_branch: 'main', ticket, result })
 * // { type: 'mark_already_done', ticket: 11, spec_number: 10, shas: ['3559c25f5...'], body: '**#11 is already done: Add sum** ...' }
 */
export const alreadyDoneStep = ({
    spec_number,
    base_branch,
    ticket,
    result,
}: {
    spec_number: number
    base_branch: string
    ticket: TicketSnapshot
    result: TestWriterResult
}): AlreadyDoneAction => {
    const tests = testsText({ criteria: result.criteria })
    const body = [
        `**#${ticket.number} is already done: ${ticket.title}**`,
        `The test-writer found this ticket's work already on \`${base_branch}\`, so this run builds nothing for it. It is done, not stuck: you don't need to reply.`,
        `Done by: ${commitsText({ done_by: result.done_by })}`,
        tests.length === 0
            ? ''
            : `Tests that already cover it:\n\n${tests.join('\n')}`,
        result.summary === '' ? '' : `The test-writer says: ${result.summary}`,
        "This run's PR closes it. If the run opens no PR, the engine closes it.",
    ]
    return {
        type: 'mark_already_done',
        ticket: ticket.number,
        spec_number,
        shas: result.done_by.map(({ sha }) => sha),
        body: body.filter((part) => part !== '').join('\n\n'),
    }
}

/**
 * The step that closes an already-done ticket in a run with no PR, with a
 * comment saying which commits did its work.
 *
 * @example
 * closeTicketStep({ spec_number: 10, base_branch: 'main', ticket: 11, shas })
 * // { type: 'close_ticket', ticket: 11, body: "Closing: this ticket's work is already on `main` ..." }
 */
export const closeTicketStep = ({
    spec_number,
    base_branch,
    ticket,
    shas,
}: {
    spec_number: number
    base_branch: string
    ticket: number
    shas: string[]
}): AlreadyDoneAction => ({
    type: 'close_ticket',
    ticket,
    body:
        `Closing: this ticket's work is already on \`${base_branch}\`, done by ${shas.map((sha) => shortSha({ sha })).join(', ')}. ` +
        `Luca's run for spec #${spec_number} found nothing left to build for it, so it opens no PR for it.`,
})

/**
 * An already-done ticket's line in the PR's ticket list, after its title.
 *
 * @example
 * alreadyDoneNote({ shas: ['3559c25f5a1b'] }) // ' (already done before this run, by 3559c25)'
 */
export const alreadyDoneNote = ({ shas }: { shas: string[] }): string =>
    ` (already done before this run, by ${shas.map((sha) => shortSha({ sha })).join(', ')})`
