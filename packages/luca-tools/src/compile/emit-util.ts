/**
 * emit-util — small filesystem helpers shared across the per-kind
 * emitters.
 *
 * Why a tiny helper module instead of inline calls per emitter:
 *
 *   1. Idempotence: every emitter writes via the SAME write path. If
 *      we ever need to add a `--dry-run` flag, normalize line endings,
 *      or strip BOM, this is the single place to do it.
 *   2. Determinism: we always overwrite. We never append, never seed
 *      from existing contents. Re-running the compiler twice produces
 *      identical bytes.
 *   3. Bun-first: per the project rule, prefer Bun.file / Bun.write
 *      over `node:fs`. The fs.mkdir we DO use is mkdir-only — Bun
 *      doesn't ship a direct equivalent — and it's idempotent
 *      (`recursive: true`).
 */
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { Artifact } from '../define/index.ts'

/**
 * Result of a single emit operation. Each per-kind emitter returns one
 * of these so the top-level `compile()` can aggregate counts and paths.
 */
export interface EmitResult {
    /** Absolute path that was written. */
    path: string
    /** Artifact kind — matches the discriminator on `Artifact`. */
    kind: Artifact['kind']
}

/**
 * mkdir -p. Recursive, idempotent. We ensure the parent before every
 * write so the per-kind emitters don't have to think about directory
 * existence.
 */
export async function ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true })
}

/**
 * Write a text file. Always overwrites. Uses `Bun.write` per the
 * Bun-preference rule.
 *
 * We also call `ensureDir(dirname(path))` defensively — most emitters
 * call `ensureDir` on a known parent, but hook emission lays files
 * under `.claude/hooks/` whose parent might not yet exist at first
 * call. Cheap insurance.
 */
export async function writeFileBytes(
    path: string,
    contents: string,
): Promise<void> {
    await ensureDir(dirname(path))
    await Bun.write(path, contents)
}
