import { join } from 'node:path'

import { z } from 'zod'

/**
 * The fingerprints of every file old Luca v13 installs, so `luca doctor` can
 * spot v13 leftovers by content (never by name) with no network and no git.
 *
 * The data file is generated from the published 13.x tarballs by
 * `packages/engine/scripts/generate-v13-manifest.ts`; don't edit it by hand.
 */
export const V13_MANIFEST_PATH = join(import.meta.dir, 'v13-files.json')

/** A published 13.x version of `@alecsibilia/luca`, alphas included. */
export const V13VersionSchema = z.string().regex(/^13\.\d+\.\d+(-alpha\.\d+)?$/)

/** A lowercase hex sha256. */
export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)

/**
 * Where a file or setting lives on a user's machine: `~/` is the home folder,
 * `<repo>/` is the root of a repo where v13's `luca init` ran.
 */
export const V13LocationSchema = z.string().regex(/^(~|<repo>)\/\S+$/)

/**
 * One file v13 writes. `sha256` holds every distinct hash seen at `target`
 * across `versions`; a file on disk is v13's only when its hash is in the
 * list.
 */
export const V13FileSchema = z.object({
    target: V13LocationSchema,
    sha256: z.array(Sha256Schema).min(1),
    versions: z.array(V13VersionSchema).min(1),
})

/**
 * How to recognize v13's setting at `path` in the JSON file:
 * - `array_entry_hook_command_contains`: `path` is an array of hook entries;
 *   v13's entry is one with a `hooks[].command` containing `text`.
 * - `command_equals`: `path` is an object whose trimmed `command` equals one
 *   of `any_of` (after `{home}` is filled in). Anything else is the user's.
 * - `key_present`: v13's entry is the key at `path`.
 */
export const V13SettingMatchSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('array_entry_hook_command_contains'),
        text: z.string().min(1),
    }),
    z.object({
        kind: z.literal('command_equals'),
        any_of: z.array(z.string().min(1)).min(1),
    }),
    z.object({ kind: z.literal('key_present') }),
])

/**
 * One setting v13 writes into a JSON file. `values` are the exact values v13
 * writes, with `{home}` for the absolute home folder and `{muninn_token}` for
 * the MuninnDB token (a secret: never print it). `action` says what doctor
 * does with it: `remove` unwires it, `keep` leaves it alone because v14 uses
 * it too.
 */
export const V13SettingSchema = z.object({
    id: z.string().min(1),
    file: V13LocationSchema,
    path: z.array(z.string().min(1)).min(1),
    match: V13SettingMatchSchema,
    values: z.array(z.json()).min(1),
    action: z.enum(['remove', 'keep']),
    versions: z.array(V13VersionSchema).min(1),
    note: z.string().min(1),
})

/**
 * v13's managed `.gitignore` block. A full block is a variant's `header`
 * lines then its `entries`, in order: it starts at `start_marker` (the first
 * header line) and ends on `end_marker` (the last entry). A partial one is
 * some `entries` with no header.
 */
export const V13GitignoreBlockSchema = z.object({
    file: V13LocationSchema,
    start_marker: z.string().min(1),
    variants: z
        .array(
            z.object({
                versions: z.array(V13VersionSchema).min(1),
                header: z.array(z.string().min(1)).min(1),
                entries: z.array(z.string().min(1)).min(1),
                end_marker: z.string().min(1),
            })
        )
        .min(1),
    note: z.string().min(1),
})

/** The whole data file, `v13-files.json`. */
export const V13ManifestSchema = z.object({
    generated_from: z.array(V13VersionSchema).min(1),
    notes: z.array(z.string().min(1)),
    files: z.array(V13FileSchema),
    settings: z.array(V13SettingSchema),
    gitignore_block: V13GitignoreBlockSchema,
})

export type V13File = z.infer<typeof V13FileSchema>
export type V13Setting = z.infer<typeof V13SettingSchema>
export type V13SettingMatch = z.infer<typeof V13SettingMatchSchema>
export type V13GitignoreBlock = z.infer<typeof V13GitignoreBlockSchema>
export type V13Manifest = z.infer<typeof V13ManifestSchema>

/**
 * Read and check the committed data file.
 *
 * @example
 * ```typescript
 * const manifest = await loadV13Manifest()
 * const known = new Set(manifest.files.flatMap((file) => file.sha256))
 * ```
 */
export const loadV13Manifest = async ({
    path = V13_MANIFEST_PATH,
}: { path?: string } = {}): Promise<V13Manifest> =>
    V13ManifestSchema.parse(await Bun.file(path).json())
