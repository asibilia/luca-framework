/**
 * Write-surface handler: `luca state claim-owner`.
 *
 * Records the Claude Code `session_id` of the session that owns the current
 * pipeline run into `state.ownerSessionId`. The stage-gate hook reads this to
 * EXEMPT other ("bystander") sessions from phase/tool-matrix enforcement — a
 * separate terminal doing ad-hoc work in the same repo must not inherit the
 * restrictions of a pipeline it is not running.
 *
 * This is the SANCTIONED mutation path for `ownerSessionId`. The stage-gate
 * hook invokes this handler in-process rather than writing `state.json`
 * directly, so the "`.luca/state.json` is mutated solely through the `luca`
 * write surface" invariant holds: every `state.json` byte-write is owned by a
 * registered write-surface handler, never by an ad-hoc helper call from the
 * hook.
 *
 * Phase-agnostic (no `allowedPhases`): ownership is claimed by whoever runs
 * `luca state advance`, INCLUDING the idle → first-step advance that starts a
 * run. Idempotent — a no-op when the owner is already this session.
 */
import { mutateState } from '../helpers/mutate-state.ts'
import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'

const inputSchema = z.object({
    sessionId: z
        .string()
        .min(1)
        .describe(
            'Claude Code session_id of the session driving the run. Stored ' +
                'as state.ownerSessionId so the stage-gate can exempt other ' +
                '(bystander) sessions from phase enforcement.'
        ),
})

export const lucaStateClaimOwnerTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_state_claim_owner',
    description:
        'Record the Claude Code session that owns the current run ' +
        '(state.ownerSessionId). Idempotent and phase-agnostic — used by the ' +
        'stage-gate hook to scope phase enforcement to the owning session.',
    inputSchema,
    // No allowedPhases: ownership may be (re)claimed in any pipelineStep,
    // including idle (the idle → first-step advance that begins a run).
    handler: async ({ sessionId }, ctx) => {
        await mutateState(ctx.cwd, (s) =>
            s.ownerSessionId === sessionId
                ? s
                : { ...s, ownerSessionId: sessionId }
        )
        return {
            content: [{ type: 'text', text: `run owner set: ${sessionId}` }],
        }
    },
}
