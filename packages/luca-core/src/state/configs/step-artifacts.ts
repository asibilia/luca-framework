import type { PipelineStep } from '../schemas.ts'

/**
 * Per-step legal artifact map (v13 plan, decision D3).
 *
 * Declares which `.luca/phases/<slug>/` artifact file(s) each
 * `pipelineStep` may legally produce. The v13 stage-gate hook consults
 * this table to decide whether a native `Write` to a `.luca/phases/`
 * path is allowed for the current step: a write is permitted only when
 * its path matches an entry here for the active step.
 *
 * Values are `PhaseFile` keys from `@alecsibilia/luca-core/luca-dir`
 * (`PHASE_FILE_PATHS`), with two synthetic keys for the parameterised
 * artifacts that have no fixed `PhaseFile` entry:
 *
 *   - `'execute/wave'`  — a per-wave detail file `execute/waves/NN.md`
 *   - `'audits/*'`      — a per-reviewer audit file `audits/<reviewer>.md`
 *
 * A step mapped to `[]` produces no freeform phase artifact (its writes,
 * if any, are structured mutations routed through the `luca` CLI).
 *
 * This is the new source of truth that later v13 phases consume; during
 * the strangler window the relocated handlers keep their own
 * `allowedPhases` field, so mild duplication with {@link WRITE_COMMAND_PHASES}
 * is expected and accepted.
 */
export type StepArtifact =
    | 'research'
    | 'context'
    | 'plan'
    | 'plan-review'
    | 'verify'
    | 'learn'
    | 'confidence'
    | 'execute/summary'
    | 'execute/progress'
    | 'execute/wave'
    | 'audits/*'

export const STEP_ARTIFACTS: Record<PipelineStep, StepArtifact[]> = {
    idle: [],
    triage: [],
    research: ['research'],
    discuss: ['context'],
    architect: [],
    plan: ['plan'],
    'plan-review': ['plan-review'],
    execute: ['execute/summary', 'execute/wave'],
    checks: [],
    verify: ['verify'],
    review: ['audits/*'],
    learn: ['learn'],
    // finalize writes the postmortem learn.md and records gap summaries in
    // audit artifacts before re-entry; see finalize mode.
    finalize: ['learn', 'audits/*'],
}

/**
 * Write-command → allowed `pipelineStep[]` map (v13 plan, decision D3).
 *
 * Companion to {@link STEP_ARTIFACTS}: maps each write-surface command
 * verb to the pipelineSteps in which it is permitted. Extracted from the
 * `allowedPhases` field of the relocated `src/write-surface/` handlers
 * (v13 plan, Phase A). The v13 `luca` CLI consults this table to
 * self-enforce per-verb phase preconditions.
 *
 * A verb mapped to `[]` is intentionally phase-agnostic — it runs in any
 * pipelineStep (read-only tools and deliberately unrestricted write
 * tools such as `confidence-log` and `workflow-reset`).
 *
 * Keys are the noun/verb command names of the v13 CLI surface, derived
 * from the MCP-era tool names (`luca_phase_write_plan` → `phase write-plan`).
 */
export const WRITE_COMMAND_PHASES: Record<string, PipelineStep[]> = {
    // Read-only — allowed in every phase
    'state read': [],
    'phase current': [],
    'branch-guard': [],
    'preferences read': [],
    'roadmap read': [],
    'pr-review filter-stale': [],
    'pr-review detect-convergence': [],
    'pr-review regression-check': [],

    // Todo delegation — phase-agnostic (emit muninn instructions)
    'todo add': [],
    'todo list': [],
    'todo update': [],

    // Operational mutations — phase-agnostic
    'repo cleanup-apply': [],
    'state advance': [],
    'workflow reset': [],
    'preferences write': [],
    'confidence log': [],

    // Phase-restricted structured mutations
    'roadmap create': ['idle', 'triage'],
    'checks run': ['execute', 'checks'],
    // Phase lifecycle: advance at the phase boundary (learn); archive only
    // during finalize (milestone close). (The tool descriptors carry matching allowedPhases,
    // but the CLI self-check consults THIS table — runWriteHandler.)
    'phase advance': ['learn'],
    'phase archive': ['finalize'],

    // Phase-restricted freeform artifact writes
    'phase write-research': ['research'],
    'phase write-context': ['discuss'],
    'phase write-plan': ['plan'],
    'phase write-plan-review': ['plan-review'],
    'phase write-summary': ['execute'],
    'phase write-wave': ['execute'],
    'phase write-verify': ['verify'],
    'phase write-audit': ['review'],
    'phase write-learn': ['learn'],
}
