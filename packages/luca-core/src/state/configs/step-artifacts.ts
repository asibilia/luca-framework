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
 *   - `'raw'`           — a per-stage raw-capture file `raw/<stage>-<NN>.md`
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
    | 'raw'

// DEMOTED (DAD-P1t): this is data referenced BY the machine state (per-step
// artifact expectations), not control flow. It does not encode the pipeline's
// structure.
//
// `raw/` reconciliation — decision: ADD the entries (option A), not strip the
// slot (option B). Three surfaces already agreed the `raw/` slot exists
// (LUCA_DIR_CONTRACT, `isValidLucaPath`, and both shipped mode bodies); only
// this table and the stage gate lagged, so the gate blocked a write the
// research and review modes instruct. Option B was rejected because the
// capture is load-bearing, not decorative: both modes explicitly RE-READ the
// raw files when context was compressed between capture and consolidation
// (research synthesis, review consolidation), so deleting the slot would
// remove the only recovery state for a 5-way subagent fan-out with no
// replacement.
export const STEP_ARTIFACTS: Record<PipelineStep, StepArtifact[]> = {
    idle: [],
    triage: [],
    // `raw` is the pre-consolidation safety net: research mode's 5-way
    // fan-out persists each dimension's raw subagent output to
    // `raw/research-<NN>.md` BEFORE synthesizing `research.md`, and
    // re-reads it if context was compressed mid-stage. The slot has
    // always been in LUCA_DIR_CONTRACT / `isValidLucaPath`; listing it
    // here is what makes the instructed write survive the stage gate.
    research: ['research', 'raw'],
    discuss: ['context'],
    architect: [],
    plan: ['plan'],
    'plan-review': ['plan-review'],
    execute: ['execute/summary', 'execute/wave'],
    checks: [],
    verify: ['verify'],
    // Same safety net on the review side: `raw/review-<reviewer>-<NN>.md`
    // captures each of the 5 reviewers' raw output before consolidation
    // into `audits/<reviewer>.md`.
    review: ['audits/*', 'raw'],
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
    // Phase-agnostic plan-quality lint: explicit empty entry = allowed in
    // any pipelineStep (registry completeness — absence is NOT the same
    // as []).
    'plan lint': [],

    // Todo delegation — phase-agnostic (emit muninn instructions)
    'todo add': [],
    'todo list': [],
    'todo update': [],
    'todo migrate': [],
    'todo set-root': [],
    'brain set-root': [],
    'brain recall-root': [],

    // Operational mutations — phase-agnostic
    'repo cleanup-apply': [],
    'state advance': [],
    'state claim-owner': [],
    'state set-current-phase': [],
    'workflow reset': [],
    'preferences write': [],
    'confidence log': [],
    'snapshot create': [],
    'snapshot diff': [],
    'budget check': [],

    // Incremental roadmap edits — deliberately phase-agnostic, UNLIKE the
    // full-replace `roadmap create` below. Phases get added mid-run (that is
    // the whole point of `/note` and `/phase-add`), so any non-empty
    // restriction would make these unreachable exactly where they are used.
    // `[]` adds no clobber exposure: neither verb replaces the roadmap —
    // `add-phase` only appends/inserts, and `remove-phase` refuses any phase
    // at or before `currentPhase`.
    'roadmap add-phase': [],
    'roadmap remove-phase': [],

    // Cross-repo handoff mailbox — deliberately phase-agnostic. A repo may
    // need to post or read a work order at any point in its own pipeline, and
    // the phase-3 SessionStart triage fires at `pipelineStep: 'idle'`, so any
    // non-empty restriction would make the mailbox unreachable exactly where
    // it is consumed. `[]` adds no exposure: the envelope is schema-validated
    // and never auto-executed.
    'handoff send': [],
    'handoff list': [],
    'handoff accept': [],
    'handoff complete': [],
    'handoff reject': [],

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
