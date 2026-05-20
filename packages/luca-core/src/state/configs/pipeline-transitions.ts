import type { PipelineStep } from '../schemas.ts'

/**
 * Allowed pipelineStep transitions.
 *
 * Source-of-truth for what the MCP `luca_state_advance` tool will permit.
 * Captures the canonical pipeline flow plus loop-back transitions for
 * fix/re-plan/re-research cycles.
 *
 * Entries map FROM → set of ALLOWED next steps.
 */
export const PIPELINE_TRANSITIONS: Record<PipelineStep, PipelineStep[]> = {
    idle: ['triage'],
    triage: ['research'],
    research: ['discuss', 'research'], // re-research allowed
    discuss: ['architect'],
    architect: ['plan'],
    plan: ['plan-review'],
    'plan-review': ['execute', 'plan'], // re-plan allowed
    execute: ['checks'],
    checks: ['verify', 'execute'], // fix loop back to execute
    verify: ['review', 'checks'], // fix loop back to checks
    review: ['learn'],
    learn: ['milestone', 'plan'], // next phase OR close milestone
    milestone: ['complete'],
    complete: ['idle'], // start a fresh session
}

export function isLegalTransition(
    from: PipelineStep,
    to: PipelineStep,
): boolean {
    return PIPELINE_TRANSITIONS[from].includes(to)
}
