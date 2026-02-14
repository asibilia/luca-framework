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

// Import Luca-specific skill
import { LuSkill } from "./luca/lu.skill";

// Export base skill class
export { BaseSkillImpl } from "./base/base-skill";

// Export types
export type {
  SkillConfig,
  SkillFrontmatter,
  SkillSection,
} from "./types/skill.types";

// Import BaseSkill for registry type annotation (also re-exported)
import type { BaseSkill } from "./types/skill.types";
export type { BaseSkill };

// Registry mapping skill names to factory functions for bulk processing
export const skillRegistry: Record<string, () => BaseSkill> = {
  "code-lint": () => new CodeLintSkill(),
  "code-typecheck": () => new CodeTypecheckSkill(),
  "git-commit": () => new GitCommitSkill(),
  "git-feature": () => new GitFeatureSkill(),
  "git-pr": () => new GitPrSkill(),
  "jira-issue": () => new JiraIssueSkill(),
  "phase-add": () => new PhaseAddSkill(),
  "todo-add": () => new TodoAddSkill(),
  "pr-address": () => new PrAddressSkill(),
  "milestone-audit": () => new MilestoneAuditSkill(),
  "todo-check": () => new TodoCheckSkill(),
  choose: () => new ChooseSkill(),
  "milestone-complete": () => new MilestoneCompleteSkill(),
  debug: () => new DebugSkill(),
  "phase-discuss": () => new PhaseDiscussSkill(),
  "phase-execute": () => new PhaseExecuteSkill(),
  help: () => new HelpSkill(),
  "phase-insert": () => new PhaseInsertSkill(),
  "session-pause": () => new SessionPauseSkill(),
  "session-resume": () => new SessionResumeSkill(),
  "phase-research": () => new PhaseResearchSkill(),
  "config-profile": () => new ConfigProfileSkill(),
  quick: () => new QuickSkill(),
  "milestone-gaps": () => new MilestoneGapsSkill(),
  "phase-plan": () => new PhasePlanSkill(),
  "session-plan": () => new SessionPlanSkill(),
  progress: () => new ProgressSkill(),
  "phase-assumptions": () => new PhaseAssumptionsSkill(),
  "codebase-map": () => new CodebaseMapSkill(),
  verify: () => new VerifySkill(),
  "config-settings": () => new ConfigSettingsSkill(),
  "milestone-new": () => new MilestoneNewSkill(),
  "project-new": () => new ProjectNewSkill(),
  "phase-remove": () => new PhaseRemoveSkill(),
  "workflow-start": () => new WorkflowStartSkill(),
  "test-run": () => new TestRunSkill(),
  "qa-consolidate": () => new QaConsolidateSkill(),
  "rule-complexity-gating": () => new RuleComplexityGatingSkill(),
  "rule-file-naming": () => new RuleFileNamingSkill(),
  "rule-harness-verification": () => new RuleHarnessVerificationSkill(),
  "rule-hook-skill-boundary": () => new RuleHookSkillBoundarySkill(),
  "rule-lu-workflow": () => new RuleLuWorkflowSkill(),
  autopilot: () => new AutopilotSkill(),
  update: () => new UpdateSkill(),
  lu: () => new LuSkill(),
};
