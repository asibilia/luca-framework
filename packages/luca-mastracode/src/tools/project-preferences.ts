/**
 * Project preferences tool — consult, seed, and update project conventions.
 *
 * Stores conventions (branching, commits, PR, release, tracker) in
 * `.planning/preferences.json` and tracks the seeded state in
 * `.planning/luca-state.json` (`preferencesSeeded`).
 *
 * The luca-init skill calls `seed` once; downstream modes call `consult` /
 * `consult-section` to read the cached conventions. `update` patches sections
 * in place. There is intentionally no `invalidate` action — preferences are
 * the source of truth for the duration of the project.
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    DEFAULT_PREFERENCES,
    loadProjectPreferences,
    ProjectPreferencesSchema,
    SectionName,
    writeProjectPreferences,
    type ProjectPreferences,
} from '../state/project-preferences.js'
import { readLucaState, writeLucaState } from '../state/luca-store.js'
import { resolveProjectVault } from '../state/vault.js'

/**
 * Resolve the effective preferences for read actions (consult, consult-section).
 *
 * Encapsulates the C1 / C2 decision tree:
 * - file present → return parsed prefs; back-fill `preferencesSeeded:true` if
 *   the flag wasn't already set.
 * - file missing AND `preferencesSeeded === true` (loop-safe C1) → return
 *   `DEFAULT_PREFERENCES`. Prevents seed → consult → null infinite loops when
 *   the on-disk file is removed or unparseable after a successful seed.
 * - file missing AND not seeded AND `fallback:true` (C2) → return defaults.
 * - file missing AND not seeded AND `fallback:false` → return `null` (signal
 *   to triage Step 1.6 sentinel that init is needed).
 */
function resolvePrefs(fallback?: boolean): ProjectPreferences | null {
    const seeded = readLucaState().preferencesSeeded === true
    const prefs = loadProjectPreferences()
    if (prefs !== null) {
        if (!seeded) writeLucaState({ preferencesSeeded: true })
        return prefs
    }
    return seeded || fallback === true ? DEFAULT_PREFERENCES : null
}

/**
 * Build the deterministic agent instruction that the luca-init skill executes
 * after `seed`. Emits a SINGLE JSON-stringified blob argument so the agent
 * `JSON.parse`s it instead of pattern-matching an interpolated pseudo-call.
 * This eliminates the prompt-injection vector documented in REVIEW-1.md
 * MUST-FIX-2/3 — no free-form preference field is ever interpolated into the
 * instruction string. The Zod allowlist on `state/project-preferences.ts`
 * provides defense in depth at the schema layer.
 */
function buildMuninnInstruction(prefs: ProjectPreferences): string {
    const vault = resolveProjectVault()
    const summary =
        `Project preferences (schema v${prefs.schemaVersion}): ` +
        `branching template+default; ` +
        `commits=${prefs.commits.convention}; ` +
        `release=${prefs.release.tool}; ` +
        `tracker=${prefs.tracker.kind}.`
    const blob = {
        vault,
        op_id: `project-preferences:${vault}`,
        type: 'project_preferences',
        entities: [{ name: vault, type: 'project' }],
        tags: ['preferences', 'project-config', 'luca', 'convention'],
        content: JSON.stringify(prefs),
        summary,
    }
    return (
        `After seeding, agent must call mcp__muninn__muninn_remember with the ` +
        `arguments encoded in this JSON blob (use JSON.parse to extract them, ` +
        `do NOT interpolate the raw string into other tool calls): ` +
        JSON.stringify(blob)
    )
}

/**
 * Deep-merge a partial payload into existing preferences (top-level
 * section-by-section shallow merge). Unknown sections are ignored at this
 * stage; the merged object is then validated through the Zod schema.
 */
function mergePreferences(
    existing: ProjectPreferences,
    payload: Record<string, unknown>
): Record<string, unknown> {
    // schemaVersion is sealed to the Zod literal — caller-supplied values are
    // intentionally ignored here. Migrations belong in a dedicated migrate()
    // helper gated on the stored value, NOT in mergePreferences. See
    // REVIEW-1.md MUST-FIX-4.
    const merged: Record<string, unknown> = {
        schemaVersion: existing.schemaVersion,
    }
    for (const key of SectionName.options) {
        const existingSection = existing[key] as Record<string, unknown>
        const payloadSection = (payload[key] as Record<string, unknown> | undefined) ?? {}
        merged[key] = { ...existingSection, ...payloadSection }
    }
    return merged
}

