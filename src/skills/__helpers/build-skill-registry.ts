/**
 * Skill registry assembly for the Luca Framework
 *
 * Builds the registry mapping skill names to factory functions
 * for bulk processing by the build pipeline.
 */

// Import all general skills
import { codeLintSkill } from "../general/code-lint.skill";
import { codeTypecheckSkill } from "../general/code-typecheck.skill";
import { gitCommitSkill } from "../general/git-commit.skill";
import { gitFeatureSkill } from "../general/git-feature.skill";
import { prCreateSkill } from "../general/pr-create.skill";
import { jiraIssueSkill } from "../general/jira-issue.skill";
import { phaseAddSkill } from "../general/phase-add.skill";
import { todoAddSkill } from "../general/todo-add.skill";
import { prAddressSkill } from "../general/pr-address.skill";
import { milestoneAuditSkill } from "../general/milestone-audit.skill";
import { todoCheckSkill } from "../general/todo-check.skill";
import { chooseSkill } from "../general/choose.skill";
import { milestoneCompleteSkill } from "../general/milestone-complete.skill";
import { debugSkill } from "../general/debug.skill";
import { phaseDiscussSkill } from "../general/phase-discuss.skill";
import { phaseExecuteSkill } from "../general/phase-execute.skill";
import { helpSkill } from "../general/help.skill";
import { phaseInsertSkill } from "../general/phase-insert.skill";
import { sessionPauseSkill } from "../general/session-pause.skill";
import { sessionResumeSkill } from "../general/session-resume.skill";
import { phaseResearchSkill } from "../general/phase-research.skill";
import { researchReviewSkill } from "../general/research-review.skill";
import { researchExpandSkill } from "../general/research-expand.skill";
import { researchGraduateSkill } from "../general/research-graduate.skill";
import { planReviewSkill } from "../general/plan-review.skill";
import { configProfileSkill } from "../general/config-profile.skill";
import { quickSkill } from "../general/quick.skill";
import { repoAuditSkill } from "../general/repo-audit.skill";
import { milestoneGapsSkill } from "../general/milestone-gaps.skill";
import { phasePlanSkill } from "../general/phase-plan.skill";
import { sessionPlanSkill } from "../general/session-plan.skill";
import { progressSkill } from "../general/progress.skill";
import { phaseAssumptionsSkill } from "../general/phase-assumptions.skill";
import { repoMapSkill } from "../general/repo-map.skill";
import { verifySkill } from "../general/verify.skill";
import { configSettingsSkill } from "../general/config-settings.skill";
import { milestoneNewSkill } from "../general/milestone-new.skill";
import { projectNewSkill } from "../general/project-new.skill";
import { phaseRemoveSkill } from "../general/phase-remove.skill";
import { jiraStartSkill } from "../general/jira-start.skill";
import { testRunSkill } from "../general/test-run.skill";
import { prQaConsolidateSkill } from "../general/pr-qa-consolidate.skill";
import { ruleComplexityGatingSkill } from "../general/rule-complexity-gating.skill";
import { ruleFileNamingSkill } from "../general/rule-file-naming.skill";
import { ruleHarnessVerificationSkill } from "../general/rule-harness-verification.skill";
import { ruleHookSkillBoundarySkill } from "../general/rule-hook-skill-boundary.skill";
import { ruleLuWorkflowSkill } from "../general/rule-lu-workflow.skill";
import { noteSkill } from "../general/note.skill";
import { updateSkill } from "../general/update.skill";
import { helpTourSkill } from "../general/help-tour.skill";
import { workflowSaveSkill } from "../general/workflow-save.skill";
import { profileExportSkill } from "../general/profile-export.skill";
import { profileImportSkill } from "../general/profile-import.skill";
import { seedMemorySkill } from "../general/seed-memory.skill";
import { outcomeSkill } from "../general/outcome.skill";
import { sessionRestoreSkill } from "../general/session-restore.skill";
import { repoCleanupSkill } from "../general/repo-cleanup.skill";
import { scoutSkill } from "../general/scout.skill";
import { scoutIngestSkill } from "../general/scout-ingest.skill";
import { scoutRelevanceSkill } from "../general/scout-relevance.skill";
import { scoutImplResearchSkill } from "../general/scout-impl-research.skill";
import { scoutResearchSkill } from "../general/scout-research.skill";
import { scoutAnalyzeSkill } from "../general/scout-analyze.skill";
import { scoutIntegrateSkill } from "../general/scout-integrate.skill";
import { scoutPlanSkill } from "../general/scout-plan.skill";
import { scoutGraduateSkill } from "../general/scout-graduate.skill";
// Sub-skills (pr-address, milestone, verify, phase-execute, lu) deleted — migrated to Agent() sub-agents (Phase 232)

