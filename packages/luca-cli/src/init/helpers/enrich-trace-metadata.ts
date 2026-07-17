/**
 * enrich-trace-metadata — enrich the target repo's
 * `.claude/settings.local.json` with a merged `CC_LANGSMITH_METADATA`
 * env entry (repo name + luca version), gated on the global
 * TRACE_TO_LANGSMITH switch.
 *
 * The langsmith trace plugin spreads user env metadata LAST downstream,
 * so per-repo keys written here win over global defaults. The merge is
 * three-tier by ownership:
 *
 *   1. **luca-owned** (`repo`, `luca_version`) — always refreshed to the
 *      current values on every run (re-init keeps them accurate).
 *   2. **fill-if-absent defaults** (`environment`, `ls_message_format`)
 *      — written only when the user has not set them.
 *   3. **everything else** — pre-existing user keys are preserved
 *      verbatim; on collision the user wins.
 *
 * Fail-open like `install-statusline.ts`: a settings.local.json (or a
 * nested CC_LANGSMITH_METADATA string) we cannot parse is never
 * rewritten — warn + skip, never crash `luca init`. An absent
 * settings.local.json is treated as `{}` and the file is created when
 * the gate is on.
 *
 * Designed to be called from `luca init` Step 5, next to `installHooks`.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import { defaultClaudeHome } from './install-skills.ts'

export interface EnrichTraceMetadataOptions {
    /** Repo root that receives `.claude/settings.local.json`. */
    cwd: string
    /**
     * Global harness config directory holding `settings.json` with the
     * `env.TRACE_TO_LANGSMITH` gate. Defaults to `~/.claude`.
     */
    claudeHome?: string
    /**
     * Luca version stamped into the metadata. Defaults to the installed
     * package's `package.json` version (falls back to `"unknown"`).
     */
    lucaVersion?: string
    /**
     * Repo name stamped into the metadata. Defaults to the basename of
     * `git rev-parse --show-toplevel`, falling back to `basename(cwd)`.
     */
    repoName?: string
    log?: (msg: string) => void
}

/** Identity values merged into CC_LANGSMITH_METADATA. */
export interface TraceMetadataIds {
    repo: string
    lucaVersion: string
}

/**
 * Loose schema for a Claude `settings.local.json` / `settings.json`
 * object. Only the `env` block is inspected; every other key
 * (permissions, hooks, …) passes through untouched via `passthrough()`.
 */
const claudeSettingsSchema = z
    .object({
        env: z.record(z.string(), z.unknown()).default({}),
    })
    .passthrough()

type ClaudeSettings = z.infer<typeof claudeSettingsSchema>

/** CC_LANGSMITH_METADATA must decode to a flat JSON object. */
const metadataObjectSchema = z.record(z.string(), z.unknown())

/**
 * Merge luca's trace identity into an existing `CC_LANGSMITH_METADATA`
 * JSON string.
 *
 * Ownership tiers (load-bearing, see module doc):
 * - `repo` + `luca_version` are luca-owned and always refreshed.
 * - `environment: "production"` and `ls_message_format: "anthropic"`
 *   fill only when absent.
 * - Every other pre-existing user key is preserved verbatim (user wins
 *   on collision).
 *
 * @param existingMetadataJson - The current CC_LANGSMITH_METADATA JSON
 * string from the repo's settings.local.json, or `undefined` when no
 * metadata exists yet (treated as `{}`).
 * @param ids - The luca-owned identity values to stamp in.
 * @returns The merged metadata object, or `null` when the existing
 * string is malformed (unparseable JSON, or JSON that is not a plain
 * object) — callers must skip the write rather than clobber data they
 * don't understand.
 *
 * @example
 * ```typescript
 * mergeTraceMetadata('{"team":"infra"}', {
 *     repo: 'my-repo',
 *     lucaVersion: '13.2.0',
 * })
 * // => { team: 'infra', repo: 'my-repo', luca_version: '13.2.0',
 * //      environment: 'production', ls_message_format: 'anthropic' }
 * ```
 *
 * Pure function — exported for testability.
 */
export function mergeTraceMetadata(
    existingMetadataJson: string | undefined,
    ids: TraceMetadataIds
): Record<string, unknown> | null {
    let existing: Record<string, unknown> = {}
    if (existingMetadataJson !== undefined) {
        let decoded: unknown
        try {
            decoded = JSON.parse(existingMetadataJson)
        } catch {
            return null
        }
        const parsed = metadataObjectSchema.safeParse(decoded)
        if (!parsed.success) return null
        existing = parsed.data
    }

    return {
        // Fill-if-absent defaults (user keys below overwrite them).
        environment: 'production',
        ls_message_format: 'anthropic',
        // User keys win over the defaults above…
        ...existing,
        // …but luca-owned keys always refresh last.
        repo: ids.repo,
        luca_version: ids.lucaVersion,
    }
}

/**
 * Enrich the target repo's `.claude/settings.local.json` with the merged
 * `CC_LANGSMITH_METADATA` env entry.
 *
 * Gate: runs only when the global `<claudeHome>/settings.json` has
 * `env.TRACE_TO_LANGSMITH === "true"` (falling back to
 * `process.env.TRACE_TO_LANGSMITH` when the settings key is absent).
 * When the gate is off the function returns silently with ZERO writes.
 *
 * Fail-open on every malformed input (global settings, local settings,
 * nested metadata string): warn + skip, never throw, never rewrite a
 * file that cannot be parsed. An absent settings.local.json is treated
 * as `{}` and created. Idempotent — re-running refreshes the luca-owned
 * keys and leaves user keys stable.
 *
 * @param opts - See {@link EnrichTraceMetadataOptions}.
 *
 * @example
 * ```typescript
 * await enrichTraceMetadata({
 *     cwd: process.cwd(),
 *     log: (msg) => console.log(msg),
 * })
 * ```
 */
