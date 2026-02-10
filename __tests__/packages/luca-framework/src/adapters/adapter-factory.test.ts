/**
 * Adapter Factory Tests
 *
 * Tests for createWorkTrackerAdapter() factory function that returns the
 * correct adapter type for each WorkTrackerType input.
 */

import { describe, test, expect } from 'bun:test';
import { createWorkTrackerAdapter } from '../../../../../packages/luca-framework/src/adapters/index';
import type { WorkTrackerType } from '../../../../../packages/luca-framework/src/contracts/work-tracker';

describe('createWorkTrackerAdapter (factory)', () => {
  test('returns github adapter for type "github"', () => {
    const adapter = createWorkTrackerAdapter('github');
    expect(adapter.name).toBe('github');
  });

  test('returns jira adapter for type "jira"', () => {
    const adapter = createWorkTrackerAdapter('jira');
    expect(adapter.name).toBe('jira');
  });

  test('returns placeholder adapter for type "none"', () => {
    const adapter = createWorkTrackerAdapter('none');
    expect(adapter.name).toBe('none');
  });

  test('returns placeholder adapter for unknown type (default case)', () => {
    // The switch uses `default` which falls through to placeholder
    const adapter = createWorkTrackerAdapter('unknown' as WorkTrackerType);
    expect(adapter.name).toBe('none');
  });

  test('passes github config to github adapter', () => {
    const adapter = createWorkTrackerAdapter('github', {
      githubOwner: 'myorg',
      githubRepo: 'myrepo',
    });
    expect(adapter.name).toBe('github');
    // The adapter itself stores config internally; we verify it was created without error
    expect(adapter.getTicket).toBeDefined();
  });

  test('passes jira config to jira adapter', () => {
    const adapter = createWorkTrackerAdapter('jira', {
      jiraBaseUrl: 'https://test.atlassian.net',
      jiraUserEmail: 'test@example.com',
      jiraApiToken: 'token',
    });
    expect(adapter.name).toBe('jira');
    expect(adapter.getTicket).toBeDefined();
  });

  test('passes placeholder config to placeholder adapter', () => {
    const adapter = createWorkTrackerAdapter('none', {
      placeholderTicket: 'CUSTOM-000',
    });
    expect(adapter.name).toBe('none');
    // Verify config was passed through by checking getTicket behavior
  });

  test('placeholder adapter receives config and uses it', async () => {
    const adapter = createWorkTrackerAdapter('none', {
      placeholderTicket: 'CUSTOM-000',
    });
    const result = await adapter.getTicket('');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('CUSTOM-000');
    }
  });
});
