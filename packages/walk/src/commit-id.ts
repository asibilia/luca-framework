import { z } from 'zod'

/**
 * A full git commit id: 40 lowercase hex characters. Every commit id read
 * from GitHub or from a file passes this before it is given to git, so a
 * value such as `--output=x` is never read as one of git's options.
 *
 * The same pattern as the engine's `ShaSchema` in
 * `packages/engine/src/story/story-schema.ts`, which it does not export.
 *
 * @example
 * CommitIdSchema.safeParse('c'.repeat(40)).success // true
 * CommitIdSchema.safeParse('--output=x').success // false
 */
export const CommitIdSchema = z
    .string()
    .regex(/^[0-9a-f]{40}$/, 'must be a full commit id')