export async function enrichTraceMetadata(
    opts: EnrichTraceMetadataOptions
): Promise<void> {
    const log = opts.log ?? (() => {})
    const claudeHome = opts.claudeHome ?? defaultClaudeHome()

    if (!(await isTraceGateEnabled(claudeHome))) {
        // Tracing not configured — nothing to enrich, zero writes.
        return
    }

    const settingsPath = join(opts.cwd, '.claude', 'settings.local.json')
    const settings = await readLocalSettings(settingsPath)
    if (settings === null) {
        log(
            `  skip:  could not parse ${settingsPath} — trace metadata not written (repair the file and re-run \`luca init\`)`
        )
        return
    }

    const existingMetadata = settings.env['CC_LANGSMITH_METADATA']
    if (
        existingMetadata !== undefined &&
        typeof existingMetadata !== 'string'
    ) {
        log(
            `  skip:  ${settingsPath} env.CC_LANGSMITH_METADATA is not a string — trace metadata not written`
        )
        return
    }

    const repo = opts.repoName ?? resolveRepoName(opts.cwd)
    const lucaVersion = opts.lucaVersion ?? (await resolveLucaVersion())

    const merged = mergeTraceMetadata(existingMetadata, { repo, lucaVersion })
    if (merged === null) {
        log(
            `  skip:  ${settingsPath} env.CC_LANGSMITH_METADATA is malformed JSON — trace metadata not written`
        )
        return
    }

    const next: ClaudeSettings = {
        ...settings,
        env: {
            ...settings.env,
            CC_LANGSMITH_METADATA: JSON.stringify(merged),
        },
    }

    await mkdir(dirname(settingsPath), { recursive: true })
    await writeFile(settingsPath, JSON.stringify(next, null, 2) + '\n')
    log(`  write: ${settingsPath} (CC_LANGSMITH_METADATA enriched)`)
}

/**
 * Read the TRACE_TO_LANGSMITH gate from the global Claude settings,
 * falling back to `process.env` when the settings key is absent or the
 * settings file is missing/unreadable.
 *
 * Enabled when the resolved value is either the string `"true"` (the
 * env-var form — `process.env` values are always strings) or the JSON
 * boolean `true` (settings.json may type the gate as a real boolean).
 * Every other value — unset, `"false"`, `false`, anything else — stays
 * fail-closed (disabled).
 */
async function isTraceGateEnabled(claudeHome: string): Promise<boolean> {
    let settingsValue: unknown
    const globalSettingsPath = join(claudeHome, 'settings.json')
    if (existsSync(globalSettingsPath)) {
        try {
            const parsed = claudeSettingsSchema.safeParse(
                JSON.parse(await readFile(globalSettingsPath, 'utf-8'))
            )
            if (parsed.success) {
                settingsValue = parsed.data.env['TRACE_TO_LANGSMITH']
            }
        } catch {
            // Malformed global settings — fall through to process.env.
        }
    }
    const value = settingsValue ?? process.env['TRACE_TO_LANGSMITH']
    return value === 'true' || value === true
}

/**
 * Read + validate the repo's settings.local.json. Returns `{}` (with an
 * empty env) when the file is absent — a fresh repo — and `null` when
 * the file exists but cannot be used (malformed JSON, or JSON that is
 * not a plain object). Mirrors the `install-statusline.ts` fail-open
 * `readSettings` contract.
 */
async function readLocalSettings(
    settingsPath: string
): Promise<ClaudeSettings | null> {
    if (!existsSync(settingsPath)) {
        return claudeSettingsSchema.parse({})
    }
    let decoded: unknown
    try {
        decoded = JSON.parse(await readFile(settingsPath, 'utf-8'))
    } catch {
        return null
    }
    if (
        decoded === null ||
        typeof decoded !== 'object' ||
        Array.isArray(decoded)
    ) {
        return null
    }
    const parsed = claudeSettingsSchema.safeParse(decoded)
    return parsed.success ? parsed.data : null
}

/**
 * Resolve the repo name: basename of `git rev-parse --show-toplevel`,
 * falling back to `basename(cwd)` outside a git worktree.
 */
function resolveRepoName(cwd: string): string {
    try {
        const proc = Bun.spawnSync(
            ['git', 'rev-parse', '--show-toplevel'],
            { cwd, stdout: 'pipe', stderr: 'ignore' }
        )
        if (proc.exitCode === 0) {
            const toplevel = proc.stdout.toString().trim()
            if (toplevel.length > 0) return basename(toplevel)
        }
    } catch {
        // git missing — fall through to cwd basename.
    }
    return basename(cwd)
}

/**
 * Resolve the installed luca package version by walking up from this
 * module's directory to the nearest `package.json` with a version field
 * (works from both `src/` and bundled `dist/` layouts — the
 * `version-check.ts` dual-path pattern). Falls back to `"unknown"`.
 */
async function resolveLucaVersion(): Promise<string> {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let depth = 0; depth < 5; depth++) {
        const pkgPath = join(dir, 'package.json')
        try {
            const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as {
                version?: unknown
            }
            if (typeof pkg.version === 'string' && pkg.version.length > 0) {
                return pkg.version
            }
        } catch {
            // No package.json at this level — keep walking up.
        }
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    return 'unknown'
}
