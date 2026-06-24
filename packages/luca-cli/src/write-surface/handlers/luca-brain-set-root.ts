import { join } from 'node:path'

import { loadCurrentConfig, lucaRootPaths } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { MuninnConfigSectionSchema } from '../helpers/muninn-config.schema.ts'
import { resolveRepoVault } from '../helpers/resolve-repo-vault.ts'
import { writeAtomicFile } from '../helpers/write-atomic.ts'

/** ULID — 26 Crockford base32 chars, first char 0-7. Case-insensitive. */
const ULID_RE = /^[0-7][0-9ABCDEFGHJKMNPQRSTVWXYZ]{25}$/i

/**
 * A `brain:*` tree root concept (e.g. "brain:project-identity",
 * "brain:project-requirements"). Constrained so the value is safe to use as
 * a config key and to interpolate into agent-facing text.
 */
const BrainConceptSchema = z
    .string()
    .regex(/^brain:[a-z0-9](?:[a-z0-9:-]*[a-z0-9])?$/, {
        message: 'must be a brain tree concept like "brain:project-identity"',
    })

const inputSchema = z.object({
    concept: BrainConceptSchema.describe(
        'The brain tree root concept whose ULID is being cached (e.g. ' +
            '"brain:project-identity" or "brain:project-requirements").'
    ),
    id: z
        .string()
        .regex(ULID_RE, {
            message:
                'must be a 26-character ULID (the root_id returned by ' +
                'muninn_remember_tree)',
        })
        .describe(
            'The brain tree root engram ULID returned by ' +
                'muninn_remember_tree.'
        ),
})

/**
 * Persist a `brain:*` tree root ULID for the current repo vault.
 *
 * Local write (not a muninn delegation): records
 * `.luca/config.json#muninn.brainRoots[<concept>] = { vault, rootId }`. The
 * agent calls it once, immediately after `muninn_remember_tree` creates the
 * brain tree during `/project-new` (or `/seed-memory`), so later readers can
 * re-open the tree by its stable ULID via `muninn_recall_tree` rather than
 * the broken `recall_tree(id="brain:project-identity")` (recall_tree rejects
 * a concept as root_id).
 *
 * Vault-scoped, keyed by concept (so identity and requirements trees each get
 * their own entry); switching `muninn.vault` invalidates the cache and the
 * next create re-bootstraps. Other config keys are preserved verbatim; the
 * file is rewritten atomically.
 */
export const lucaBrainSetRootTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_brain_set_root',
        description:
            'Persist a brain tree root engram ULID (from muninn_remember_tree) to .luca/config.json#muninn.brainRoots[<concept>] for the current vault. Local write, not a muninn delegation. Run once per brain tree during project-new / seed-memory bootstrap so readers resolve the root by ULID (muninn_recall_tree rejects a concept as root_id). Phase-agnostic.',
        inputSchema,
        async handler(args, ctx) {
            const vault = await resolveRepoVault({ cwd: ctx.cwd })
            const config = await loadCurrentConfig({ cwd: ctx.cwd })

            const existingMuninn = MuninnConfigSectionSchema.catch({}).parse(
                config.muninn
            )
            const existingRoots = existingMuninn.brainRoots ?? {}

            const nextConfig = {
                ...config,
                muninn: {
                    ...existingMuninn,
                    brainRoots: {
                        ...existingRoots,
                        [args.concept]: { vault, rootId: args.id },
                    },
                },
            }

            const absPath = join(ctx.cwd, lucaRootPaths.config)
            await writeAtomicFile(
                absPath,
                JSON.stringify(nextConfig, null, 2) + '\n'
            )

            return {
                content: [
                    {
                        type: 'text',
                        text: `luca_brain_set_root: ${args.concept} root for vault "${vault}" set to ${args.id} (.luca/config.json#muninn.brainRoots).`,
                    },
                ],
            }
        },
    }
