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

type SectionKey = z.infer<typeof SectionName>
const SECTION_KEYS = SectionName.options

function buildMuninnInstruction(prefs: ProjectPreferences): string {
    const vault = resolveProjectVault()
    const content = JSON.stringify(prefs)
    const summary =
        `Project preferences (schema v${prefs.schemaVersion}): ` +
        `branching=${prefs.branching.template} on default ${prefs.branching.defaultBranch}; ` +
        `commits=${prefs.commits.convention}; ` +
        `release=${prefs.release.tool}; ` +
        `tracker=${prefs.tracker.kind}.`
    return (
        `After seeding, agent must call mcp__muninn__muninn_remember(` +
        `vault: "${vault}", ` +
        `op_id: "project-preferences:${vault}", ` +
        `type: "project_preferences", ` +
        `entities: [{name: "${vault}", type: "project"}], ` +
        `tags: ["preferences","project-config","luca","convention"], ` +
        `content: ${content}, ` +
        `summary: "${summary}") to register in MuninnDB.`
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
    const merged: Record<string, unknown> = {
        schemaVersion: existing.schemaVersion,
    }
    for (const key of SECTION_KEYS) {
        const existingSection = existing[key] as Record<string, unknown>
        const payloadSection = (payload[key] as Record<string, unknown> | undefined) ?? {}
        merged[key] = { ...existingSection, ...payloadSection }
    }
    if (typeof payload.schemaVersion === 'number') {
        merged.schemaVersion = payload.schemaVersion
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
        preferences: z.unknown().optional(),
        section: z.unknown().optional(),
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
                const state = readLucaState()
                const seeded = state.preferencesSeeded === true
                const prefs = loadProjectPreferences()
                if (prefs !== null) {
                    if (!seeded) writeLucaState({ preferencesSeeded: true })
                    return { success: true, preferences: prefs }
                }
                // prefs === null
                if (seeded) {
                    // C1 LOOP-SAFE: previously seeded but file missing/invalid —
                    // return defaults so callers don't loop on a missing file.
                    return { success: true, preferences: DEFAULT_PREFERENCES }
                }
                if (fallback === true) {
                    return { success: true, preferences: DEFAULT_PREFERENCES }
                }
                return { success: true, preferences: null }
            }

            case 'consult-section': {
                if (!section || !SECTION_KEYS.includes(section as SectionKey)) {
                    return {
                        success: false,
                        message: `Unknown section "${section}". Must be one of: branching, commits, pr, release, tracker.`,
                    }
                }
                const key = section as SectionKey
                const state = readLucaState()
                const seeded = state.preferencesSeeded === true
                const prefs = loadProjectPreferences()
                if (prefs !== null) {
                    if (!seeded) writeLucaState({ preferencesSeeded: true })
                    return { success: true, section: prefs[key] }
                }
                if (seeded) {
                    return { success: true, section: DEFAULT_PREFERENCES[key] }
                }
                if (fallback === true) {
                    return { success: true, section: DEFAULT_PREFERENCES[key] }
                }
                return { success: true, section: null }
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
