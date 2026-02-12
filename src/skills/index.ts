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
import { LuAddPhaseSkill } from "./general/lu-add-phase.skill";
import { LuAddTodoSkill } from "./general/lu-add-todo.skill";
import { LuAddressPrSkill } from "./general/lu-address-pr.skill";
import { LuAuditMilestoneSkill } from "./general/lu-audit-milestone.skill";
import { LuCheckTodosSkill } from "./general/lu-check-todos.skill";
import { LuChooseSkill } from "./general/lu-choose.skill";
import { LuCompleteMilestoneSkill } from "./general/lu-complete-milestone.skill";
import { LuDebugSkill } from "./general/lu-debug.skill";
import { LuDiscussPhaseSkill } from "./general/lu-discuss-phase.skill";
import { LuExecutePhaseSkill } from "./general/lu-execute-phase.skill";
import { LuHelpSkill } from "./general/lu-help.skill";
import { LuInsertPhaseSkill } from "./general/lu-insert-phase.skill";
import { LuPauseWorkSkill } from "./general/lu-pause-work.skill";
import { LuResumeWorkSkill } from "./general/lu-resume-work.skill";
import { LuResearchPhaseSkill } from "./general/lu-research-phase.skill";
import { LuSetProfileSkill } from "./general/lu-set-profile.skill";
import { LuQuickSkill } from "./general/lu-quick.skill";
import { LuPlanMilestoneGapsSkill } from "./general/lu-plan-milestone-gaps.skill";
import { LuPlanPhaseSkill } from "./general/lu-plan-phase.skill";
import { LuPlanSessionSkill } from "./general/lu-plan-session.skill";
import { LuProgressSkill } from "./general/lu-progress.skill";
import { LuListPhaseAssumptionsSkill } from "./general/lu-list-phase-assumptions.skill";
import { LuMapCodebaseSkill } from "./general/lu-map-codebase.skill";
import { LuVerifyWorkSkill } from "./general/lu-verify-work.skill";
import { LuSettingsSkill } from "./general/lu-settings.skill";
import { LuNewMilestoneSkill } from "./general/lu-new-milestone.skill";
import { LuNewProjectSkill } from "./general/lu-new-project.skill";
import { LuRemovePhaseSkill } from "./general/lu-remove-phase.skill";
import { WorkflowStartSkill } from "./general/workflow-start.skill";
import { TestRunSkill } from "./general/test-run.skill";
import { QaConsolidateSkill } from "./general/qa-consolidate.skill";
import { LuUpdateSkill } from "./general/lu-update.skill";

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
  "lu-add-phase": LuAddPhaseSkill,
  "lu-add-todo": LuAddTodoSkill,
  "lu-address-pr": LuAddressPrSkill,
  "lu-audit-milestone": LuAuditMilestoneSkill,
  "lu-check-todos": LuCheckTodosSkill,
  "lu-choose": LuChooseSkill,
  "lu-complete-milestone": LuCompleteMilestoneSkill,
  "lu-debug": LuDebugSkill,
  "lu-discuss-phase": LuDiscussPhaseSkill,
  "lu-execute-phase": LuExecutePhaseSkill,
  "lu-help": LuHelpSkill,
  "lu-insert-phase": LuInsertPhaseSkill,
  "lu-pause-work": LuPauseWorkSkill,
  "lu-resume-work": LuResumeWorkSkill,
  "lu-research-phase": LuResearchPhaseSkill,
  "lu-set-profile": LuSetProfileSkill,
  "lu-quick": LuQuickSkill,
  "lu-plan-milestone-gaps": LuPlanMilestoneGapsSkill,
  "lu-plan-phase": LuPlanPhaseSkill,
  "lu-plan-session": LuPlanSessionSkill,
  "lu-progress": LuProgressSkill,
  "lu-list-phase-assumptions": LuListPhaseAssumptionsSkill,
  "lu-map-codebase": LuMapCodebaseSkill,
  "lu-verify-work": LuVerifyWorkSkill,
  "lu-settings": LuSettingsSkill,
  "lu-new-milestone": LuNewMilestoneSkill,
  "lu-new-project": LuNewProjectSkill,
  "lu-remove-phase": LuRemovePhaseSkill,
  "workflow-start": WorkflowStartSkill,
  "test-run": TestRunSkill,
  "qa-consolidate": QaConsolidateSkill,
  "lu-update": LuUpdateSkill,
};