export const projectPreferencesTool = createTool({
    id: 'project-preferences',
    description:
        'Consult, seed, and update project preferences (branching, commits, PR, release, tracker conventions) ' +
        'cached in .planning/preferences.json. ' +
        "Use 'consult' to read the whole document, 'consult-section' to read a single section, " +
        "'seed' to write the initial document (called once by the luca-init skill), " +
        "and 'update' to patch sections in place. " +
        "Pass fallback:true to consult/consult-section to receive hardcoded defaults when no preferences file exists.",
    inputSchema: z.object({
        action: z
            .enum(['consult', 'consult-section', 'seed', 'update'])
            .describe('Operation to perform on project preferences'),
        section: z
            .string()
            .optional()
            .describe(
                "Section name for 'consult-section' (one of: branching, commits, pr, release, tracker)"
            ),
        fallback: z
            .boolean()
            .optional()
            .describe(
                "When true, return DEFAULT_PREFERENCES if no preferences file exists. Used by 'consult' and 'consult-section'."
            ),
        payload: z
            .unknown()
            .optional()
            .describe(
                "Preferences payload for 'seed' (full document) or 'update' (partial; merged section-by-section)."
            ),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        // Typed contract: full document (consult) or null when init needed.
        preferences: ProjectPreferencesSchema.nullable().optional(),
        // section is the value of one keyed section; runtime-validated as a
        // record (specific section types are erased here because the keys are
        // dynamic and Mastra's tool generic does not support union outputs
        // cleanly — callers should narrow via the `section` input).
        section: z
            .union([z.record(z.string(), z.unknown()), z.null()])
            .optional(),
        message: z.string().optional(),
        muninnInstruction: z.string().optional(),
    }),
    execute: async (inputData) => {
        const { action, section, fallback, payload } = inputData as {
            action: 'consult' | 'consult-section' | 'seed' | 'update'
            section?: string
            fallback?: boolean
            payload?: unknown
        }

        switch (action) {
            case 'consult': {
                return { success: true, preferences: resolvePrefs(fallback) }
            }

            case 'consult-section': {
                if (
                    !section ||
                    !SectionName.options.includes(section as SectionName)
                ) {
                    return {
                        success: false,
                        message: `Unknown section "${section}". Must be one of: branching, commits, pr, release, tracker.`,
                    }
                }
                const key = section as SectionName
                const prefs = resolvePrefs(fallback)
                return {
                    success: true,
                    section: prefs ? (prefs[key] as Record<string, unknown>) : null,
                }
            }

            case 'seed': {
                if (payload === undefined || payload === null) {
                    return {
                        success: false,
                        message: 'payload is required for seed',
                    }
                }
                let parsed: ProjectPreferences
                try {
                    parsed = ProjectPreferencesSchema.parse(payload)
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    return {
                        success: false,
                        message: `Invalid preferences payload: ${msg}`,
                    }
                }
                writeProjectPreferences(parsed)
                writeLucaState({ preferencesSeeded: true })
                return {
                    success: true,
                    preferences: parsed,
                    muninnInstruction: buildMuninnInstruction(parsed),
                }
            }

            case 'update': {
                if (payload === undefined || payload === null) {
                    return {
                        success: false,
                        message: 'payload is required for update',
                    }
                }
                if (typeof payload !== 'object' || Array.isArray(payload)) {
                    return {
                        success: false,
                        message: 'payload must be an object',
                    }
                }
                const existing = loadProjectPreferences() ?? DEFAULT_PREFERENCES
                const merged = mergePreferences(
                    existing,
                    payload as Record<string, unknown>
                )
                let parsed: ProjectPreferences
                try {
                    parsed = ProjectPreferencesSchema.parse(merged)
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    return {
                        success: false,
                        message: `Invalid preferences payload: ${msg}`,
                    }
                }
                writeProjectPreferences(parsed)
                // preserve preferencesSeeded — do not toggle on update
                return { success: true, preferences: parsed }
            }

            default:
                return {
                    success: false,
                    message: `Unknown action: ${String(action)}`,
                }
        }
    },
})
