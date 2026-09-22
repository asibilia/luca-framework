/**
 * `luca handoff accept` — move an envelope `pending -> accepted`.
 *
 * TWO ACCEPTANCE PATHS, one transition. A bare `accept` is an EXPLICIT HUMAN
 * acceptance: the operator has read the envelope and is answering for it, so no
 * allowlist is consulted. `--auto` is the unattended path and is REFUSED unless
 * `isAutoAcceptable` says yes — and that helper denies on an absent or empty
 * allowlist (`is-auto-acceptable.ts:29-33`) and on any status other than
 * `pending`, so the safe default is always "a human accepts each envelope".
 * Which path was taken is recorded verbatim in the `statusHistory` note, since
 * after the fact the two are otherwise indistinguishable on disk.
 *
 * SECURITY — the allowlist is read from `ctx.cwd`'s OWN `.luca/config.json`,
 * never from the envelope's self-declared `target.repoPath`. It is convenience,
 * not a security boundary: auto-accept advances STATUS ONLY, never plans and
 * never executes.
 *
 * TARGET BOUNDARY — `--auto` additionally requires `target.repoPath === cwd`.
 * The allowlist names trusted SENDERS, so on its own it would let this repo
 * auto-accept an envelope addressed to a third repo. The bare human `accept`
 * is DELIBERATELY left cross-repo: an operator who reads an envelope and
 * answers for it is an authenticated decision (e.g. answering on behalf of a
 * sibling checkout), and it is exactly the unattended path that must not make
 * that call on its own.
 *
 * CAS — the compare-and-set token is the envelope's own `updatedAt`, read here
 * microseconds before the write. `expectedUpdatedAt` is an OPTIONAL override
 * for a caller that read the envelope earlier and wants the stronger guard.
 */
import {
    isAutoAcceptable,
    type HandoffEnvelope,
} from '@alecsibilia/luca-core/handoff'
import { loadCurrentConfig } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import {
    formatHandoffFailure,
    resolveHandoffTransport,
    toSingleLine,
} from '../helpers/handoff-transport.ts'

/**
 * LOCAL schema over the `handoff` section of the opaque `.luca/config.json`
 * record — same rationale (and same fail-closed default) as the copy in
 * `luca-handoff-list.ts`: `.luca/config.json` has no top-level schema, each
 * consumer applies its own section schema, and this phase's scope fence keeps
 * luca-core's handoff module untouched.
 */
const HandoffConfigSectionSchema = z.object({
    autoAcceptFrom: z.array(z.string()).default([]),
})

/** Notes recorded on the transition, distinguishing the two paths. */
const HUMAN_NOTE = 'accepted by human operator (explicit `luca handoff accept`)'
const AUTO_NOTE =
    'auto-accepted: origin.repoPath is listed in this repo handoff.autoAcceptFrom allowlist'

const inputSchema = z.object({
    id: z
        .string()
        .min(1)
        .describe(
            'Envelope id to accept (as shown by `luca handoff list`). Required.'
        ),
    auto: z
        .boolean()
        .default(false)
        .describe(
            'Unattended acceptance. REFUSED unless the envelope origin is listed in this repo handoff.autoAcceptFrom allowlist; an absent or empty allowlist denies everything.'
        ),
    expectedUpdatedAt: z
        .string()
        .optional()
        .describe(
            'Optional compare-and-set override. Defaults to the updatedAt read from the envelope immediately before the write.'
        ),
})

/** Read `ctx.cwd`'s auto-accept allowlist. Fails closed to `[]`. */
async function readAllowlist(cwd: string): Promise<string[]> {
    const parsed = HandoffConfigSectionSchema.safeParse(
        (await loadCurrentConfig({ cwd })).handoff
    )
    return parsed.success ? parsed.data.autoAcceptFrom : []
}

/**
 * Why an `--auto` acceptance was refused because the envelope is addressed
 * somewhere else.
 *
 * @param envelope - the envelope that was read by id
 * @param cwd - this repo, i.e. the only legitimate target for an unattended
 *   acceptance
 * @returns one operator-actionable line naming the ACTUAL target
 */
function describeForeignTargetRefusal(
    envelope: HandoffEnvelope,
    cwd: string
): string {
    return (
        `luca handoff accept: refused --auto for "${envelope.id}" — it is ` +
        `addressed to "${toSingleLine(envelope.target.repoPath)}", not to ` +
        `this repo ("${cwd}"). Unattended acceptance is only ever for ` +
        `envelopes addressed HERE; the handoff.autoAcceptFrom allowlist says ` +
        `which senders this repo trusts, never which envelopes are its own.`
    )
}

/** Why an `--auto` acceptance was refused, in operator-actionable terms. */
function describeAutoRefusal(envelope: HandoffEnvelope): string {
    return (
        `luca handoff accept: refused --auto for "${envelope.id}" — ` +
        `origin "${toSingleLine(envelope.origin.repoPath)}" is not in this repo ` +
        `handoff.autoAcceptFrom allowlist (or the envelope is no longer ` +
        `pending; it is "${envelope.status}"). Accept it explicitly with ` +
        `\`luca handoff accept --id ${envelope.id}\` after reviewing it.`
    )
}

export const lucaHandoffAcceptTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_handoff_accept',
    description:
        'Accept a pending cross-repo handoff envelope (pending -> accepted). A bare accept is explicit human acceptance; --auto is refused unless the origin repo is allowlisted in this repo handoff.autoAcceptFrom. Phase-agnostic.',
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
        const envelope = loaded.envelope

        if (args.auto) {
            // TARGET BOUNDARY, checked BEFORE the allowlist. `isAutoAcceptable`
            // matches on `origin.repoPath` only — it answers "do I trust this
            // sender", never "is this envelope mine". Without this guard, repo
            // B whose allowlist names repo A would auto-accept an A->C
            // envelope (ids are discoverable via `list --all-targets`),
            // forging an `accepted` status on a work order never addressed to
            // it and silently denying C its pending item. `luca handoff list`
            // already reports `autoAcceptable: false` for exactly this case,
            // so without the guard the annotation and the mutation disagree.
            if (envelope.target.repoPath !== ctx.cwd) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: describeForeignTargetRefusal(
                                envelope,
                                ctx.cwd
                            ),
                        },
                    ],
                    isError: true,
                }
            }
            const allowlist = await readAllowlist(ctx.cwd)
            if (!isAutoAcceptable(envelope, allowlist)) {
                return {
                    content: [
                        { type: 'text', text: describeAutoRefusal(envelope) },
                    ],
                    isError: true,
                }
            }
        }

        const updated = await transport.updateStatus(args.id, 'accepted', {
            expectedUpdatedAt: args.expectedUpdatedAt ?? envelope.updatedAt,
            note: args.auto ? AUTO_NOTE : HUMAN_NOTE,
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
                        `handoff accepted: ${updated.envelope.id}\n` +
                        `  status: ${updated.envelope.status}\n` +
                        `  path:   ${args.auto ? 'auto (allowlisted origin)' : 'human'}\n` +
                        `  origin: ${toSingleLine(updated.envelope.origin.repoPath)}`,
                },
            ],
        }
    },
}
