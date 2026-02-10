/**
 * Shared test fixtures for luca-framework tests.
 *
 * All fixtures match the real types defined in the source code.
 * See: packages/luca-framework/src/types.ts
 *      packages/luca-framework/src/contracts/work-tracker.ts
 *      packages/luca-framework/src/utils/branding.ts
 *      src/agents/types/agent.schemas.ts
 *      src/skills/types/skill.schemas.ts
 *      src/rules/types/rule.schemas.ts
 */

import type {
  LucaConfig,
  BrandingConfig,
  LucaManifest,
  ProjectContext,
  ApprovalConfig,
} from '../../packages/luca-framework/src/types';

import type { WorkTicket } from '../../packages/luca-framework/src/contracts/work-tracker';

import type {
  AgentConfigSchema,
} from '../../src/agents/types/agent.schemas';

import type {
  SkillConfigSchema,
} from '../../src/skills/types/skill.schemas';

import type {
  RuleConfigSchema,
} from '../../src/rules/types/rule.schemas';

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export const validBrandingConfig: BrandingConfig = {
  frameworkName: 'Luca',
  commandPrefix: 'lu',
  ticketPattern: '[A-Z]+-\\d+',
  placeholderTicket: 'PROJ-0000',
};

// ---------------------------------------------------------------------------
// Approval Config
// ---------------------------------------------------------------------------

export const validApprovalConfig: ApprovalConfig = {
  plans: true,
  destructive: true,
  external: true,
  custom_triggers: [],
};

// ---------------------------------------------------------------------------
// LucaConfig
// ---------------------------------------------------------------------------

export const validLucaConfig: LucaConfig = {
  branding: validBrandingConfig,
  stack: 'node-ts',
  workTracker: 'none',
  approvals: validApprovalConfig,
};

// ---------------------------------------------------------------------------
// LucaManifest
// ---------------------------------------------------------------------------

export const validLucaManifest: LucaManifest = {
  version: '0.0.1',
  installedAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  branding: validBrandingConfig,
  stack: 'node-ts',
  workTracker: 'none',
  files: {
    '.cursor/rules/lu-workflow.mdc': {
      originalHash: 'abc123',
      source: 'framework',
    },
  },
};

// ---------------------------------------------------------------------------
// ProjectContext
// ---------------------------------------------------------------------------

export const validProjectContext: ProjectContext = {
  hasPackageJson: true,
  hasGit: true,
  hasLuca: false,
  detectedStack: 'node-ts',
  hasTypeScript: true,
  projectName: 'test-project',
};

// ---------------------------------------------------------------------------
// Work Tracker Fixtures
// ---------------------------------------------------------------------------

export const validWorkTicket: WorkTicket = {
  id: 'PROJ-1234',
  title: 'Implement feature X',
  description: 'As a user I want to do X so that Y',
  type: 'story',
  status: 'In Progress',
  priority: 'medium',
  assignee: 'developer',
  url: 'https://jira.example.com/browse/PROJ-1234',
};

export const validGitHubIssueResponse = {
  number: 42,
  title: 'Bug: something is broken',
  body: 'Steps to reproduce...',
  state: 'open',
  labels: [{ name: 'bug' }],
  assignee: { login: 'developer' },
  html_url: 'https://github.com/org/repo/issues/42',
};

export const validJiraIssueResponse = {
  key: 'PROJ-1234',
  fields: {
    summary: 'Implement feature X',
    description: 'As a user I want to do X so that Y',
    issuetype: { name: 'Story' },
    status: { name: 'In Progress' },
    priority: { name: 'Medium' },
    assignee: { displayName: 'developer' },
  },
};

// ---------------------------------------------------------------------------
// Agent Config (matches AgentConfigSchema from agent.schemas.ts)
// ---------------------------------------------------------------------------

export const validAgentConfig: AgentConfigSchema = {
  frontmatter: {
    name: 'test-agent',
    description: 'A test agent for unit tests',
    tools: ['read', 'write'],
    color: '#ff0000',
  },
  sections: [
    {
      title: 'Main',
      content: 'This is the main section of the test agent.',
      order: 1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Skill Config (matches SkillConfigSchema from skill.schemas.ts)
// ---------------------------------------------------------------------------

export const validSkillConfig: SkillConfigSchema = {
  frontmatter: {
    name: 'test-skill',
    description: 'A test skill for unit tests',
    'disable-model-invocation': false,
  },
  sections: [
    {
      title: 'Instructions',
      content: 'Follow these instructions for the test skill.',
      order: 1,
    },
  ],
};

// ---------------------------------------------------------------------------
// Rule Config (matches RuleConfigSchema from rule.schemas.ts)
// ---------------------------------------------------------------------------

export const validRuleConfig: RuleConfigSchema = {
  frontmatter: {
    description: 'A test rule for unit tests',
    globs: ['**/*.ts'],
    alwaysApply: false,
  },
  sections: [
    {
      title: 'Guidelines',
      content: 'Follow these guidelines for the test rule.',
      order: 1,
    },
  ],
};
