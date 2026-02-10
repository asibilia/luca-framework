/**
 * GitHub Adapter Shell Hardening Tests
 *
 * Tests for input validation (validateBranchName, validateIssueNumber),
 * `--` argument markers in execa calls, and error message sanitization
 * in parseGhError.
 *
 * Uses mock.module() to replace execa before the adapter is imported.
 */

import { describe, test, expect, mock } from 'bun:test';
import { createExecaMock, installExecaMock } from '../../../../utils/mock-execa';

// -- Fixtures --

const validIssueResponse = {
  number: 42,
  title: 'Test issue',
  body: 'Test body',
  state: 'open',
  labels: [{ name: 'bug' }],
  assignees: [{ login: 'developer' }],
  url: 'https://github.com/org/repo/issues/42',
};

// ---------------------------------------------------------------------------
// validateBranchName (tested indirectly via createBranch)
// ---------------------------------------------------------------------------

describe('GitHubAdapter Security', () => {
  describe('validateBranchName (via createBranch)', () => {
    test('rejects empty branch name', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', '');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Branch name is required');
      }
      // No execa calls should have been made
      expect(execaMock.getCalls().length).toBe(0);
    });

    test('rejects branch name starting with -', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', '--delete');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('cannot start with -');
      }
      expect(execaMock.getCalls().length).toBe(0);
    });

    test('rejects branch name containing ..', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', 'main..dev');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('cannot contain ..');
      }
      expect(execaMock.getCalls().length).toBe(0);
    });

    test('rejects branch name with whitespace', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', 'my branch');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('invalid characters');
      }
      expect(execaMock.getCalls().length).toBe(0);
    });

    test('rejects branch name with tilde', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', 'branch~1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('invalid characters');
      }
      expect(execaMock.getCalls().length).toBe(0);
    });

    test('rejects branch name ending with .lock', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', 'refs.lock');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('cannot end with .lock');
      }
      expect(execaMock.getCalls().length).toBe(0);
    });

    test('rejects branch name ending with .', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', 'branch.');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('cannot end with .');
      }
      expect(execaMock.getCalls().length).toBe(0);
    });

    test('rejects branch name containing //', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', 'feat//branch');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('cannot contain //');
      }
      expect(execaMock.getCalls().length).toBe(0);
    });

    test('accepts valid branch names', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!('42', 'feat/valid-branch-name');

      expect(result.success).toBe(true);
      // Should have made at least one execa call
      expect(execaMock.getCalls().length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // validateIssueNumber (tested indirectly via getTicket)
  // -------------------------------------------------------------------------

  describe('validateIssueNumber (via getTicket)', () => {
    test('rejects non-numeric issue number', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('--json');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Issue number must be numeric');
      }
      // No execa calls should have been made
      expect(execaMock.getCalls().length).toBe(0);
    });

    test('rejects issue number with special characters', async () => {
      const execaMock = createExecaMock({ stdout: '' });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42; rm -rf /');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Issue number must be numeric');
      }
      expect(execaMock.getCalls().length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // -- markers in execa calls
  // -------------------------------------------------------------------------

  describe('-- argument markers', () => {
    test('getTicket uses -- before issue number in execa args', async () => {
      const execaMock = createExecaMock({
        stdout: JSON.stringify(validIssueResponse),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      await adapter.getTicket('42');

      const calls = execaMock.getCalls();
      expect(calls.length).toBe(1);
      const args = calls[0]!.args;

      // -- should come before the issue number
      const dashDashIndex = args.indexOf('--');
      const issueIndex = args.indexOf('42');
      expect(dashDashIndex).toBeGreaterThan(-1);
      expect(issueIndex).toBeGreaterThan(dashDashIndex);

      // --json should come before --
      const jsonFlagIndex = args.indexOf('--json');
      expect(jsonFlagIndex).toBeGreaterThan(-1);
      expect(jsonFlagIndex).toBeLessThan(dashDashIndex);
    });

    test('createBranch git fallback uses -- before branch name', async () => {
      const execaMock = createExecaMock({}, [
        { error: new Error('gh issue develop not supported') },
        { stdout: '' }, // git checkout -b succeeds
      ]);
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      await adapter.createBranch!('42', 'feat/test-branch');

      const calls = execaMock.getCalls();
      expect(calls.length).toBe(2);

      // Second call is git checkout -b -- <branchName>
      const gitCall = calls[1]!;
      expect(gitCall.command).toBe('git');
      expect(gitCall.args).toEqual(['checkout', '-b', '--', 'feat/test-branch']);
    });
  });

  // -------------------------------------------------------------------------
  // Error sanitization in parseGhError
  // -------------------------------------------------------------------------

  describe('parseGhError sanitization', () => {
    test('redacts token patterns from error messages', async () => {
      const execaMock = createExecaMock({
        error: new Error('Request failed: token ghp_abc123def456 is expired'),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain('ghp_abc123def456');
        expect(result.error).toContain('[REDACTED]');
      }
    });

    test('redacts bearer patterns from error messages', async () => {
      const execaMock = createExecaMock({
        error: new Error('HTTP 401: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9 invalid'),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9');
        expect(result.error).toContain('[REDACTED]');
      }
    });

    test('redacts github_pat_ patterns from error messages', async () => {
      const execaMock = createExecaMock({
        error: new Error('Auth error with github_pat_11AAAAAA_xxxxxxxxxxxxx credential'),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket('42');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain('github_pat_11AAAAAA_xxxxxxxxxxxxx');
        expect(result.error).toContain('[REDACTED]');
      }
    });
  });
});
