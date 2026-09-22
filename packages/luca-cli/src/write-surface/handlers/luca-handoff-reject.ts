/**
 * `luca handoff reject` — decline a handoff envelope (`-> rejected`).
 *
 * Legal from `pending` and from `accepted` (`handoff-transitions.ts:18-19`);
 * every other source status is refused by the transport with
 * `illegal-transition`. Notably `in-progress` has NO edge to `rejected` — a
 * receiving repo that has already started must finish through `complete` (or
 * `failed`, which this phase ships no verb for).
 *
 * SECURITY — `--reason` is UNTRUSTED operator free text. It is stored verbatim
 * as the `statusHistory` note and echoed back, and it is NEVER interpolated
 * into instruction text handed to a model.
 *
 * CAS — same seam as `accept`: the token is the envelope's own `updatedAt`,
 * read immediately before the write; `expectedUpdatedAt` is an optional
 * override.
 */
import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import {
    formatHandoffFailure,
    resolveHandoffTransport,
} from '../helpers/handoff-transport.ts'

const inputSchema = z.object({
    id: z
        .string()
        .min(1)
        .describe(
            'Envelope id to reject (as shown by `luca handoff list`). Required.'
        ),
    reason: z
        .string()
        .optional()
        .describe(
            'Optional decline reason, stored verbatim as the statusHistory note. UNTRUSTED free text — displayed, never interpolated into instructions.'
        ),
    expectedUpdatedAt: z
        .string()
        .optional()
        .describe(
            'Optional compare-and-set override. Defaults to the updatedAt read from the envelope immediately before the write.'
        ),
})

export const lucaHandoffRejectTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_handoff_reject',
    description:
        'Reject a cross-repo handoff envelope (pending|accepted -> rejected), optionally recording a reason. Terminal — a rejected envelope has no outgoing transition. Phase-agnostic.',
    inputSchema,
    async handler(args, ctx) {
        const { transport } = resolveHandoffTransport({ homedir: ctx.homedir })

        const loaded = await transport.read(args.id)
        if (!loaded.ok) {
            return {
                content: [{ type: 'text', text: formatHandoffFailure(loaded) }],
                isError: true,
            }
        }

        const updated = await transport.updateStatus(args.id, 'rejected', {
            expectedUpdatedAt:
                args.expectedUpdatedAt ?? loaded.envelope.updatedAt,
            // Omitted entirely when absent — an empty-string note would be a
            // lie about the operator having said something.
            ...(args.reason === undefined ? {} : { note: args.reason }),
        })
        if (!updated.ok) {
            return {
                content: [{ type: 'text', text: formatHandoffFailure(updated) }],
                isError: true,
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text:
                        `handoff rejected: ${updated.envelope.id}\n` +
                        `  status: ${updated.envelope.status}\n` +
                        `  reason: ${args.reason ?? '(none given)'}`,
                },
            ],
        }
    },
}
