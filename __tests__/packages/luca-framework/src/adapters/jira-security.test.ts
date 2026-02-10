/**
 * Jira Adapter Security Tests
 *
 * Tests for ticketId validation, HTTPS enforcement, credential sanitization,
 * and Zod response schema validation.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { createFetchMock, installFetchMock } from '../../../../utils/mock-fetch';
import { createJiraAdapter } from '../../../../../packages/luca-framework/src/adapters/jira-adapter';
import type { JiraAdapterConfig } from '../../../../../packages/luca-framework/src/adapters/jira-adapter';

const validConfig: JiraAdapterConfig = {
  baseUrl: 'https://test.atlassian.net',
  userEmail: 'test@example.com',
  apiToken: 'test-api-token',
};

const validJiraResponse = {
  key: 'PROJ-123',
  fields: {
    summary: 'Test issue',
    description: null,
    issuetype: { name: 'Task' },
    status: { name: 'Open' },
    priority: { name: 'Medium' },
    assignee: { displayName: 'developer' },
  },
};

let restoreFetch: (() => void) | undefined;

describe('Jira Security', () => {
  afterEach(() => {
    if (restoreFetch) {
      restoreFetch();
      restoreFetch = undefined;
    }
  });

  // -------------------------------------------------------------------------
  // Ticket ID validation
  // -------------------------------------------------------------------------
  describe('ticketId validation', () => {
    test('rejects lowercase ticket ID', async () => {
      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('proj-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid Jira ticket ID format');
      }
    });

    test('rejects ticket ID without hyphen', async () => {
      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid Jira ticket ID format');
      }
    });

    test('rejects ticket ID with trailing text', async () => {
      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-123abc');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid Jira ticket ID format');
      }
    });

    test('rejects empty ticket ID', async () => {
      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid Jira ticket ID format');
      }
    });

    test('rejects ticket ID with path traversal', async () => {
      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('../etc/passwd');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid Jira ticket ID format');
      }
    });

    test('rejects ticket ID with URL encoding', async () => {
      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-123%00');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid Jira ticket ID format');
      }
    });

    test('accepts valid ticket ID: PROJ-1', async () => {
      const fetchMock = createFetchMock({ status: 200, body: { ...validJiraResponse, key: 'PROJ-1' } });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-1');
      expect(result.success).toBe(true);
    });

    test('accepts valid ticket ID: AB-999', async () => {
      const fetchMock = createFetchMock({ status: 200, body: { ...validJiraResponse, key: 'AB-999' } });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('AB-999');
      expect(result.success).toBe(true);
    });

    test('accepts valid ticket ID: MYPROJECT-12345', async () => {
      const fetchMock = createFetchMock({ status: 200, body: { ...validJiraResponse, key: 'MYPROJECT-12345' } });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('MYPROJECT-12345');
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // HTTPS enforcement
  // -------------------------------------------------------------------------
  describe('HTTPS enforcement', () => {
    test('rejects http:// base URL in getTicket', async () => {
      const adapter = createJiraAdapter({
        ...validConfig,
        baseUrl: 'http://test.atlassian.net',
      });
      const result = await adapter.getTicket('PROJ-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('HTTPS');
      }
    });

    test('rejects http:// base URL in validate', async () => {
      const adapter = createJiraAdapter({
        ...validConfig,
        baseUrl: 'http://test.atlassian.net',
      });
      const result = await adapter.validate!();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('HTTPS');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Credential sanitization
  // -------------------------------------------------------------------------
  describe('credential sanitization', () => {
    test('strips Basic auth from error messages', async () => {
      const fetchMock = createFetchMock({
        error: new Error('Request failed with Basic dGVzdEBleGFtcGxlLmNvbTp0ZXN0LWFwaS10b2tlbg== in header'),
      });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain('dGVzdEBleGFtcGxlLmNvbTp0ZXN0LWFwaS10b2tlbg==');
        expect(result.error).toContain('[REDACTED]');
      }
    });

    test('strips Bearer token from error messages', async () => {
      const fetchMock = createFetchMock({
        error: new Error('Auth failed: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature'),
      });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain('eyJhbGciOiJIUzI1NiJ9');
        expect(result.error).toContain('[REDACTED]');
      }
    });

    test('strips token= patterns from error messages', async () => {
      const fetchMock = createFetchMock({
        error: new Error('Connection refused token=sk_live_abc123xyz'),
      });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain('sk_live_abc123xyz');
        expect(result.error).toContain('token=[REDACTED]');
      }
    });

    test('preserves normal error messages without credentials', async () => {
      const fetchMock = createFetchMock({
        error: new Error('Network unreachable'),
      });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Network unreachable');
      }
    });

    test('sanitizes errors in validate() too', async () => {
      const fetchMock = createFetchMock({
        error: new Error('Request with Basic dGVzdEBleGFtcGxlLmNvbTp0ZXN0LWFwaS10b2tlbg== leaked'),
      });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.validate!();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain('dGVzdEBleGFtcGxlLmNvbTp0ZXN0LWFwaS10b2tlbg==');
        expect(result.error).toContain('[REDACTED]');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Zod response schema validation
  // -------------------------------------------------------------------------
  describe('response schema validation', () => {
    test('accepts well-formed Jira response', async () => {
      const fetchMock = createFetchMock({ status: 200, body: validJiraResponse });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-123');
      expect(result.success).toBe(true);
    });

    test('accepts minimal Jira response (optional fields omitted)', async () => {
      const fetchMock = createFetchMock({
        status: 200,
        body: {
          key: 'PROJ-456',
          fields: {
            summary: 'Minimal ticket',
            description: null,
          },
        },
      });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-456');
      expect(result.success).toBe(true);
    });

    test('rejects response missing key field', async () => {
      const fetchMock = createFetchMock({
        status: 200,
        body: {
          fields: { summary: 'No key', description: null },
        },
      });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('unexpected response format');
      }
    });

    test('rejects response missing fields.summary', async () => {
      const fetchMock = createFetchMock({
        status: 200,
        body: {
          key: 'PROJ-123',
          fields: { description: null },
        },
      });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('unexpected response format');
      }
    });

    test('rejects response with wrong types', async () => {
      const fetchMock = createFetchMock({
        status: 200,
        body: {
          key: 123,  // should be string
          fields: { summary: 'Test', description: null },
        },
      });
      restoreFetch = installFetchMock(fetchMock);

      const adapter = createJiraAdapter(validConfig);
      const result = await adapter.getTicket('PROJ-123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('unexpected response format');
      }
    });
  });
});
