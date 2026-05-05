import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { ROADMAP_PATH } from '../util/phase-paths.js'

export const manageRoadmapTool = createTool({
    id: 'manage-roadmap',
    description:
        "Manage the .planning/ROADMAP.md file (cross-phase: ROADMAP.md is always at .planning/ root, independent of currentPhaseSlug — it tracks all phases in the workspace). Create, read, update phase status, and compute execution order via topological sort with WSJF scoring. Always 'read' before 'update-status' to verify current state. Use 'compute-order' after creating phases to validate dependency graph.",
    inputSchema: z.object({
        action: z
            .enum(['create', 'read', 'update-status', 'compute-order'])
            .describe('Operation to perform'),
        phases: z
            .array(
                z.object({
                    name: z.string(),
                    deps: z.array(z.string()).default([]),
                    status: z
                        .enum([
                            'pending',
                            'in-progress',
                            'complete',
                            'skipped',
                            'blocked',
                        ])
                        .default('pending'),
                    businessValue: z
                        .number()
                        .optional()
                        .describe('Business value for WSJF scoring (1-10)'),
                    timeCriticality: z
                        .number()
                        .optional()
                        .describe('Time criticality for WSJF scoring (1-10)'),
                    effort: z
                        .number()
                        .optional()
                        .describe('Effort estimate for WSJF scoring (1-10)'),
                })
            )
            .optional()
            .describe('Phase definitions (required for create action)'),
        phaseName: z
            .string()
            .optional()
            .describe('Phase name (for update-status action)'),
        newStatus: z
            .enum(['pending', 'in-progress', 'complete', 'skipped', 'blocked'])
            .optional()
            .describe('New status (for update-status action)'),
        maxPhases: z
            .number()
            .optional()
            .describe('Maximum phases to include in execution order'),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
        executionOrder: z.array(z.string()).optional(),
        phases: z
            .array(
                z.object({
                    name: z.string(),
                    deps: z.array(z.string()),
                    status: z.string(),
                    wsjfScore: z.number().optional(),
                })
            )
            .optional(),
        roadmapContent: z.string().optional(),
    }),
    execute: async (inputData) => {
        const { action, phases, phaseName, newStatus, maxPhases } = inputData

        switch (action) {
            case 'create': {
                if (!phases || phases.length === 0) {
                    return {
                        success: false,
                        message: 'No phases provided for creation',
                        phases: [],
                    }
                }
                const scored = phases.map((p) => ({
                    name: p.name,
                    deps: p.deps ?? [],
                    status: p.status ?? ('pending' as string),
                    wsjfScore:
                        ((p.businessValue ?? 5) + (p.timeCriticality ?? 5)) /
                        (p.effort ?? 5),
                }))
                // Write ROADMAP.md to .planning/ root so it persists across
                // mode switches and is shared across phases.
                const roadmapPath = ROADMAP_PATH()
                mkdirSync(dirname(roadmapPath), { recursive: true })
                const lines = [
                    '# Roadmap',
                    '',
                    '## Phases',
                    '',
                    ...scored
                        .map((p, i) => [
                            `### Phase ${i + 1}: ${p.name}`,
                            `- **Status**: ${p.status}`,
                            `- **Dependencies**: ${p.deps.length ? p.deps.join(', ') : 'None'}`,
                            `- **WSJF Score**: ${p.wsjfScore.toFixed(1)}`,
                            '',
                        ])
                        .flat(),
                ]
                writeFileSync(roadmapPath, lines.join('\n'), 'utf-8')
                return {
                    success: true,
                    message: `Created roadmap with ${phases.length} phases (written to .planning/ROADMAP.md)`,
                    phases: scored,
                }
            }
            case 'compute-order': {
                if (!phases)
                    return { success: false, message: 'No phases to sort' }
                // Topological sort with WSJF priority
                const pending = phases.filter((p) => p.status === 'pending')
                const sorted: string[] = []
                const visited = new Set<string>()
                const visiting = new Set<string>()
                const phaseMap = new Map(phases.map((p) => [p.name, p]))

                function visit(name: string): boolean {
                    if (visited.has(name)) return true
                    if (visiting.has(name)) return false // cycle
                    visiting.add(name)
                    const phase = phaseMap.get(name)
                    if (phase) {
                        for (const dep of phase.deps ?? []) {
                            if (!visit(dep)) return false
                        }
                    }
                    visiting.delete(name)
                    visited.add(name)
                    sorted.push(name)
                    return true
                }

                for (const p of pending) visit(p.name)
                const limited = maxPhases ? sorted.slice(0, maxPhases) : sorted
                return {
                    success: true,
                    message: `Computed execution order: ${limited.length} phases`,
                    executionOrder: limited,
                }
            }
            case 'update-status': {
                if (!phaseName || !newStatus) {
                    return {
                        success: false,
                        message:
                            'phaseName and newStatus required for update-status',
                    }
                }
                const roadmapPath = ROADMAP_PATH()
                if (!existsSync(roadmapPath)) {
                    return {
                        success: false,
                        message:
                            '.planning/ROADMAP.md not found — cannot update status',
                    }
                }
                const content = readFileSync(roadmapPath, 'utf-8')
                // Find the phase heading and update its status line
                const phasePattern = new RegExp(
                    `(### Phase \\d+: ${phaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n- \\*\\*Status\\*\\*: )([^\\n]+)`,
                    'i'
                )
                if (!phasePattern.test(content)) {
                    return {
                        success: false,
                        message: `Phase "${phaseName}" not found in .planning/ROADMAP.md`,
                    }
                }
                const updated = content.replace(phasePattern, `$1${newStatus}`)
                writeFileSync(roadmapPath, updated, 'utf-8')
                return {
                    success: true,
                    message: `Updated "${phaseName}" to ${newStatus} in .planning/ROADMAP.md`,
                }
            }
            case 'read': {
                const roadmapPath = ROADMAP_PATH()
                if (!existsSync(roadmapPath)) {
                    return {
                        success: false,
                        message:
                            '.planning/ROADMAP.md not found. Create one first or use the plan file directly.',
                        phases: [],
                    }
                }
                const content = readFileSync(roadmapPath, 'utf-8')
                return {
                    success: true,
                    message: `Roadmap read from disk (${content.length} chars)`,
                    phases: [],
                    roadmapContent: content,
                }
            }
            default:
                return { success: false, message: `Unknown action: ${action}` }
        }
    },
})
