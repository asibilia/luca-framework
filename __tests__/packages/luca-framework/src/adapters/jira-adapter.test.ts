/**
 * Jira Adapter Tests
 *
 * Tests for createJiraAdapter() including getTicket, validate, config resolution,
 * ADF text extraction, type/priority mapping, and HTTP error handling.
 *
 * Uses the shared fetch mock factory to intercept global fetch calls.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createFetchMock, installFetchMock } from '../../../../utils/mock-fetch';
import { createJiraAdapter } from '../../../../../packages/luca-framework/src/adapters/jira-adapter';
import type { JiraAdapterConfig } from '../../../../../packages/luca-framework/src/adapters/jira-adapter';

// -- Jira config used across tests --

const validConfig: JiraAdapterConfig = {
  baseUrl: 'https://test.atlassian.net',
  userEmail: 'test@example.com',
  apiToken: 'test-api-token',
};

// -- ADF fixtures --

const adfDescription = {
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'As a user I want to do X' },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'so that Y' },
      ],
    },
  ],
};

const fullJiraIssueResponse = {
  key: 'PROJ-1234',
  fields: {
    summary: 'Implement feature X',
    description: adfDescription,
    issuetype: { name: 'Story' },
    status: { name: 'In Progress' },
    priority: { name: 'Medium' },
    assignee: { displayName: 'developer' },
  },
};

const minimalJiraIssueResponse = {
  key: 'PROJ-5678',
  fields: {
    summary: 'Minimal ticket',
    description: null,
    issuetype: undefined,
    status: undefined,
    priority: undefined,
    assignee: undefined,
  },
};

// -- Test env cleanup --

let restoreFetch: (() => void) | undefined;
const originalEnv = { ...process.env };

function cleanEnv() {
  delete process.env.JIRA_BASE_URL;
  delete process.env.JIRA_USER_EMAIL;
  delete process.env.JIRA_API_TOKEN;
}

function restoreEnv() {
  process.env.JIRA_BASE_URL = originalEnv.JIRA_BASE_URL;
  process.env.JIRA_USER_EMAIL = originalEnv.JIRA_USER_EMAIL;
  process.env.JIRA_API_TOKEN = originalEnv.JIRA_API_TOKEN;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JiraAdapter', () => {
  afterEach(() => {
    if (restoreFetch) {
      restoreFetch();
      restoreFetch = undefined;
    }
    restoreEnv();
  });

  // -------------------------------------------------------------------------
  // Adapter properties
  // -------------------------------------------------------------------------

  describe('adapter properties', () => {
    test('has name "jira"', () => {
      const adapter = createJiraAdapter(validConfig);
      expect(adapter.name).toBe('jira');
    });

    test('accepts empty config (uses env vars)', () => {
      const adapter = createJiraAdapter();
      expect(adapter.name).toBe('jira');
    });
  });

  // -------------------------------------------------------------------------
  // Config resolution
  // -------------------------------------------------------------------------

  describe('config resolution', () => {
    test('returns error when all config is missing', async () => {
      cleanEnv();
      const adapter = createJiraAdapter({});
      const result = await adapter.getTicket('PROJ-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Jira not configured');
        expect(result.error).toContain('JIRA_BASE_URL');
        expect(result.error).toContain('JIRA_USER_EMAIL');
        expect(result.error).toContain('JIRA_API_TOKEN');
      }
    });

    test('returns error listing only missing config vars', async () => {
      cleanEnv();
      const adapter = createJiraAdapter({ baseUrl: 'https://test.atlassian.net' });
      const result = await adapter.getTicket('PROJ-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain('JIRA_BASE_URL');
        expect(result.error).toContain('JIRA_USER_EMAIL');
        expect(result.error).toContain('JIRA_API_TOKEN');
      }
    });

    test('uses env vars when config params not provided', async () => {
      process.env.JIRA_BASE_URL = 'https://env.atlassian.net';
      process.env.JIRA_USER_EMAIL = 'env@example.com';
      process.env.JIRA_API_TOKEN = 'env-token';

      const fetchMock = createFetchMock({ status: 200, body: fullJiraIssueResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter();
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(true);

      // Verify the fetch was called with the env-based URL
      const calls = fetchMock.getCalls();
      expect(calls.length).toBe(1);
      expect(calls[0]!.url).toContain('https://env.atlassian.net');
    });

    test('config params override env vars', async () => {
      process.env.JIRA_BASE_URL = 'https://env.atlassian.net';
      process.env.JIRA_USER_EMAIL = 'env@example.com';
      process.env.JIRA_API_TOKEN = 'env-token';

      const fetchMock = createFetchMock({ status: 200, body: fullJiraIssueResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(true);

      // Verify the fetch used config param URL, not env var
      const calls = fetchMock.getCalls();
      expect(calls[0]!.url).toContain('https://test.atlassian.net');
    });
  });

  // -------------------------------------------------------------------------
  // getTicket
  // -------------------------------------------------------------------------

  describe('getTicket', () => {
    test('returns ticket for valid issue with ADF description', async () => {
      const fetchMock = createFetchMock({ status: 200, body: fullJiraIssueResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('PROJ-1234');
        expect(result.data.title).toBe('Implement feature X');
        expect(result.data.description).toBe('As a user I want to do X so that Y');
        expect(result.data.type).toBe('story');
        expect(result.data.status).toBe('In Progress');
        expect(result.data.priority).toBe('medium');
        expect(result.data.assignee).toBe('developer');
        expect(result.data.url).toBe('https://test.atlassian.net/browse/PROJ-1234');
      }
    });

    test('builds correct API URL with fields parameter', async () => {
      const fetchMock = createFetchMock({ status: 200, body: fullJiraIssueResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      await adapter.getTicket('PROJ-1234');

      const calls = fetchMock.getCalls();
      expect(calls[0]!.url).toBe(
        'https://test.atlassian.net/rest/api/3/issue/PROJ-1234?fields=summary,description,issuetype,priority,status,assignee'
      );
    });

    test('sends correct auth headers', async () => {
      const fetchMock = createFetchMock({ status: 200, body: fullJiraIssueResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      await adapter.getTicket('PROJ-1234');

      const calls = fetchMock.getCalls();
      const headers = calls[0]!.options?.headers as Record<string, string>;
      expect(headers.Accept).toBe('application/json');

      // Verify Basic auth: base64 of "test@example.com:test-api-token"
      const expectedCredentials = Buffer.from('test@example.com:test-api-token').toString('base64');
      expect(headers.Authorization).toBe(`Basic ${expectedCredentials}`);
    });

    test('returns empty description when ADF is null', async () => {
      const fetchMock = createFetchMock({ status: 200, body: minimalJiraIssueResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-5678');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('');
      }
    });

    test('returns "Unknown" status when status field missing', async () => {
      const fetchMock = createFetchMock({ status: 200, body: minimalJiraIssueResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-5678');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('Unknown');
      }
    });

    test('returns undefined assignee when assignee field missing', async () => {
      const fetchMock = createFetchMock({ status: 200, body: minimalJiraIssueResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-5678');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assignee).toBeUndefined();
      }
    });

    test('returns error for HTTP 401', async () => {
      const fetchMock = createFetchMock({ status: 401, body: { message: 'Unauthorized' } });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Jira authentication failed');
      }
    });

    test('returns error for HTTP 404', async () => {
      const fetchMock = createFetchMock({ status: 404, body: { message: 'Not found' } });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-9999');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('PROJ-9999 not found');
      }
    });

    test('returns error for other HTTP errors (500)', async () => {
      const fetchMock = createFetchMock({ status: 500, body: { message: 'Internal error' } });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Jira API error: 500');
      }
    });

    test('returns error for network failure', async () => {
      const fetchMock = createFetchMock({ error: new Error('Network unreachable') });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Jira API request failed');
        expect(result.error).toContain('Network unreachable');
      }
    });

    test('returns config error before making any fetch call', async () => {
      cleanEnv();
      const fetchMock = createFetchMock({ status: 200, body: fullJiraIssueResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter({});
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(false);
      // No fetch calls should have been made
      expect(fetchMock.getCalls().length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // ADF text extraction (via getTicket)
  // -------------------------------------------------------------------------

  describe('extractAdfText (via getTicket)', () => {
    test('extracts text from multi-paragraph ADF', async () => {
      const fetchMock = createFetchMock({ status: 200, body: fullJiraIssueResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('As a user I want to do X so that Y');
      }
    });

    test('returns empty string for non-object ADF', async () => {
      const issueWithStringDesc = {
        ...fullJiraIssueResponse,
        fields: { ...fullJiraIssueResponse.fields, description: 'plain string' },
      };
      const fetchMock = createFetchMock({ status: 200, body: issueWithStringDesc });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(true);
      if (result.success) {
        // extractAdfText returns '' for non-object (string is typeof 'string', not 'object')
        // Wait - 'plain string' is typeof 'string', not 'object', so it returns ''
        // But actually the Jira response body is JSON, and a string value would be
        // parsed as a string in JS -- extractAdfText checks typeof adf !== 'object'
        expect(result.data.description).toBe('');
      }
    });

    test('returns empty string for ADF with no content array', async () => {
      const issueWithEmptyAdf = {
        ...fullJiraIssueResponse,
        fields: { ...fullJiraIssueResponse.fields, description: { type: 'doc' } },
      };
      const fetchMock = createFetchMock({ status: 200, body: issueWithEmptyAdf });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('');
      }
    });

    test('handles ADF blocks with no content nodes', async () => {
      const adfNoContent = {
        type: 'doc',
        content: [
          { type: 'rule' }, // no content property
        ],
      };
      const issueWithRule = {
        ...fullJiraIssueResponse,
        fields: { ...fullJiraIssueResponse.fields, description: adfNoContent },
      };
      const fetchMock = createFetchMock({ status: 200, body: issueWithRule });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('');
      }
    });

    test('skips non-text ADF nodes', async () => {
      const adfWithNonText = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello' },
              { type: 'emoji', attrs: { shortName: ':smile:' } },
              { type: 'text', text: 'World' },
            ],
          },
        ],
      };
      const issue = {
        ...fullJiraIssueResponse,
        fields: { ...fullJiraIssueResponse.fields, description: adfWithNonText },
      };
      const fetchMock = createFetchMock({ status: 200, body: issue });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');

      expect(result.success).toBe(true);
      if (result.success) {
        // Non-text nodes return '', so we get "Hello  World" which trims to "Hello  World"
        expect(result.data.description).toContain('Hello');
        expect(result.data.description).toContain('World');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Type mapping (via getTicket)
  // -------------------------------------------------------------------------

  describe('mapJiraType (via getTicket)', () => {
    const testTypeMapping = async (jiraType: string | undefined, expectedType: string) => {
      const issue = {
        ...fullJiraIssueResponse,
        fields: {
          ...fullJiraIssueResponse.fields,
          issuetype: jiraType ? { name: jiraType } : undefined,
        },
      };
      const fetchMock = createFetchMock({ status: 200, body: issue });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe(expectedType);
      }
    };

    test('maps Bug to bug', async () => await testTypeMapping('Bug', 'bug'));
    test('maps Story to story', async () => await testTypeMapping('Story', 'story'));
    test('maps Task to task', async () => await testTypeMapping('Task', 'task'));
    test('maps Epic to epic', async () => await testTypeMapping('Epic', 'epic'));
    test('maps Sub-task to subtask', async () => await testTypeMapping('Sub-task', 'subtask'));
    test('defaults to task for unknown type', async () => await testTypeMapping('Custom Type', 'task'));
    test('defaults to task when issuetype is undefined', async () => await testTypeMapping(undefined, 'task'));
  });

  // -------------------------------------------------------------------------
  // Priority mapping (via getTicket)
  // -------------------------------------------------------------------------

  describe('mapJiraPriority (via getTicket)', () => {
    const testPriorityMapping = async (jiraPriority: string | undefined, expectedPriority: string) => {
      const issue = {
        ...fullJiraIssueResponse,
        fields: {
          ...fullJiraIssueResponse.fields,
          priority: jiraPriority ? { name: jiraPriority } : undefined,
        },
      };
      const fetchMock = createFetchMock({ status: 200, body: issue });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1234');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe(expectedPriority);
      }
    };

    test('maps Highest to highest', async () => await testPriorityMapping('Highest', 'highest'));
    test('maps High to high', async () => await testPriorityMapping('High', 'high'));
    test('maps Medium to medium', async () => await testPriorityMapping('Medium', 'medium'));
    test('maps Low to low', async () => await testPriorityMapping('Low', 'low'));
    test('maps Lowest to lowest', async () => await testPriorityMapping('Lowest', 'lowest'));
    test('defaults to medium for unknown priority', async () => await testPriorityMapping('Blocker', 'medium'));
    test('defaults to medium when priority is undefined', async () => await testPriorityMapping(undefined, 'medium'));
  });

  // -------------------------------------------------------------------------
  // validate
  // -------------------------------------------------------------------------

  describe('validate', () => {
    test('returns success when API is reachable', async () => {
      const fetchMock = createFetchMock({ status: 200, body: { displayName: 'User' } });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.validate!();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }

      // Verify it calls the /myself endpoint
      const calls = fetchMock.getCalls();
      expect(calls[0]!.url).toBe('https://test.atlassian.net/rest/api/3/myself');
    });

    test('returns config error when config is missing', async () => {
      cleanEnv();
      const adapter = createJiraAdapter({});
      const result = await adapter.validate!();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Jira not configured');
      }
    });

    test('returns error for HTTP 401 on validate', async () => {
      const fetchMock = createFetchMock({ status: 401, body: {} });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.validate!();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Jira authentication failed');
      }
    });

    test('returns error for non-ok status on validate', async () => {
      const fetchMock = createFetchMock({ status: 503, body: {} });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.validate!();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Jira API validation failed: 503');
      }
    });

    test('returns error on network failure during validate', async () => {
      const fetchMock = createFetchMock({ error: new Error('DNS resolution failed') });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.validate!();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Jira API connection failed');
        expect(result.error).toContain('DNS resolution failed');
      }
    });
  });

  // -------------------------------------------------------------------------
  // createBranch and linkPR (not implemented)
  // -------------------------------------------------------------------------

  describe('optional methods', () => {
    test('does not implement createBranch', () => {
      const adapter = createJiraAdapter(validConfig);
      expect(adapter.createBranch).toBeUndefined();
    });

    test('does not implement linkPR', () => {
      const adapter = createJiraAdapter(validConfig);
      expect(adapter.linkPR).toBeUndefined();
    });
  });
});
