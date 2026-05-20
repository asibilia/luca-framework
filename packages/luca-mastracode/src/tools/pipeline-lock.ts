import { existsSync, readFileSync, unlinkSync } from 'node:fs'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { MODES } from '../constants/mode-ids.js'
import { readLucaState } from '../state/luca-store.js'
import { atomicWriteSync } from '../util/atomic-write.js'
import { LOCK_PATH } from '../util/phase-paths.js'

interface LockInfo {
    sessionId: string
    pid: number
    acquiredAt: string
    pipelineStep: string
    phaseStep: string
}

export type RecoveryStrategy =
    | 'fresh-start'
    | 'restart-step'
    | 'resume-phase'
    | 'advance-phase'

/**
 * Determine recovery strategy based on lock + workflow state.
 */
function determineRecovery(lock: LockInfo): {
    strategy: RecoveryStrategy
    resumeMode: string
    resumePhase?: string
    reason: string
} {
    const state = readLucaState()
    const step = lock.pipelineStep

    // No meaningful progress → fresh start
    if (!step || step === 'init' || step === 'idle' || step === 'triage') {
        return {
            strategy: 'fresh-start',
            resumeMode: MODES.triage,
            reason: 'No meaningful pipeline progress to resume',
        }
    }

    // Crashed during research → restart research
    if (step === 'research') {
        return {
            strategy: 'restart-step',
            resumeMode: MODES.research,
            reason: 'Crashed during research — restarting step',
        }
    }

    // Crashed during planning substeps → restart architect
    if (
        [
            'discuss',
            'architect',
            'plan',
            'plan-review',
            'git-setup',
            'roadmap',
            'phase-order',
            'classify',
            'configure',
        ].includes(step)
    ) {
        return {
            strategy: 'restart-step',
            resumeMode: MODES.architect,
            reason: `Crashed during ${step} — restarting architect mode`,
        }
    }

    // Crashed during execution substeps
    if (['execute', 'checks', 'verify'].includes(step)) {
        const phaseName = state.currentPhaseName
        const wave = state.currentWave ?? 1
        if (phaseName) {
            return {
                strategy: 'resume-phase',
                resumeMode: MODES.execute,
                resumePhase: phaseName,
                reason: `Crashed during ${step} in phase "${phaseName}" wave ${wave} — resuming execution`,
            }
        }
        return {
            strategy: 'restart-step',
            resumeMode: MODES.execute,
            reason: `Crashed during ${step} — restarting execute mode`,
        }
    }

    // Crashed during review/learn → resume review
    if (['review', 'review-audit', 'learn'].includes(step)) {
        return {
            strategy: 'resume-phase',
            resumeMode: MODES.review,
            reason: `Crashed during ${step} — resuming review`,
        }
    }

    // Crashed during milestone/cleanup → advance to finalize
    if (['milestone', 'gap-audit', 'cleanup'].includes(step)) {
        return {
            strategy: 'advance-phase',
            resumeMode: MODES.finalize,
            reason: `Crashed during ${step} — advancing to finalize`,
        }
    }

    // Default fallback
    return {
        strategy: 'fresh-start',
        resumeMode: MODES.triage,
        reason: `Unknown step "${step}" — starting fresh`,
    }
}

export const pipelineLockTool = createTool({
    id: 'pipeline-lock',
    description:
        'Manage pipeline lock for crash recovery. The lock file (.planning/.luca-lock.json) is cross-phase and cross-pipeline — a single mutex shared by every Luca session in the workspace, regardless of currentPhaseSlug. Prevents concurrent Luca sessions and enables resumption after crashes. Always update lock when entering a new pipeline step.',
    inputSchema: z.object({
        action: z
            .enum(['status', 'acquire', 'release', 'update', 'recover'])
            .describe(
                'Lock operation. "recover" checks for stale locks and determines resume point.'
            ),
        sessionId: z.string().optional().describe('Session ID (for acquire)'),
        pipelineStep: z
            .string()
            .optional()
            .describe('Current pipeline step (for update)'),
        phaseStep: z
            .string()
            .optional()
            .describe('Current phase sub-step (for update)'),
    }),
    execute: async (inputData) => {
        const { action, sessionId, pipelineStep, phaseStep } = inputData
        const lockPath = LOCK_PATH()

        switch (action) {
            case 'status': {
                if (!existsSync(lockPath)) {
                    return {
                        status: 'clear' as const,
                        message: 'No active lock',
                    }
                }
                try {
                    const lock: LockInfo = JSON.parse(
                        readFileSync(lockPath, 'utf-8')
                    )
                    // Check if the PID is still alive
                    try {
                        process.kill(lock.pid, 0)
                        return {
                            status: 'live' as const,
                            message: `Active lock held by PID ${lock.pid}`,
                            lock,
                        }
                    } catch {
                        return {
                            status: 'stale' as const,
                            message: `Stale lock from PID ${lock.pid}`,
                            lock,
                        }
                    }
                } catch {
                    return {
                        status: 'stale' as const,
                        message: 'Corrupt lock file',
                    }
                }
            }
            case 'acquire': {
                const lock: LockInfo = {
                    sessionId: sessionId ?? crypto.randomUUID().slice(0, 12),
                    pid: process.pid,
                    acquiredAt: new Date().toISOString(),
                    pipelineStep: pipelineStep ?? 'init',
                    phaseStep: phaseStep ?? '',
                }
                atomicWriteSync(lockPath, JSON.stringify(lock, null, 2))
                return {
                    status: 'live' as const,
                    message: `Lock acquired for session ${lock.sessionId}`,
                    lock,
                }
            }
            case 'release': {
                if (existsSync(lockPath)) unlinkSync(lockPath)
                return { status: 'clear' as const, message: 'Lock released' }
            }
            case 'update': {
                if (!existsSync(lockPath)) {
                    return {
                        status: 'clear' as const,
                        message: 'No lock to update',
                    }
                }
                const lock: LockInfo = JSON.parse(
                    readFileSync(lockPath, 'utf-8')
                )
                if (pipelineStep) lock.pipelineStep = pipelineStep
                if (phaseStep) lock.phaseStep = phaseStep
                atomicWriteSync(lockPath, JSON.stringify(lock, null, 2))
                return {
                    status: 'live' as const,
                    message: 'Lock updated',
                    lock,
                }
            }
            case 'recover': {
                if (!existsSync(lockPath)) {
                    return {
                        status: 'clear' as const,
                        message: 'No lock found — no recovery needed',
                    }
                }
                let lock: LockInfo
                try {
                    lock = JSON.parse(readFileSync(lockPath, 'utf-8'))
                } catch {
                    unlinkSync(lockPath)
                    return {
                        status: 'clear' as const,
                        message: 'Corrupt lock file removed — start fresh',
                    }
                }
                // Check if PID is still alive
                try {
                    process.kill(lock.pid, 0)
                    return {
                        status: 'live' as const,
                        message: `Pipeline is still active (PID ${lock.pid}). Cannot recover.`,
                        lock,
                    }
                } catch {
                    // PID is dead → stale lock, run recovery
                    const recovery = determineRecovery(lock)
                    // Clean up the stale lock
                    unlinkSync(lockPath)
                    return {
                        status: 'stale' as const,
                        message: `Recovery: ${recovery.strategy} → resume at "${recovery.resumeMode}". ${recovery.reason}`,
                        lock,
                        recovery,
                    }
                }
            }
            default:
                return {
                    status: 'clear' as const,
                    message: `Unknown action: ${action}`,
                }
        }
    },
})
