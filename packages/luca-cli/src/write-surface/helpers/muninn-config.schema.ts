import { z } from '../__schemas/write-surface.schemas.ts'

/**
 * A cached muninn tree-root pointer: the engram ULID plus the vault it was
 * created in. Used for both `muninn.brainRoots[<concept>]` entries and the
 * single `muninn.todoBacklog` entry. The vault is recorded so a stored id is
 * honoured only when it matches the currently-resolved vault (switching vaults
 * transparently re-bootstraps a fresh root).
 */
export const MuninnRootEntrySchema = z.object({
    vault: z.string(),
    rootId: z.string().min(1),
})

export type MuninnRootEntry = z.infer<typeof MuninnRootEntrySchema>

/**
 * The subset of `.luca/config.json#muninn` that the write-surface reads and
 * writes. `brainRoots` and `todoBacklog` values are kept loose (`unknown`) so
 * a single malformed sibling entry never invalidates the whole section — the
 * caller validates the one entry it needs with {@link MuninnRootEntrySchema}.
 * `passthrough()` preserves every other muninn key (e.g. `vault`) verbatim
 * across a rewrite. Parse with `.catch({})` so a missing/malformed `muninn`
 * section degrades to an empty object instead of throwing.
 */
export const MuninnConfigSectionSchema = z
    .object({
        brainRoots: z.record(z.string(), z.unknown()).optional(),
        todoBacklog: z.unknown().optional(),
    })
    .passthrough()

export type MuninnConfigSection = z.infer<typeof MuninnConfigSectionSchema>
