/**
 * Continuation messages — sent to the new agent after a pipeline mode switch.
 *
 * Each pipeline mode receives a context-rich kick-off message that explains
 * its handoff source, the workflow state, and what to do next. These messages
 * are wrapped in `<system-reminder>` by the caller so they render as an
 * amber-bordered box in the TUI.
 */
import type { LucaWorkflowState } from './luca-store.js'
import { MODES } from './modes/mode-ids.js'

export function buildContinuationMessage(
    modeId: string,
    state: LucaWorkflowState
): string {
    const intent = state.intent ?? 'Continue the current workflow.'
    const complexity = state.complexity ?? 'MODERATE'
    const todos = state.assignedTodos?.length
        ? `\nAssigned TODOs: #${state.assignedTodos.join(', #')}`
        : ''
    const areas = state.affectedAreas?.length
        ? `\nAffected areas: ${state.affectedAreas.join(', ')}`
        : ''

    switch (modeId) {
        case MODES.research:
            return [
                `[Luca Pipeline — auto-continuing from Triage]`,
                ``,
                `Intent: ${intent}`,
                `Complexity: ${complexity}`,
                `Oversight: ${state.oversight ?? 'full-auto'}`,
                todos,
                areas,
                ``,
                `Begin research. Use the workflowState tool to read the full triage state, then investigate the affected areas using the research dimensions from your instructions. When research is complete, save findings and transition to Architect mode.`,
            ]
                .filter(Boolean)
                .join('\n')

        case MODES.architect:
            return [
                `[Luca Pipeline — auto-continuing from Research]`,
                ``,
                `Intent: ${intent}`,
                `Complexity: ${complexity}`,
                todos,
                areas,
                ``,
                `Begin planning. Use the workflowState tool to read the research findings, then create a structured implementation plan following goal-backward analysis. When the plan is approved, transition to Execute mode.`,
            ]
                .filter(Boolean)
                .join('\n')

        case MODES.execute: {
            const planFile = state.planFile ?? '.planning/PLAN.md'
            const roadmapFile = state.roadmapFile ?? '.planning/ROADMAP.md'
            return [
                `[Luca Pipeline — auto-continuing from Architect]`,
                ``,
                `Intent: ${intent}`,
                `Complexity: ${complexity}`,
                todos,
                areas,
                ``,
                `Plan file: ${planFile}`,
                `Roadmap file: ${roadmapFile}`,
                ``,
                `Begin execution. Read the plan from ${planFile} on disk using workspace tools (view/find_files) — this contains the atomic task definitions. Read ${roadmapFile} for phase sequencing. Do NOT re-create the plan. Implement changes in waves, run checks after each wave. When all waves are complete, transition to Review mode.`,
            ]
                .filter(Boolean)
                .join('\n')
        }

        case MODES.review:
            return [
                `[Luca Pipeline — auto-continuing from Execute]`,
                ``,
                `Intent: ${intent}`,
                `Complexity: ${complexity}`,
                todos,
                ``,
                `Review the code changes against the plan. Read .planning/PLAN.md (or planFile from workflow state) and the changed files,`,
                `then spawn reviewer subagents for a multi-perspective audit. Produce a REVIEW report.`,
                `If must-fix issues are found, create an iteration plan and transition back to Execute.`,
                `If clean, transition to Finalize.`,
            ]
                .filter(Boolean)
                .join('\n')

        case MODES.finalize:
            return [
                `[Luca Pipeline — auto-continuing from Review]`,
                ``,
                `Intent: ${intent}`,
                `Complexity: ${complexity}`,
                todos,
                ``,
                `Begin finalization. Run final checks, perform gap audit, create PR if appropriate, and complete the session with final metrics. Read the latest .planning/REVIEW-*.md report for context on what was reviewed.`,
            ]
                .filter(Boolean)
                .join('\n')

        case MODES.triage:
            return [
                `[Luca Pipeline — starting]`,
                ``,
                `A user has requested the Luca development workflow.`,
                intent !== 'Continue the current workflow.'
                    ? `User request: ${intent}`
                    : '',
                todos,
                areas,
                ``,
                `Follow your triage instructions exactly:`,
                `1. Parse the request into structured intent`,
                `2. Classify complexity using the classifyComplexity tool`,
                `3. Save state with workflowState(action: "write", updates: {...})`,
                `4. IMMEDIATELY call workflowState(action: "switch-mode", targetMode: "<luca:2-research|luca:3-architect>")`,
                ``,
                `Do NOT implement anything. Do NOT create task lists. Do NOT modify files.`,
                `Your ONLY job is to classify and transition.`,
            ]
                .filter(Boolean)
                .join('\n')

        default:
            return `Continue the Luca workflow. Current intent: ${intent}`
    }
}