// Import Luca-specific skills
import { luSkill } from "../luca/lu.skill";

import type { BaseSkill } from "../__schemas/skill.schemas";

/**
 * Registry mapping skill names to factory functions for bulk processing.
 *
 * Consumed by the build pipeline (build-shared.ts) to generate
 * .claude/ skill definition files.
 */
export const skillRegistry: Record<string, () => BaseSkill> = {
  "code-lint": () => codeLintSkill,
  "code-typecheck": () => codeTypecheckSkill,
  "git-commit": () => gitCommitSkill,
  "git-feature": () => gitFeatureSkill,
  "pr-create": () => prCreateSkill,
  "jira-issue": () => jiraIssueSkill,
  "phase-add": () => phaseAddSkill,
  "todo-add": () => todoAddSkill,
  "pr-address": () => prAddressSkill,
  "milestone-audit": () => milestoneAuditSkill,
  "todo-check": () => todoCheckSkill,
  choose: () => chooseSkill,
  "milestone-complete": () => milestoneCompleteSkill,
  debug: () => debugSkill,
  "phase-discuss": () => phaseDiscussSkill,
  "phase-execute": () => phaseExecuteSkill,
  help: () => helpSkill,
  "phase-insert": () => phaseInsertSkill,
  "session-pause": () => sessionPauseSkill,
  "session-resume": () => sessionResumeSkill,
  "phase-research": () => phaseResearchSkill,
  "research-review": () => researchReviewSkill,
  "research-expand": () => researchExpandSkill,
  "research-graduate": () => researchGraduateSkill,
  "config-profile": () => configProfileSkill,
  quick: () => quickSkill,
  "repo-audit": () => repoAuditSkill,
  "milestone-gaps": () => milestoneGapsSkill,
  "phase-plan": () => phasePlanSkill,
  "plan-review": () => planReviewSkill,
  "session-plan": () => sessionPlanSkill,
  progress: () => progressSkill,
  "phase-assumptions": () => phaseAssumptionsSkill,
  "repo-map": () => repoMapSkill,
  verify: () => verifySkill,
  "config-settings": () => configSettingsSkill,
  "milestone-new": () => milestoneNewSkill,
  "project-new": () => projectNewSkill,
  "phase-remove": () => phaseRemoveSkill,
  "jira-start": () => jiraStartSkill,
  "test-run": () => testRunSkill,
  "pr-qa-consolidate": () => prQaConsolidateSkill,
  "rule-complexity-gating": () => ruleComplexityGatingSkill,
  "rule-file-naming": () => ruleFileNamingSkill,
  "rule-harness-verification": () => ruleHarnessVerificationSkill,
  "rule-hook-skill-boundary": () => ruleHookSkillBoundarySkill,
  "rule-lu-workflow": () => ruleLuWorkflowSkill,
  note: () => noteSkill,
  update: () => updateSkill,
  "help-tour": () => helpTourSkill,
  "workflow-save": () => workflowSaveSkill,
  "profile-export": () => profileExportSkill,
  "profile-import": () => profileImportSkill,
  "seed-memory": () => seedMemorySkill,
  outcome: () => outcomeSkill,
  "session-restore": () => sessionRestoreSkill,
  "repo-cleanup": () => repoCleanupSkill,
  scout: () => scoutSkill,
  "scout-ingest": () => scoutIngestSkill,
  "scout-relevance": () => scoutRelevanceSkill,
  "scout-impl-research": () => scoutImplResearchSkill,
  "scout-research": () => scoutResearchSkill,
  "scout-analyze": () => scoutAnalyzeSkill,
  "scout-integrate": () => scoutIntegrateSkill,
  "scout-plan": () => scoutPlanSkill,
  "scout-graduate": () => scoutGraduateSkill,
  // Sub-skill entries (pr-address, milestone, verify, phase-execute, lu) deleted — migrated to Agent() sub-agents (Phase 232)
  lu: () => luSkill,
};
