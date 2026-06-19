import { join } from 'node:path'

import { loadCurrentConfig, lucaRootPaths } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { resolveRepoVault } from '../helpers/resolve-repo-vault.ts'
import { writeAtomicFile } from '../helpers/write-atomic.ts'

/**
 * ULID shape — 26 Crockford base32 chars, first char 0-7 (the 48-bit
 * timestamp can't overflow). Case-insensitive. Matches the ids MuninnDB
 * returns from remember_tree / add_child.
 */
const ULID_RE = /^[0-7][0-9ABCDEFGHJKMNPQRSTVWXYZ]{25}$/i

const inputSchema = z.object({
    id: z
        .string()
        .regex(ULID_RE, {
            message:
                'must be a 26-character ULID (the root_id returned by ' +
                'muninn_remember_tree)',
        })
        .describe(
            'The backlog-root engram ULID returned by muninn_remember_tree. ' +
                'Persisted to .luca/config.json#muninn.todoBacklog for the ' +
                'current vault so future todo commands resolve the root ' +
                'deterministically.'
        ),
})

/**
 * Persist the backlog-root engram ULID for the current repo vault.
 *
 * This is a LOCAL write (not a muninn delegation): it records
 * `{ vault, rootId }` under `.luca/config.json#muninn.todoBacklog`. The
 * agent calls it once, immediately after `muninn_remember_tree` creates
 * the backlog root during the first `luca todo add` (or `luca todo
 * migrate`), so every later `add`/`list`/`update` resolves the root by
 * its stable id rather than a (non-existent) concept lookup.
 *
 * The entry is vault-scoped — switching `muninn.vault` invalidates it and
 * the next add re-bootstraps a fresh root. Other config keys are
 * preserved verbatim; the file is rewritten atomically.
 */
export const lucaTodoSetRootTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_todo_set_root',
        description:
            'Persist the backlog-root engram ULID (from muninn_remember_tree) to .luca/config.json#muninn.todoBacklog for the current vault. Local write, not a muninn delegation. Run once during backlog bootstrap so future todo commands resolve the root deterministically. Phase-agnostic.',
        inputSchema,
        async handler(args, ctx) {
            const vault = await resolveRepoVault({ cwd: ctx.cwd })
            const config = await loadCurrentConfig({ cwd: ctx.cwd })

            const existingMuninn =
                config.muninn &&
                typeof config.muninn === 'object' &&
                !Array.isArray(config.muninn)
                    ? (config.muninn as Record<string, unknown>)
                    : {}

            const nextConfig = {
                ...config,
                muninn: {
                    ...existingMuninn,
                    todoBacklog: { vault, rootId: args.id },
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
                        text: `luca_todo_set_root: backlog root for vault "${vault}" set to ${args.id} (.luca/config.json#muninn.todoBacklog).`,
                    },
                ],
            }
        },
    }
