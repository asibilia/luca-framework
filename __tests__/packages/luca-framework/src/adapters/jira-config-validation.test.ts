/**
 * Jira checkConfig() format validation tests.
 *
 * Verifies that the Jira adapter validates environment variable formats
 * (HTTPS URL, email, non-empty token) in addition to presence checks.
 *
 * Uses config params (not env vars) to isolate format validation behavior.
 */
import { describe, test, expect, afterEach } from 'bun:test';
import { createJiraAdapter } from '../../../../../packages/luca-framework/src/adapters/jira-adapter';

// -- Env cleanup --

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

describe('Jira checkConfig() format validation', () => {
  afterEach(() => {
    restoreEnv();
  });

  test('accepts valid HTTPS URL, email, and non-empty token', async () => {
    cleanEnv();
    // We can't test full success without a fetch mock, but we can verify
    // that config validation passes by checking the error is NOT a config error
    const adapter = createJiraAdapter({
      baseUrl: 'https://mycompany.atlassian.net',
      userEmail: 'user@example.com',
      apiToken: 'valid-token-123',
    });

    // getTicket will fail with a network error (no fetch mock), NOT a config error
    const result = await adapter.getTicket('TEST-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should NOT be a config validation error
      expect(result.error).not.toContain('Jira not configured');
      expect(result.error).not.toContain('Jira config validation failed');
    }
  });

  test('rejects HTTP (non-HTTPS) base URL', async () => {
    cleanEnv();
    const adapter = createJiraAdapter({
      baseUrl: 'http://insecure.atlassian.net',
      userEmail: 'user@example.com',
      apiToken: 'valid-token',
    });

    const result = await adapter.getTicket('TEST-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Jira config validation failed');
      expect(result.error).toContain('HTTPS');
    }
  });

  test('rejects malformed URL for base URL', async () => {
    cleanEnv();
    const adapter = createJiraAdapter({
      baseUrl: 'not-a-url',
      userEmail: 'user@example.com',
      apiToken: 'valid-token',
    });

    const result = await adapter.getTicket('TEST-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Jira config validation failed');
    }
  });

  test('rejects invalid email format', async () => {
    cleanEnv();
    const adapter = createJiraAdapter({
      baseUrl: 'https://mycompany.atlassian.net',
      userEmail: 'not-an-email',
      apiToken: 'valid-token',
    });

    const result = await adapter.getTicket('TEST-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Jira config validation failed');
      expect(result.error).toContain('email');
    }
  });

  test('reports multiple format errors at once', async () => {
    cleanEnv();
    const adapter = createJiraAdapter({
      baseUrl: 'http://insecure.net',
      userEmail: 'bad-email',
      apiToken: 'valid-token',
    });

    const result = await adapter.getTicket('TEST-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Jira config validation failed');
      // Should contain both HTTPS and email errors separated by semicolon
      expect(result.error).toContain('HTTPS');
      expect(result.error).toContain('email');
    }
  });

  test('presence check runs before format validation', async () => {
    cleanEnv();
    const adapter = createJiraAdapter({});

    const result = await adapter.getTicket('TEST-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should get the presence error, not format error
      expect(result.error).toContain('Jira not configured');
      expect(result.error).toContain('Missing');
    }
  });

  test('validate() also uses format validation', async () => {
    cleanEnv();
    const adapter = createJiraAdapter({
      baseUrl: 'http://insecure.atlassian.net',
      userEmail: 'user@example.com',
      apiToken: 'valid-token',
    });

    const result = await adapter.validate!();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Jira config validation failed');
      expect(result.error).toContain('HTTPS');
    }
  });

  test('accepts URL with path segments', async () => {
    cleanEnv();
    const adapter = createJiraAdapter({
      baseUrl: 'https://mycompany.atlassian.net/jira',
      userEmail: 'user@example.com',
      apiToken: 'valid-token',
    });

    const result = await adapter.getTicket('TEST-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should NOT be a config validation error (URL with path is valid)
      expect(result.error).not.toContain('Jira config validation failed');
    }
  });
});
