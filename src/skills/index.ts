/**
 * Skill registry for the Luca Framework
 * Auto-generated index file for bulk skill processing
 */

// Import all general skills
import { CodelintSkill } from './general/code-lint.skill';
import { CodetypecheckSkill } from './general/code-typecheck.skill';
import { GitcommitSkill } from './general/git-commit.skill';
import { GitfeatureSkill } from './general/git-feature.skill';
import { GitprSkill } from './general/git-pr.skill';
import { JiraissueSkill } from './general/jira-issue.skill';
import { LuaddphaseSkill } from './general/lu-add-phase.skill';
import { LuaddtodoSkill } from './general/lu-add-todo.skill';
import { LuaddressprSkill } from './general/lu-address-pr.skill';
import { LuauditmilestoneSkill } from './general/lu-audit-milestone.skill';
import { LuchecktodosSkill } from './general/lu-check-todos.skill';
import { LuchooseSkill } from './general/lu-choose.skill';
import { LucompletemilestoneSkill } from './general/lu-complete-milestone.skill';
import { LudebugSkill } from './general/lu-debug.skill';
import { LudiscussphaseSkill } from './general/lu-discuss-phase.skill';
import { LuexecutephaseSkill } from './general/lu-execute-phase.skill';
import { LuhelpSkill } from './general/lu-help.skill';
import { LuinsertphaseSkill } from './general/lu-insert-phase.skill';
import { LupauseworkSkill } from './general/lu-pause-work.skill';
import { LuresumeworkSkill } from './general/lu-resume-work.skill';
import { LuresearchphaseSkill } from './general/lu-research-phase.skill';
import { LusetprofileSkill } from './general/lu-set-profile.skill';
import { LuquickSkill } from './general/lu-quick.skill';
import { LuplanmilestonegapsSkill } from './general/lu-plan-milestone-gaps.skill';
import { LuplanphaseSkill } from './general/lu-plan-phase.skill';
import { LuprogressSkill } from './general/lu-progress.skill';
import { LulistphaseassumptionsSkill } from './general/lu-list-phase-assumptions.skill';
import { LuverifyworkSkill } from './general/lu-verify-work.skill';
import { LusettingsSkill } from './general/lu-settings.skill';
import { LunewmilestoneSkill } from './general/lu-new-milestone.skill';
import { LunewprojectSkill } from './general/lu-new-project.skill';
import { LuremovephaseSkill } from './general/lu-remove-phase.skill';
import { WorkflowstartSkill } from './general/workflow-start.skill';
import { TestrunSkill } from './general/test-run.skill';
import { QaconsolidateSkill } from './general/qa-consolidate.skill';
import { LuupdateSkill } from './general/lu-update.skill';

// Export base skill class
export { BaseSkillImpl } from './base/base-skill';

// Export types
export type { BaseSkill, SkillConfig, SkillFrontmatter, SkillSection } from './types/skill.types';

// Registry mapping skill names to their classes for bulk processing
export const skillRegistry = {
  'code-lint': CodelintSkill,
  'code-typecheck': CodetypecheckSkill,
  'git-commit': GitcommitSkill,
  'git-feature': GitfeatureSkill,
  'git-pr': GitprSkill,
  'jira-issue': JiraissueSkill,
  'lu-add-phase': LuaddphaseSkill,
  'lu-add-todo': LuaddtodoSkill,
  'lu-address-pr': LuaddressprSkill,
  'lu-audit-milestone': LuauditmilestoneSkill,
  'lu-check-todos': LuchecktodosSkill,
  'lu-choose': LuchooseSkill,
  'lu-complete-milestone': LucompletemilestoneSkill,
  'lu-debug': LudebugSkill,
  'lu-discuss-phase': LudiscussphaseSkill,
  'lu-execute-phase': LuexecutephaseSkill,
  'lu-help': LuhelpSkill,
  'lu-insert-phase': LuinsertphaseSkill,
  'lu-pause-work': LupauseworkSkill,
  'lu-resume-work': LuresumeworkSkill,
  'lu-research-phase': LuresearchphaseSkill,
  'lu-set-profile': LusetprofileSkill,
  'lu-quick': LuquickSkill,
  'lu-plan-milestone-gaps': LuplanmilestonegapsSkill,
  'lu-plan-phase': LuplanphaseSkill,
  'lu-progress': LuprogressSkill,
  'lu-list-phase-assumptions': LulistphaseassumptionsSkill,
  'lu-verify-work': LuverifyworkSkill,
  'lu-settings': LusettingsSkill,
  'lu-new-milestone': LunewmilestoneSkill,
  'lu-new-project': LunewprojectSkill,
  'lu-remove-phase': LuremovephaseSkill,
  'workflow-start': WorkflowstartSkill,
  'test-run': TestrunSkill,
  'qa-consolidate': QaconsolidateSkill,
  'lu-update': LuupdateSkill,
};