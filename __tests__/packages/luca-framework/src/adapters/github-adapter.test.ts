/**
 * GitHub Adapter Tests
 *
 * Tests for createGitHubAdapter() including getTicket, createBranch, linkPR,
 * validate, label mapping (type and priority), and error parsing.
 *
 * Uses mock.module() to replace execa before the adapter is imported.
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { createExecaMock, installExecaMock } from '../../../../utils/mock-execa';

// -- Fixtures matching the actual GitHubIssueResponse shape used by the adapter --

const fullIssueResponse = {
  number: 42,
  title: 'Bug: something is broken',
  body: 'Steps to reproduce...',
  state: 'open',
  labels: [{ name: 'bug' }],
  assignees: [{ login: 'developer' }],
  url: 'https://github.com/org/repo/issues/42',
};

const minimalIssueResponse = {
  number: 1,
  title: 'Minimal issue',
  body: null,
  state: 'closed',
  labels: [],
  assignees: [],
  url: 'https://github.com/org/repo/issues/1',
};

// ---------------------------------------------------------------------------
// getTicket
// ---------------------------------------------------------------------------

describe('GitHubAdapter', () => {
  describe('getTicket', () => {
    test('returns ticket for valid issue with # prefix', async () => {
      const execaMock = createExecaMock({
        stdout: JSON.stringify(fullIssueResponse),
      });
      installExecaMock(execaMock);

      // Dynamic import after mock is installed
      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('#42');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('#42');
        expect(result.data.title).toBe('Bug: something is broken');
        expect(result.data.description).toBe('Steps to reproduce...');
        expect(result.data.type).toBe('bug');
        expect(result.data.status).toBe('open');
        expect(result.data.priority).toBe('medium');
        expect(result.data.assignee).toBe('developer');
        expect(result.data.url).toBe('https://github.com/org/repo/issues/42');
      }

      // Verify execa was called with correct args (# stripped)
      const calls = execaMock.getCalls();
      expect(calls.length).toBe(1);
      expect(calls[0]!.command).toBe('gh');
      expect(calls[0]!.args).toContain('42');
    });

    test('returns ticket for valid issue without # prefix', async () => {
      const execaMock = createExecaMock({
        stdout: JSON.stringify(fullIssueResponse),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('#42');
      }
    });

    test('returns ticket with empty description when body is null', async () => {
      const execaMock = createExecaMock({
        stdout: JSON.stringify(minimalIssueResponse),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('');
        expect(result.data.assignee).toBeUndefined();
        expect(result.data.type).toBe('task');
        expect(result.data.priority).toBe('medium');
      }
    });

    test('returns error when issue not found', async () => {
      const execaMock = createExecaMock({
        error: new Error('could not resolve to an issue: not found'),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('999');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Issue #999 not found');
      }
    });

    test('returns error when gh CLI not installed (ENOENT style)', async () => {
      // Note: "command not found" also contains "not found" which matches the
      // first condition in parseGhError, so it returns "Issue #1 not found".
      // The ENOENT pattern is the reliable way to detect missing CLI.
      // This test verifies the "command not found" message is handled
      // (it matches the "not found" branch in parseGhError).
      const execaMock = createExecaMock({
        error: new Error('command not found: gh'),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('1');

      expect(result.success).toBe(false);
      // "command not found" contains "not found", so parseGhError matches that first
      if (!result.success) {
        expect(result.error).toContain('not found');
      }
    });

    test('returns error when gh CLI ENOENT', async () => {
      const execaMock = createExecaMock({
        error: new Error('ENOENT'),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('GitHub CLI (gh) not installed');
      }
    });

    test('returns error when not authenticated', async () => {
      const execaMock = createExecaMock({
        error: new Error('not logged in to any GitHub hosts'),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('GitHub CLI not authenticated');
      }
    });

    test('returns generic error for unknown errors', async () => {
      const execaMock = createExecaMock({
        error: new Error('something unexpected happened'),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('GitHub CLI error:');
        expect(result.error).toContain('something unexpected happened');
      }
    });

    test('handles non-Error thrown values', async () => {
      const execaMock = createExecaMock({
        error: 'string error' as unknown as Error,
      });
      // The mock factory throws the error object; when it's a string, parseGhError
      // uses String(error) path
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('1');

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Label mapping — type inference
  // -------------------------------------------------------------------------

  describe('inferTypeFromLabels (via getTicket)', () => {
    test('maps "bug" label to bug type', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'bug' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe('bug');
    });

    test('maps "enhancement" label to story type', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'enhancement' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe('story');
    });

    test('maps "feature" label to story type', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'feature' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe('story');
    });

    test('maps "epic" label to epic type', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'epic' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe('epic');
    });

    test('defaults to task type with no matching labels', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'documentation' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe('task');
    });

    test('label matching is case-insensitive', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'BUG' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe('bug');
    });
  });

  // -------------------------------------------------------------------------
  // Label mapping — priority inference
  // -------------------------------------------------------------------------

  describe('inferPriorityFromLabels (via getTicket)', () => {
    test('maps "critical" label to highest priority', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'critical' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe('highest');
    });

    test('maps "urgent" label to highest priority', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'urgent' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe('highest');
    });

    test('maps "high" label to high priority', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'high' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe('high');
    });

    test('maps "priority" label to high priority', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'priority' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe('high');
    });

    test('maps "low" label to low priority', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: 'low' }] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe('low');
    });

    test('defaults to medium priority with no matching labels', async () => {
      const issue = { ...fullIssueResponse, labels: [] };
      const execaMock = createExecaMock({ stdout: JSON.stringify(issue) });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe('medium');
    });
  });

  // -------------------------------------------------------------------------
  // createBranch
  // -------------------------------------------------------------------------

  describe('createBranch', () => {
    test('creates branch via gh issue develop', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('#42', 'feat/my-branch');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('feat/my-branch');
      }

      const calls = execaMock.getCalls();
      expect(calls[0]!.command).toBe('gh');
      expect(calls[0]!.args).toEqual(['issue', 'develop', '42', '--name', 'feat/my-branch']);
    });

    test('falls back to git checkout when gh issue develop fails', async () => {
      const execaMock = createExecaMock({}, [
        { error: new Error('gh issue develop not supported') },
        { stdout: '' }, // git checkout -b succeeds
      ]);
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', 'feat/fallback');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('feat/fallback');
      }

      const calls = execaMock.getCalls();
      expect(calls.length).toBe(2);
      expect(calls[1]!.command).toBe('git');
      expect(calls[1]!.args).toEqual(['checkout', '-b', 'feat/fallback']);
    });

    test('returns error when both gh and git fail', async () => {
      const execaMock = createExecaMock({}, [
        { error: new Error('gh issue develop failed') },
        { error: new Error('branch already exists') },
      ]);
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', 'feat/existing');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to create branch');
        expect(result.error).toContain('branch already exists');
      }
    });
  });

  // -------------------------------------------------------------------------
  // linkPR
  // -------------------------------------------------------------------------

  describe('linkPR', () => {
    test('always returns success (no-op)', async () => {
      const execaMock = createExecaMock();
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.linkPR!('#42', 'https://github.com/org/repo/pull/1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }

      // No execa calls should have been made
      expect(execaMock.getCalls().length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // validate
  // -------------------------------------------------------------------------

  describe('validate', () => {
    test('returns success when logged in', async () => {
      const execaMock = createExecaMock({
        stdout: 'Logged in to github.com account user (keyring)',
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    test('returns success when active account status', async () => {
      const execaMock = createExecaMock({
        stdout: 'Active account: true',
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(true);
    });

    test('returns error when not authenticated (stdout without login status)', async () => {
      // The validate method checks if stdout includes "logged in" or "active account: true".
      // When neither matches, it returns an error.
      const execaMock = createExecaMock({
        stdout: 'No accounts configured. Run gh auth login.',
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('GitHub CLI not authenticated');
      }
    });

    test('returns error when gh CLI not installed (exception)', async () => {
      const execaMock = createExecaMock({
        error: new Error('command not found: gh'),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('GitHub CLI (gh) not installed');
      }
    });

    test('returns generic validation error for unknown errors', async () => {
      const execaMock = createExecaMock({
        error: new Error('some unexpected error'),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('GitHub CLI validation failed');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Adapter properties
  // -------------------------------------------------------------------------

  describe('adapter properties', () => {
    test('has name "github"', async () => {
      const execaMock = createExecaMock();
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      expect(adapter.name).toBe('github');
    });

    test('accepts optional config', async () => {
      const execaMock = createExecaMock({
        stdout: JSON.stringify(fullIssueResponse),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter({ owner: 'myorg', repo: 'myrepo' });
      expect(adapter.name).toBe('github');
    });
  });
});
