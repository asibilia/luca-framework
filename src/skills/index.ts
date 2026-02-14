/**
 * Skill registry for the Luca Framework
 * Auto-generated index file for bulk skill processing
 */

// Import all general skills
import { CodeLintSkill } from "./general/code-lint.skill";
import { CodeTypecheckSkill } from "./general/code-typecheck.skill";
import { GitCommitSkill } from "./general/git-commit.skill";
import { GitFeatureSkill } from "./general/git-feature.skill";
import { GitPrSkill } from "./general/git-pr.skill";
import { JiraIssueSkill } from "./general/jira-issue.skill";
import { PhaseAddSkill } from "./general/phase-add.skill";
import { TodoAddSkill } from "./general/todo-add.skill";
import { PrAddressSkill } from "./general/pr-address.skill";
import { MilestoneAuditSkill } from "./general/milestone-audit.skill";
import { TodoCheckSkill } from "./general/todo-check.skill";
import { ChooseSkill } from "./general/choose.skill";
import { MilestoneCompleteSkill } from "./general/milestone-complete.skill";
import { DebugSkill } from "./general/debug.skill";
import { PhaseDiscussSkill } from "./general/phase-discuss.skill";
import { PhaseExecuteSkill } from "./general/phase-execute.skill";
import { HelpSkill } from "./general/help.skill";
import { PhaseInsertSkill } from "./general/phase-insert.skill";
import { SessionPauseSkill } from "./general/session-pause.skill";
import { SessionResumeSkill } from "./general/session-resume.skill";
import { PhaseResearchSkill } from "./general/phase-research.skill";
import { ConfigProfileSkill } from "./general/config-profile.skill";
import { QuickSkill } from "./general/quick.skill";
import { MilestoneGapsSkill } from "./general/milestone-gaps.skill";
import { PhasePlanSkill } from "./general/phase-plan.skill";
import { SessionPlanSkill } from "./general/session-plan.skill";
import { ProgressSkill } from "./general/progress.skill";
import { PhaseAssumptionsSkill } from "./general/phase-assumptions.skill";
import { CodebaseMapSkill } from "./general/codebase-map.skill";
import { VerifySkill } from "./general/verify.skill";
import { ConfigSettingsSkill } from "./general/config-settings.skill";
import { MilestoneNewSkill } from "./general/milestone-new.skill";
import { ProjectNewSkill } from "./general/project-new.skill";
import { PhaseRemoveSkill } from "./general/phase-remove.skill";
import { WorkflowStartSkill } from "./general/workflow-start.skill";
import { TestRunSkill } from "./general/test-run.skill";
import { QaConsolidateSkill } from "./general/qa-consolidate.skill";
import { RuleComplexityGatingSkill } from "./general/rule-complexity-gating.skill";
import { RuleFileNamingSkill } from "./general/rule-file-naming.skill";
import { RuleHarnessVerificationSkill } from "./general/rule-harness-verification.skill";
import { RuleHookSkillBoundarySkill } from "./general/rule-hook-skill-boundary.skill";
import { RuleLuWorkflowSkill } from "./general/rule-lu-workflow.skill";
import { AutopilotSkill } from "./general/autopilot.skill";
import { UpdateSkill } from "./general/update.skill";

// Export base skill class
export { BaseSkillImpl } from "./base/base-skill";

// Export types
export type {
  BaseSkill,
  SkillConfig,
  SkillFrontmatter,
  SkillSection,
} from "./types/skill.types";

// Registry mapping skill names to their classes for bulk processing
export const skillRegistry = {
  "code-lint": CodeLintSkill,
  "code-typecheck": CodeTypecheckSkill,
  "git-commit": GitCommitSkill,
  "git-feature": GitFeatureSkill,
  "git-pr": GitPrSkill,
  "jira-issue": JiraIssueSkill,
  "phase-add": PhaseAddSkill,
  "todo-add": TodoAddSkill,
  "pr-address": PrAddressSkill,
  "milestone-audit": MilestoneAuditSkill,
  "todo-check": TodoCheckSkill,
  choose: ChooseSkill,
  "milestone-complete": MilestoneCompleteSkill,
  debug: DebugSkill,
  "phase-discuss": PhaseDiscussSkill,
  "phase-execute": PhaseExecuteSkill,
  help: HelpSkill,
  "phase-insert": PhaseInsertSkill,
  "session-pause": SessionPauseSkill,
  "session-resume": SessionResumeSkill,
  "phase-research": PhaseResearchSkill,
  "config-profile": ConfigProfileSkill,
  quick: QuickSkill,
  "milestone-gaps": MilestoneGapsSkill,
  "phase-plan": PhasePlanSkill,
  "session-plan": SessionPlanSkill,
  progress: ProgressSkill,
  "phase-assumptions": PhaseAssumptionsSkill,
  "codebase-map": CodebaseMapSkill,
  verify: VerifySkill,
  "config-settings": ConfigSettingsSkill,
  "milestone-new": MilestoneNewSkill,
  "project-new": ProjectNewSkill,
  "phase-remove": PhaseRemoveSkill,
  "workflow-start": WorkflowStartSkill,
  "test-run": TestRunSkill,
  "qa-consolidate": QaConsolidateSkill,
  "rule-complexity-gating": RuleComplexityGatingSkill,
  "rule-file-naming": RuleFileNamingSkill,
  "rule-harness-verification": RuleHarnessVerificationSkill,
  "rule-hook-skill-boundary": RuleHookSkillBoundarySkill,
  "rule-lu-workflow": RuleLuWorkflowSkill,
  autopilot: AutopilotSkill,
  update: UpdateSkill,
};
