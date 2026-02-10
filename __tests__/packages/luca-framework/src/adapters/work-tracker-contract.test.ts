/**
 * Work Tracker Contract Test Suite
 *
 * Parameterized tests that validate all adapters implement the
 * WorkTrackerContract interface uniformly. Each adapter must:
 *
 * 1. Have a `name` property of type WorkTrackerType
 * 2. Have a `getTicket()` method that returns AdapterResult<WorkTicket>
 * 3. Have an optional `validate()` method that returns AdapterResult<boolean>
 * 4. Return properly shaped success/error results
 *
 * Adapters are tested with appropriate mocking:
 * - GitHub: mock.module for execa
 * - Jira: global fetch mock
 * - Placeholder: no mocks needed
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { createExecaMock, installExecaMock } from '../../../../utils/mock-execa';
import { createFetchMock, installFetchMock } from '../../../../utils/mock-fetch';
import type { WorkTrackerContract, WorkTrackerType } from '../../../../../packages/luca-framework/src/contracts/work-tracker';

// -- Fixtures for each adapter's happy path --

const githubIssueResponse = {
  number: 10,
  title: 'Contract test issue',
  body: 'Contract test body',
  state: 'open',
  labels: [{ name: 'bug' }],
  assignees: [{ login: 'tester' }],
  url: 'https://github.com/org/repo/issues/10',
};

const jiraIssueResponse = {
  key: 'CT-100',
  fields: {
    summary: 'Contract test ticket',
    description: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Contract test description' }],
        },
      ],
    },
    issuetype: { name: 'Task' },
    status: { name: 'Open' },
    priority: { name: 'High' },
    assignee: { displayName: 'tester' },
  },
};

// -- Adapter factory functions that set up mocks and return adapters --

interface AdapterSetup {
  name: WorkTrackerType;
  ticketId: string;
  create: () => Promise<{ adapter: WorkTrackerContract; cleanup?: () => void }>;
}

const adapterSetups: AdapterSetup[] = [
  {
    name: 'github',
    ticketId: '#10',
    create: async () => {
      const execaMock = createExecaMock({
        stdout: JSON.stringify(githubIssueResponse),
      });
      installExecaMock(execaMock);

      const { createGitHubAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/github-adapter'
      );
      return { adapter: createGitHubAdapter() };
    },
  },
  {
    name: 'jira',
    ticketId: 'CT-100',
    create: async () => {
      const fetchMock = createFetchMock(
        { status: 200, body: jiraIssueResponse },
        {
          '/rest/api/3/myself': { status: 200, body: { displayName: 'tester' } },
        }
      );
      const restoreFetch = installFetchMock(fetchMock);

      const { createJiraAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/jira-adapter'
      );
      return {
        adapter: createJiraAdapter({
          baseUrl: 'https://contract-test.atlassian.net',
          userEmail: 'test@example.com',
          apiToken: 'token',
        }),
        cleanup: restoreFetch,
      };
    },
  },
  {
    name: 'none',
    ticketId: 'PT-0000',
    create: async () => {
      const { createPlaceholderAdapter } = await import(
        '../../../../../packages/luca-framework/src/adapters/placeholder-adapter'
      );
      return { adapter: createPlaceholderAdapter() };
    },
  },
];

// ---------------------------------------------------------------------------
// Parameterized contract tests
// ---------------------------------------------------------------------------

describe('WorkTrackerContract compliance', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
  });

  for (const setup of adapterSetups) {
    describe(`${setup.name} adapter`, () => {
      test('has a name property matching a WorkTrackerType', async () => {
        const { adapter, cleanup: c } = await setup.create();
        cleanup = c;

        const validNames: WorkTrackerType[] = ['github', 'jira', 'none'];
        expect(validNames).toContain(adapter.name);
        expect(adapter.name).toBe(setup.name);
      });

      test('has a getTicket method that is a function', async () => {
        const { adapter, cleanup: c } = await setup.create();
        cleanup = c;

        expect(typeof adapter.getTicket).toBe('function');
      });

      test('getTicket returns AdapterResult with success shape', async () => {
        const { adapter, cleanup: c } = await setup.create();
        cleanup = c;

        const result = await adapter.getTicket(setup.ticketId);
        expect(result).toHaveProperty('success');

        if (result.success) {
          expect(result).toHaveProperty('data');
          expect(result.data).toHaveProperty('id');
          expect(result.data).toHaveProperty('title');
          expect(result.data).toHaveProperty('description');
          expect(result.data).toHaveProperty('type');
          expect(result.data).toHaveProperty('status');
          expect(result.data).toHaveProperty('priority');
          expect(result.data).toHaveProperty('url');
          // assignee is optional
          expect(typeof result.data.id).toBe('string');
          expect(typeof result.data.title).toBe('string');
          expect(typeof result.data.description).toBe('string');
          expect(typeof result.data.status).toBe('string');
          expect(typeof result.data.url).toBe('string');
        }
      });

      test('getTicket returns WorkTicket with valid type value', async () => {
        const { adapter, cleanup: c } = await setup.create();
        cleanup = c;

        const result = await adapter.getTicket(setup.ticketId);
        expect(result.success).toBe(true);
        if (result.success) {
          const validTypes = ['bug', 'story', 'task', 'epic', 'subtask'];
          expect(validTypes).toContain(result.data.type);
        }
      });

      test('getTicket returns WorkTicket with valid priority value', async () => {
        const { adapter, cleanup: c } = await setup.create();
        cleanup = c;

        const result = await adapter.getTicket(setup.ticketId);
        expect(result.success).toBe(true);
        if (result.success) {
          const validPriorities = ['highest', 'high', 'medium', 'low', 'lowest'];
          expect(validPriorities).toContain(result.data.priority);
        }
      });

      test('validate method (if present) returns AdapterResult<boolean>', async () => {
        const { adapter, cleanup: c } = await setup.create();
        cleanup = c;

        if (adapter.validate) {
          const result = await adapter.validate();
          expect(result).toHaveProperty('success');

          if (result.success) {
            expect(typeof result.data).toBe('boolean');
          } else {
            expect(typeof result.error).toBe('string');
          }
        }
      });

      test('optional createBranch is either undefined or a function', async () => {
        const { adapter, cleanup: c } = await setup.create();
        cleanup = c;

        if (adapter.createBranch !== undefined) {
          expect(typeof adapter.createBranch).toBe('function');
        }
      });

      test('optional linkPR is either undefined or a function', async () => {
        const { adapter, cleanup: c } = await setup.create();
        cleanup = c;

        if (adapter.linkPR !== undefined) {
          expect(typeof adapter.linkPR).toBe('function');
        }
      });
    });
  }
});
