/**
 * Skills barrel — the canonical list of `SkillDefinition`s shipped
 * with luca-tools.
 *
 * Each skill lives in its own subdirectory:
 *   skills/<name>/index.ts → exports the `defineSkill` definition.
 *
 * Skill bodies are markdown text (the full procedure/decision tree/
 * reference material) authored as JS template literals. Source
 * provenance per skill is documented in the file header — most were
 * ported from the user's `~/.claude/skills/<name>/SKILL.md` (current
 * working copy) or recovered from `fd0b169be^` (the parent of D-4's
 * deletion commit) when no symlinked user copy was available.
 *
 * Order is fixed (alphabetical) so the compile output is byte-stable
 * across runs.
 */
import type { Artifact } from '../../define/index.ts'

import { archAuditSkill } from './arch-audit/index.ts'
import { bugDiagnoseSkill } from './bug-diagnose/index.ts'
import { cavemanSkill } from './caveman/index.ts'
import { chooseSkill } from './choose/index.ts'
import { ghIssueTriageSkill } from './gh-issue-triage/index.ts'
import { ghPrAddressSkill } from './gh-pr-address/index.ts'
import { ghPrepareSkill } from './gh-prepare/index.ts'
import { grillMeSkill } from './grill-me/index.ts'
import { luSkill } from './lu/index.ts'
import { luReviewSkill } from './lu-review/index.ts'
import { lucaInitSkill } from './luca-init/index.ts'
import { lucaTelemetryReportSkill } from './luca-telemetry-report/index.ts'
import { lucaWriteSurfaceSkill } from './luca-write-surface/index.ts'
import { memoryAuditSkill } from './memory-audit/index.ts'
import { milestoneAuditSkill } from './milestone-audit/index.ts'
import { milestoneCompleteSkill } from './milestone-complete/index.ts'
import { milestoneGapsSkill } from './milestone-gaps/index.ts'
import { milestoneNewSkill } from './milestone-new/index.ts'
import { noteSkill } from './note/index.ts'
import { phaseAddSkill } from './phase-add/index.ts'
import { phaseAssumptionsSkill } from './phase-assumptions/index.ts'
import { phaseDiscussSkill } from './phase-discuss/index.ts'
import { phaseExecuteSkill } from './phase-execute/index.ts'
import { phaseInsertSkill } from './phase-insert/index.ts'
import { phasePlanSkill } from './phase-plan/index.ts'
import { phaseRemoveSkill } from './phase-remove/index.ts'
import { phaseResearchSkill } from './phase-research/index.ts'
import { postInitTourSkill } from './post-init-tour/index.ts'
import { progressSkill } from './progress/index.ts'
import { projectNewSkill } from './project-new/index.ts'
import { quickSkill } from './quick/index.ts'
import { renameAuditSkill } from './rename-audit/index.ts'
import { repoAuditSkill } from './repo-audit/index.ts'
import { repoCleanupSkill } from './repo-cleanup/index.ts'
import { seedMemorySkill } from './seed-memory/index.ts'
import { sessionPauseSkill } from './session-pause/index.ts'
import { sessionPlanSkill } from './session-plan/index.ts'
import { sessionResumeSkill } from './session-resume/index.ts'
import { todoAddSkill } from './todo-add/index.ts'
import { todoCheckSkill } from './todo-check/index.ts'
import { workflowSaveSkill } from './workflow-save/index.ts'

export {
    archAuditSkill,
    bugDiagnoseSkill,
    cavemanSkill,
    chooseSkill,
    ghIssueTriageSkill,
    ghPrAddressSkill,
    ghPrepareSkill,
    grillMeSkill,
    luSkill,
    luReviewSkill,
    lucaInitSkill,
    lucaTelemetryReportSkill,
    lucaWriteSurfaceSkill,
    memoryAuditSkill,
    milestoneAuditSkill,
    milestoneCompleteSkill,
    milestoneGapsSkill,
    milestoneNewSkill,
    noteSkill,
    phaseAddSkill,
    phaseAssumptionsSkill,
    phaseDiscussSkill,
    phaseExecuteSkill,
    phaseInsertSkill,
    phasePlanSkill,
    phaseRemoveSkill,
    phaseResearchSkill,
    postInitTourSkill,
    progressSkill,
    projectNewSkill,
    quickSkill,
    renameAuditSkill,
    repoAuditSkill,
    repoCleanupSkill,
    seedMemorySkill,
    sessionPauseSkill,
    sessionPlanSkill,
    sessionResumeSkill,
    todoAddSkill,
    todoCheckSkill,
    workflowSaveSkill,
}

/**
 * Ordered list of every user-facing skill shipped with luca-tools.
 * Alphabetical by skill name for diff-friendly compile output.
 */
export const SKILLS: readonly Artifact[] = [
    archAuditSkill,
    bugDiagnoseSkill,
    cavemanSkill,
    chooseSkill,
    ghIssueTriageSkill,
    ghPrAddressSkill,
    ghPrepareSkill,
    grillMeSkill,
    luSkill,
    luReviewSkill,
    lucaInitSkill,
    lucaTelemetryReportSkill,
    lucaWriteSurfaceSkill,
    memoryAuditSkill,
    milestoneAuditSkill,
    milestoneCompleteSkill,
    milestoneGapsSkill,
    milestoneNewSkill,
    noteSkill,
    phaseAddSkill,
    phaseAssumptionsSkill,
    phaseDiscussSkill,
    phaseExecuteSkill,
    phaseInsertSkill,
    phasePlanSkill,
    phaseRemoveSkill,
    phaseResearchSkill,
    postInitTourSkill,
    progressSkill,
    projectNewSkill,
    quickSkill,
    renameAuditSkill,
    repoAuditSkill,
    repoCleanupSkill,
    seedMemorySkill,
    sessionPauseSkill,
    sessionPlanSkill,
    sessionResumeSkill,
    todoAddSkill,
    todoCheckSkill,
    workflowSaveSkill,
]
