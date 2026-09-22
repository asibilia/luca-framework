/**
 * `luca handoff list` — list envelopes in the machine-global mailbox.
 *
 * Pure read. Defaults to "addressed to THIS repo" (`ctx.cwd`), because the
 * mailbox is flat and machine-global and the overwhelmingly common question is
 * "what is waiting for me".
 *
 * SECURITY — `autoAcceptable` is computed from `ctx.cwd`'s OWN
 * `.luca/config.json` allowlist and nothing else. Reading a config out of an
 * envelope's self-declared `target.repoPath` would be an unauthenticated read
 * driven by untrusted data, so an envelope addressed anywhere other than
 * `ctx.cwd` is reported `autoAcceptable: false` regardless of what any other
 * repo's config says. The allowlist is convenience, not a security boundary
 * (see `is-auto-acceptable.ts`).
 */
import {
    isAutoAcceptable,
    HandoffStatus,
    type HandoffEnvelope,
    type HandoffFilter,
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
 * record.
 *
 * Deliberately declared here and NOT added to a luca-core config schema:
 * `.luca/config.json` has no top-level schema (each consumer applies its own
 * section schema — the `resolve-run-budget.ts` precedent), and this phase's
 * scope fence keeps luca-core's handoff module untouched. Fails closed: any
 * parse failure yields an empty allowlist, which denies every auto-accept.
 */
const HandoffConfigSectionSchema = z.object({
    autoAcceptFrom: z.array(z.string()).default([]),
})

const inputSchema = z.object({
    status: HandoffStatus.optional().describe(
        'Restrict to one lifecycle status (pending, accepted, in-progress, complete, rejected, failed, cancelled).'
    ),
    // NO schema default, deliberately: a `.default(...)` would erase the
    // "explicitly supplied" signal that the mutual-exclusion refusal below
    // needs, and Zod defaults cannot see `ctx` anyway. The `ctx.cwd` fallback
    // is applied in the handler, AFTER the refusal check.
    targetRepo: z
        .string()
        .optional()
        .describe(
            'Absolute repo path to list envelopes for. Defaults to the current repo. Mutually exclusive with --all-targets.'
        ),
    allTargets: z
        .boolean()
        .default(false)
        .describe(
            'List envelopes addressed to every repo on this machine. Mutually exclusive with --target-repo.'
        ),
    json: z
        .boolean()
        .default(false)
        .describe(
            'Emit the annotated envelope array as JSON instead of a human summary.'
        ),
})

/** An envelope plus the cwd-scoped auto-accept annotation. */
interface AnnotatedEnvelope extends HandoffEnvelope {
    autoAcceptable: boolean
}

/**
 * One line per envelope.
 *
 * `origin.repoPath` / `target.repoPath` are SENDER-CONTROLLED free text and go
 * through `toSingleLine`: this is the deliberately low-exposure triage surface
 * (`intent` and `acceptanceCriteria` are withheld from it, and reachable only
 * via `--json`), so a multi-line repoPath would reintroduce attacker-authored,
 * instruction-shaped lines into exactly the view designed to exclude them.
 * One envelope must occupy exactly one line.
 */
function summarize(entries: AnnotatedEnvelope[]): string {
    if (entries.length === 0) return 'no handoff envelopes matched'
    return entries
        .map(
            (e) =>
                `${e.id}  [${e.status}]  from ${toSingleLine(e.origin.repoPath)} -> ${toSingleLine(e.target.repoPath)}` +
                `${e.autoAcceptable ? '  (auto-acceptable)' : ''}`
        )
        .join('\n')
}

export const lucaHandoffListTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_handoff_list',
        description:
            'List cross-repo handoff envelopes from ~/.luca/handoff/. Defaults to envelopes addressed to the current repo; --all-targets widens to every repo. Pure read, phase-agnostic.',
        inputSchema,
        async handler(args, ctx) {
            // Mutual exclusion. Either precedence rule would SILENTLY discard
            // an explicit instruction, so refuse instead of guessing.
            if (args.targetRepo !== undefined && args.allTargets) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'luca handoff list: --target-repo and --all-targets are mutually exclusive — pass at most one.',
                        },
                    ],
                    isError: true,
                }
            }

            const filter: HandoffFilter = {
                ...(args.status === undefined ? {} : { status: args.status }),
                ...(args.allTargets
                    ? {}
                    : { targetRepoPath: args.targetRepo ?? ctx.cwd }),
            }

            const { transport } = resolveHandoffTransport({
                homedir: ctx.homedir,
            })
            const listed = await transport.list(filter)
            if (!listed.ok) {
                return {
                    content: [
                        { type: 'text', text: formatHandoffFailure(listed) },
                    ],
                    isError: true,
                }
            }

            const parsedSection = HandoffConfigSectionSchema.safeParse(
                (await loadCurrentConfig({ cwd: ctx.cwd })).handoff
            )
            const allowlist = parsedSection.success
                ? parsedSection.data.autoAcceptFrom
                : []

            const entries: AnnotatedEnvelope[] = listed.envelopes.map(
                (envelope) => ({
                    ...envelope,
                    autoAcceptable:
                        envelope.target.repoPath === ctx.cwd
                            ? isAutoAcceptable(envelope, allowlist)
                            : false,
                })
            )

            return {
                content: [
                    {
                        type: 'text',
                        text: args.json
                            ? JSON.stringify(entries, null, 2)
                            : summarize(entries),
                    },
                ],
            }
        },
    }
