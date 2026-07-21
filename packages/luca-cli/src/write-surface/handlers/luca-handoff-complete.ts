/**
 * `luca handoff complete` — attach the receiving repo's result and reach
 * `complete`.
 *
 * DRIVE-THROUGH. `HANDOFF_TRANSITIONS` has no `accepted -> complete` edge:
 * the only route is `accepted -> in-progress -> complete`. Rather than making
 * every receiver run a nonexistent `start` verb first, this handler DRIVES that
 * route as two sequential compare-and-set'd `updateStatus` calls, taking hop
 * 2's token from hop 1's returned envelope. From `in-progress` it is a single
 * hop. Any other source status is left to the transport, which refuses it with
 * `illegal-transition`.
 *
 * PAYLOAD IS VALIDATED BEFORE HOP 1. `HandoffResultSchema.safeParse` runs
 * FIRST — before any status is touched — because the alternative strands the
 * envelope: hop 1 succeeds, hop 2 is refused for a bad payload, and the
 * envelope is left at `in-progress` with no edge back to `accepted`
 * (`in-progress` can only reach `complete`, `failed` or `cancelled`). Moving
 * this parse after hop 1 is exactly the regression the ac-19.3 probe catches.
 *
 * RESIDUAL PARTIAL FAILURE. A hop-2 `io-error` or `conflict` can still strand
 * the envelope at `in-progress`. That is NOT rollback-able and NOT
 * reject-able, so the failure text names the resulting status AND the recovery
 * — re-running `luca handoff complete`, which then takes the single-hop path.
 *
 * SECURITY — `notes` / `evidence` are UNTRUSTED free text authored by the
 * receiving repo. Stored and displayed, never interpolated into instructions.
 */
import {
    HandoffResultSchema,
    type HandoffStatus,
} from '@alecsibilia/luca-core/handoff'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import {
    formatHandoffFailure,
    resolveHandoffTransport,
} from '../helpers/handoff-transport.ts'

/**
 * Note recorded on the intermediate hop, so the audit trail says WHY an
 * `in-progress` entry exists that no operator asked for.
 */
const DRIVE_THROUGH_NOTE =
    'auto-advanced by `luca handoff complete` (accepted -> in-progress is a required intermediate hop)'

/**
 * The input is FLAT — the `--file` payload's own keys sit at the top level
 * alongside `id`, matching `luca handoff send`. The result fields are declared
 * `z.unknown()` DELIBERATELY: validating them here would move the refusal into
 * `runWriteHandler`'s schema check and leave the handler itself unable to
 * refuse a bad payload, which is precisely the pre-hop-1 guarantee this
 * command exists to make. `HandoffResultSchema` is the real gate, applied in
 * the handler, and it strips `id` / `expectedUpdatedAt` on its way through.
 */
const inputSchema = z.object({
    id: z
        .string()
        .min(1)
        .describe(
            'Envelope id to complete (as shown by `luca handoff list`). Required.'
        ),
    expectedUpdatedAt: z
        .string()
        .optional()
        .describe(
            'Optional compare-and-set override for the FIRST hop. Defaults to the updatedAt read from the envelope immediately before the write.'
        ),
    outcome: z
        .unknown()
        .describe(
            'Terminal verdict: "success" | "partial" | "failure". Validated against HandoffResultSchema before any status changes.'
        ),
    phaseSlug: z
        .unknown()
        .describe(
            'The phase slug this repo filed the work under, in its own roadmap.'
        ),
    notes: z
        .unknown()
        .optional()
        .describe('Free-form completion notes. UNTRUSTED text.'),
    evidence: z
        .unknown()
        .optional()
        .describe('Evidence references (paths, commands, shas). UNTRUSTED.'),
})

/**
 * Explain a hop-2 failure: the status the envelope is now stuck at, and the
 * recovery.
 *
 * Exported because the stranded state is a real operator-facing outcome, not
 * an internal detail — the phase-3 triage surface renders the same sentence.
 *
 * @param status - The envelope's status after the failed hop (`in-progress`
 *   whenever hop 1 succeeded).
 * @returns A single operator-actionable line naming the status and recovery.
 *
 * @example
 * ```typescript
 * describeCompleteHopFailure('in-progress')
 * // '... left at "in-progress" ... re-run `luca handoff complete` ...'
 * ```
 */
export function describeCompleteHopFailure(status: HandoffStatus): string {
    return (
        `the envelope is left at "${status}" — the completion payload was ` +
        `never attached. There is no rollback edge, so recover by re-running ` +
        `luca handoff complete with the same payload; from "${status}" it ` +
        `takes the single-hop path.`
    )
}

export const lucaHandoffCompleteTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_handoff_complete',
    description:
        'Complete a cross-repo handoff envelope, attaching the result payload. Drives accepted -> in-progress -> complete as two compare-and-set hops; the payload is validated BEFORE the first hop so an invalid result can never strand the envelope. Phase-agnostic.',
    inputSchema,
    async handler(args, ctx) {
        // ---- payload validation, BEFORE any status is touched --------------
        const parsedResult = HandoffResultSchema.safeParse({
            outcome: args.outcome,
            phaseSlug: args.phaseSlug,
            ...(args.notes === undefined ? {} : { notes: args.notes }),
            ...(args.evidence === undefined ? {} : { evidence: args.evidence }),
        })
        if (!parsedResult.success) {
            return {
                content: [
                    {
                        type: 'text',
                        text:
                            `luca handoff complete: refused — the --file result payload is invalid: ` +
                            parsedResult.error.issues
                                .map(
                                    (issue) =>
                                        `${issue.path.join('.') || '<root>'}: ${issue.message}`
                                )
                                .join('; ') +
                            `. No status was changed.`,
                    },
                ],
                isError: true,
            }
        }
        const result = parsedResult.data

        const { transport } = resolveHandoffTransport({ homedir: ctx.homedir })

        const loaded = await transport.read(args.id)
        if (!loaded.ok) {
            return {
                content: [{ type: 'text', text: formatHandoffFailure(loaded) }],
                isError: true,
            }
        }

        let token = args.expectedUpdatedAt ?? loaded.envelope.updatedAt
        let droveThrough = false

        // ---- hop 1 (only from `accepted`) ----------------------------------
        if (loaded.envelope.status === 'accepted') {
            const hop1 = await transport.updateStatus(args.id, 'in-progress', {
                expectedUpdatedAt: token,
                note: DRIVE_THROUGH_NOTE,
            })
            if (!hop1.ok) {
                return {
                    content: [
                        { type: 'text', text: formatHandoffFailure(hop1) },
                    ],
                    isError: true,
                }
            }
            token = hop1.envelope.updatedAt
            droveThrough = true
        }

        // ---- hop 2 ---------------------------------------------------------
        const hop2 = await transport.updateStatus(args.id, 'complete', {
            expectedUpdatedAt: token,
            result,
        })
        if (!hop2.ok) {
            return {
                content: [
                    {
                        type: 'text',
                        text:
                            formatHandoffFailure(hop2) +
                            (droveThrough
                                ? `\n  ${describeCompleteHopFailure('in-progress')}`
                                : ''),
                    },
                ],
                isError: true,
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text:
                        `handoff complete: ${hop2.envelope.id}\n` +
                        `  status:  ${hop2.envelope.status}\n` +
                        `  outcome: ${result.outcome}\n` +
                        `  phase:   ${result.phaseSlug}`,
                },
            ],
        }
    },
}
