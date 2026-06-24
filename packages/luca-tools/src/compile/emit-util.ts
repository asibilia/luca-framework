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
 *   3. Runtime-agnostic: we use `node:fs/promises` for both mkdir and
 *      writeFile so the compile pipeline runs under both Bun and Node.
 *      F-2 calls `compile()` from inside the umbrella's unbuild
 *      `build:done` hook — unbuild's CLI is Node-shebanged, so the
 *      hook callback executes under Node where `Bun` is not defined.
 *      The CLI driver (`bin/compile.ts`) is still Bun-shebanged for
 *      shell-level ergonomics but the compile pipeline itself no
 *      longer depends on Bun-specific APIs.
 */
import { mkdir, writeFile } from 'node:fs/promises'
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
 * Write a text file. Always overwrites. Uses `node:fs/promises` so
 * the compile pipeline is runtime-agnostic (Bun + Node).
 *
 * We also call `ensureDir(dirname(path))` defensively — most emitters
 * call `ensureDir` on a known parent, but hook emission lays files
 * under `.claude/hooks/` whose parent might not yet exist at first
 * call. Cheap insurance.
 */
export async function writeFileBytes(
    path: string,
    contents: string
): Promise<void> {
    await ensureDir(dirname(path))
    await writeFile(path, contents, 'utf-8')
}
