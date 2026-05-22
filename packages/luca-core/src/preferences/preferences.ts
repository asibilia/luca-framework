/**
 * Project-preferences read + merge logic.
 *
 * Preferences live inside `.luca/config.json` under the `preferences` key.
 * These helpers are the deterministic core behind the `luca preferences
 * read` / `luca preferences write` CLI surfaces: they extract and validate
 * the section, and section-level shallow-merge an update — leaving the I/O
 * (`loadCurrentConfig`, atomic file write) to the caller.
 *
 * Reconciliation note: the project-preferences SCHEMA was ported from
 * luca-mastracode in an earlier batch (see `./schemas.ts`). The mastracode
 * `loadProjectPreferences` / `writeProjectPreferences` I/O targeted a
 * standalone `.planning/preferences.json`; the `.luca/` model folds
 * preferences into `config.json#preferences`, so that I/O is superseded.
 * This module hosts the deterministic read/merge logic that was previously
 * inlined in the v13 write-surface handlers.
 */
import { z } from 'zod'

import { ProjectPreferencesSchema, type ProjectPreferences } from './schemas.ts'

/** Top-level preference sections, in canonical order. */
export const PREFERENCE_SECTIONS = [
    'schemaVersion',
    'branching',
    'commits',
    'pr',
    'release',
    'tracker',
] as const

/** Format Zod issues into a single-line `path: message; …` string. */
function formatIssues(error: z.ZodError): string {
    return error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
}

export type ExtractPreferencesResult =
    | { ok: true; preferences: ProjectPreferences }
    | { ok: false; error: string }

/**
 * Extract and validate the `preferences` section of a loaded
 * `.luca/config.json` object.
 *
 * A missing or null `preferences` key yields the schema defaults — the
 * "permissive when not initialized" contract. An explicit `preferences`
 * object that fails validation (unsafe free-form strings, ReDoS-shaped
 * regex) returns `ok: false` — that case demands explicit user attention
 * rather than a silent fallback.
 */
export function extractPreferences(
    config: Record<string, unknown>
): ExtractPreferencesResult {
    const raw = config.preferences != null ? config.preferences : {}
    const result = ProjectPreferencesSchema.safeParse(raw)
    if (!result.success) {
        return { ok: false, error: formatIssues(result.error) }
    }
    return { ok: true, preferences: result.data }
}

export type MergePreferencesResult =
    | {
          ok: true
          /** The full config object with the merged `preferences` key. */
          nextConfig: Record<string, unknown>
          /** Preference sections that the partial actually overlaid. */
          mergedSections: string[]
          /** Keys in the partial that are not recognized sections. */
          ignoredKeys: string[]
      }
    | { ok: false; error: string }

/**
 * Section-level shallow-merge `partial` into a config's `preferences` key
 * and re-validate the result.
 *
 * Only recognized {@link PREFERENCE_SECTIONS} are applied; unspecified
 * sections are left unchanged, and other top-level config keys (vault,
 * oversight, …) are preserved verbatim. The merged preferences are run
 * through `ProjectPreferencesSchema` so unsafe input is rejected before the
 * caller writes anything.
 */
export function mergePreferences(
    config: Record<string, unknown>,
    partial: Record<string, unknown>
): MergePreferencesResult {
    const currentPrefs =
        config.preferences && typeof config.preferences === 'object'
            ? (config.preferences as Record<string, unknown>)
            : {}

    const mergedPrefs: Record<string, unknown> = { ...currentPrefs }
    const mergedSections: string[] = []
    for (const section of PREFERENCE_SECTIONS) {
        if (section in partial) {
            mergedPrefs[section] = partial[section]
            mergedSections.push(section)
        }
    }

    const ignoredKeys = Object.keys(partial).filter(
        (k) => !(PREFERENCE_SECTIONS as readonly string[]).includes(k)
    )

    const result = ProjectPreferencesSchema.safeParse(mergedPrefs)
    if (!result.success) {
        return { ok: false, error: formatIssues(result.error) }
    }

    return {
        ok: true,
        nextConfig: { ...config, preferences: result.data },
        mergedSections,
        ignoredKeys,
    }
}
