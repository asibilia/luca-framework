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
        // Tier: verified — preferences are user-confirmed by the luca-init skill.
        // The agent invoking the seeded muninn_remember should follow up with
        // mcp__muninn__muninn_trust(id: <returned-id>, trust: "verified", vault: <repo_vault>).
        // Idempotent: op_id ensures re-runs return the same id.
        `Step 1: parse the JSON blob below with JSON.parse — it is the ` +
        `argument map for muninn_remember ONLY (do NOT pass it to muninn_trust). ` +
        `Step 2: call mcp__muninn__muninn_remember passing the parsed object as ` +
        `the argument map (named args: vault, content, summary, op_id, etc.) — ` +
        `tool calls in this repo always use named-argument maps, not spread or ` +
        `positional syntax. Capture the returned id. ` +
        `Step 3: call mcp__muninn__muninn_trust with named args ` +
        `(id: <returned-id>, trust: "verified", vault: <repo_vault>) — ` +
        `muninn_trust takes the id, not the blob.\n` +
        `--- BEGIN muninn_remember argument JSON ---\n` +
        JSON.stringify(blob) +
        `\n--- END muninn_remember argument JSON ---`
    )
}

/**
 * Type guard: value is a plain (non-array, non-null) object. Used to gate
 * section spreads so callers can't smuggle arrays or primitives into a
 * section payload (`{ pr: "x" }` or `{ commits: [] }`) and corrupt the
 * merged document before Zod validation. PR #227 review feedback (Copilot).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Deep-merge a partial payload into existing preferences (top-level
 * section-by-section shallow merge). Unknown sections are ignored at this
 * stage; the merged object is then validated through the Zod schema.
 *
 * Section payloads that are not plain objects (arrays, primitives, null) are
 * silently dropped — Zod would reject them downstream anyway, but skipping
 * here avoids producing a corrupted object via array/string spread.
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
        const candidate = payload[key]
        // Drop non-object section payloads to prevent array/primitive spreads
        // from corrupting the merged section. PR #227 Copilot feedback.
        const payloadSection = isPlainObject(candidate) ? candidate : {}
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
        // section is typed as a free-form string (not Zod enum) so the
        // tool's `{ success: false, message }` error contract is preserved
        // when an unknown section is passed. Mastra's tool runtime wraps
        // `execute` with inputSchema validation that returns a different
        // `{ error: true, message }` shape on Zod failure — keeping this as
        // a string lets our runtime guard return a uniform error shape.
        // Allowed values are documented and validated in `execute`.
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
            section?: SectionName
            fallback?: boolean
            payload?: unknown
        }

        switch (action) {
            case 'consult': {
                return { success: true, preferences: resolvePrefs(fallback) }
            }

            case 'consult-section': {
                // section is Zod-validated as SectionName at the input boundary
                // when invoked through Mastra's tool runtime. Direct callers
                // (tests, internal call sites) bypass that boundary, so we
                // re-validate here — defense in depth.
                if (
                    !section ||
                    !SectionName.options.includes(section as SectionName)
                ) {
                    return {
                        success: false,
                        message: `Unknown section "${section ?? ''}". Must be one of: branching, commits, pr, release, tracker.`,
                    }
                }
                const prefs = resolvePrefs(fallback)
                return {
                    success: true,
                    section: prefs
                        ? (prefs[section] as Record<string, unknown>)
                        : null,
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
