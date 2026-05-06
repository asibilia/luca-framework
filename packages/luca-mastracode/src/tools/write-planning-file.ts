import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, sep, isAbsolute } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { readLucaState } from '../state/luca-store.js'
import { phaseDir, planningRoot } from '../util/phase-paths.js'

export const writePlanningFileTool = createTool({
    id: 'write-planning-file',
    description:
        'Read or write files inside .planning/. Phase-scoped by default: writes go to .planning/phases/<currentPhaseSlug>/ when a slug is set in luca-state.json, falling back to .planning/ root when slug is absent (legacy/in-flight runs). Pass scope:"root" for cross-phase artifacts. Paths must be bare relative paths (e.g., "RESEARCH.md", not ".planning/RESEARCH.md", not "phases/foo/RESEARCH.md" — the slug routing is handled automatically).',
    inputSchema: z.object({
        action: z.enum(['write', 'read']).describe('Operation to perform'),
        path: z
            .string()
            .describe(
                'File path relative to the resolved planning directory (e.g., "RESEARCH.md" or "review-capture-dx-1.md"). Do NOT include "phases/<slug>/" — the tool resolves that from state.'
            ),
        content: z
            .string()
            .max(
                524_288,
                'content exceeds 512 KB limit — split into multiple files if needed'
            )
            .optional()
            .describe(
                'File content (REQUIRED for "write" action, ignored for "read"; max 512 KB)'
            ),
        scope: z
            .enum(['phase', 'root'])
            .optional()
            .default('phase')
            .describe(
                'Where to resolve the path: "phase" (default) writes under .planning/phases/<currentPhaseSlug>/ when slug is set, otherwise root; "root" forces .planning/ root (used for cross-phase artifacts like ROADMAP.md, todos/).'
            ),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
        content: z.string().optional(),
    }),
    execute: async (inputData) => {
        const { action, path: userPath, content, scope } = inputData

        // Reject null bytes (defense-in-depth — Node.js ≥18.17 rejects them in fs ops)
        if (userPath.includes('\0')) {
            return { success: false, message: 'Path contains null bytes' }
        }

        // Reject absolute paths
        if (isAbsolute(userPath)) {
            return {
                success: false,
                message:
                    'Absolute paths are not allowed — use a relative path within .planning/',
            }
        }

        // Reject empty or dot-only paths (must target a file, not a directory)
        if (!userPath || userPath === '.') {
            return {
                success: false,
                message:
                    'path must be a filename (e.g., "RESEARCH.md"), not empty or "."',
            }
        }

        // Resolve target dir based on scope + current phase slug from state.
        // - scope:"root" → always .planning/ root
        // - scope:"phase" (default) → .planning/phases/<slug>/ when slug set,
        //   else .planning/ root (phaseDir(undefined) fallback for legacy runs).
        const state = readLucaState()
        const slug = state.currentPhaseSlug as string | undefined
        const planningDir = scope === 'root' ? planningRoot() : phaseDir(slug)

        // Canonical path containment check (lexical — catches ../ traversal).
        // Containment applies to the resolved dir (root or phase subdir) so
        // traversal cannot escape *either* boundary.
        const resolved = resolve(planningDir, userPath)
        // Append sep so ".planning/" doesn't match a sibling dir like ".planning-extra/"
        if (!resolved.startsWith(planningDir + sep)) {
            return {
                success: false,
                message: 'Path escapes .planning/ boundary',
            }
        }

        // Display path mirrors the on-disk layout for human-readable messages.
        const displayPath =
            scope === 'phase' && slug
                ? `.planning/phases/${slug}/${userPath}`
                : `.planning/${userPath}`

        switch (action) {
            case 'write': {
                if (content === undefined) {
                    return {
                        success: false,
                        message: `content is required when action is "write" — provide the file content to write to ${displayPath}`,
                    }
                }
                mkdirSync(dirname(resolved), { recursive: true })
                try {
                    writeFileSync(resolved, content, 'utf-8')
                } catch (err: unknown) {
                    const code =
                        err instanceof Error && 'code' in err
                            ? (err as NodeJS.ErrnoException).code
                            : undefined
                    if (code === 'EACCES' || code === 'EPERM') {
                        return {
                            success: false,
                            message: `Permission denied writing to ${displayPath}`,
                        }
                    }
                    if (code === 'EISDIR') {
                        return {
                            success: false,
                            message: `Path ${displayPath} is a directory, not a file`,
                        }
                    }
                    throw err
                }
                return {
                    success: true,
                    message: `Written to ${displayPath}`,
                }
            }
            case 'read': {
                try {
                    const fileContent = readFileSync(resolved, 'utf-8')
                    return {
                        success: true,
                        message: `Read ${displayPath} (${fileContent.length} chars)`,
                        content: fileContent,
                    }
                } catch (err: unknown) {
                    const code =
                        err instanceof Error && 'code' in err
                            ? (err as NodeJS.ErrnoException).code
                            : undefined
                    if (code === 'ENOENT') {
                        return {
                            success: false,
                            message: `File not found: ${displayPath}`,
                        }
                    }
                    throw err
                }
            }
            default:
                return { success: false, message: `Unknown action: ${action}` }
        }
    },
})
