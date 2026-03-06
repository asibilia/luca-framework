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
import { gitPrSkill } from "../general/git-pr.skill";
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
import { configProfileSkill } from "../general/config-profile.skill";
import { quickSkill } from "../general/quick.skill";
import { repoAuditSkill } from "../general/repo-audit.skill";
import { milestoneGapsSkill } from "../general/milestone-gaps.skill";
import { phasePlanSkill } from "../general/phase-plan.skill";
import { sessionPlanSkill } from "../general/session-plan.skill";
import { progressSkill } from "../general/progress.skill";
import { phaseAssumptionsSkill } from "../general/phase-assumptions.skill";
import { codebaseMapSkill } from "../general/codebase-map.skill";
import { verifySkill } from "../general/verify.skill";
import { configSettingsSkill } from "../general/config-settings.skill";
import { milestoneNewSkill } from "../general/milestone-new.skill";
import { projectNewSkill } from "../general/project-new.skill";
import { phaseRemoveSkill } from "../general/phase-remove.skill";
import { workflowStartSkill } from "../general/workflow-start.skill";
import { testRunSkill } from "../general/test-run.skill";
import { qaConsolidateSkill } from "../general/qa-consolidate.skill";
import { ruleComplexityGatingSkill } from "../general/rule-complexity-gating.skill";
import { ruleFileNamingSkill } from "../general/rule-file-naming.skill";
import { ruleHarnessVerificationSkill } from "../general/rule-harness-verification.skill";
import { ruleHookSkillBoundarySkill } from "../general/rule-hook-skill-boundary.skill";
import { ruleLuWorkflowSkill } from "../general/rule-lu-workflow.skill";
import { noteSkill } from "../general/note.skill";
import { autopilotSkill } from "../general/autopilot.skill";
import { updateSkill } from "../general/update.skill";
import { postInitTourSkill } from "../general/post-init-tour.skill";

// Import Luca-specific skill
import { luSkill } from "../luca/lu.skill";

import type { BaseSkill } from "../__schemas/skill.schemas";

/**
 * Registry mapping skill names to factory functions for bulk processing.
 *
 * Consumed by the build pipeline (build-shared.ts) to generate
 * .claude/ and .cursor/ skill definition files.
 */
export const skillRegistry: Record<string, () => BaseSkill> = {
  "code-lint": () => codeLintSkill,
  "code-typecheck": () => codeTypecheckSkill,
  "git-commit": () => gitCommitSkill,
  "git-feature": () => gitFeatureSkill,
  "git-pr": () => gitPrSkill,
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
  "config-profile": () => configProfileSkill,
  quick: () => quickSkill,
  "repo-audit": () => repoAuditSkill,
  "milestone-gaps": () => milestoneGapsSkill,
  "phase-plan": () => phasePlanSkill,
  "session-plan": () => sessionPlanSkill,
  progress: () => progressSkill,
  "phase-assumptions": () => phaseAssumptionsSkill,
  "codebase-map": () => codebaseMapSkill,
  verify: () => verifySkill,
  "config-settings": () => configSettingsSkill,
  "milestone-new": () => milestoneNewSkill,
  "project-new": () => projectNewSkill,
  "phase-remove": () => phaseRemoveSkill,
  "workflow-start": () => workflowStartSkill,
  "test-run": () => testRunSkill,
  "qa-consolidate": () => qaConsolidateSkill,
  "rule-complexity-gating": () => ruleComplexityGatingSkill,
  "rule-file-naming": () => ruleFileNamingSkill,
  "rule-harness-verification": () => ruleHarnessVerificationSkill,
  "rule-hook-skill-boundary": () => ruleHookSkillBoundarySkill,
  "rule-lu-workflow": () => ruleLuWorkflowSkill,
  note: () => noteSkill,
  autopilot: () => autopilotSkill,
  update: () => updateSkill,
  "post-init-tour": () => postInitTourSkill,
  lu: () => luSkill,
};
