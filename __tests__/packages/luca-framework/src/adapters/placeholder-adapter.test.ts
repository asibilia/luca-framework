/**
 * Placeholder Adapter Tests
 *
 * Tests for createPlaceholderAdapter() -- pure logic, no mocking needed.
 * This adapter always succeeds and returns synthetic data.
 */

import { describe, test, expect } from 'bun:test';
import { createPlaceholderAdapter } from '../../../../../packages/luca-framework/src/adapters/placeholder-adapter';

describe('PlaceholderAdapter', () => {
  // -------------------------------------------------------------------------
  // Adapter properties
  // -------------------------------------------------------------------------

  describe('adapter properties', () => {
    test('has name "none"', () => {
      const adapter = createPlaceholderAdapter();
      expect(adapter.name).toBe('none');
    });

    test('does not implement createBranch', () => {
      const adapter = createPlaceholderAdapter();
      expect(adapter.createBranch).toBeUndefined();
    });

    test('does not implement linkPR', () => {
      const adapter = createPlaceholderAdapter();
      expect(adapter.linkPR).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getTicket
  // -------------------------------------------------------------------------

  describe('getTicket', () => {
    test('returns synthetic ticket with provided ticketId', async () => {
      const adapter = createPlaceholderAdapter();
      const result = await adapter.getTicket('TEST-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('TEST-123');
        expect(result.data.title).toBe('Untracked work');
        expect(result.data.description).toBe('This work is not linked to a tracking system.');
        expect(result.data.type).toBe('task');
        expect(result.data.status).toBe('In Progress');
        expect(result.data.priority).toBe('medium');
        expect(result.data.assignee).toBeUndefined();
        expect(result.data.url).toBe('');
      }
    });

    test('uses default placeholder ticket when ticketId is empty string', async () => {
      const adapter = createPlaceholderAdapter();
      const result = await adapter.getTicket('');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('PROJ-0000');
      }
    });

    test('uses custom placeholder ticket from config when ticketId is empty', async () => {
      const adapter = createPlaceholderAdapter({ placeholderTicket: 'MYPROJ-0000' });
      const result = await adapter.getTicket('');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('MYPROJ-0000');
      }
    });

    test('prefers provided ticketId over custom placeholder', async () => {
      const adapter = createPlaceholderAdapter({ placeholderTicket: 'MYPROJ-0000' });
      const result = await adapter.getTicket('OTHER-456');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('OTHER-456');
      }
    });

    test('never returns an error', async () => {
      const adapter = createPlaceholderAdapter();

      // Even with unusual input, the adapter always succeeds
      const result1 = await adapter.getTicket('');
      const result2 = await adapter.getTicket('anything-at-all');
      const result3 = await adapter.getTicket('!@#$%^&*()');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // validate
  // -------------------------------------------------------------------------

  describe('validate', () => {
    test('always returns success with true', async () => {
      const adapter = createPlaceholderAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    test('succeeds regardless of config', async () => {
      const adapter = createPlaceholderAdapter({ placeholderTicket: 'CUSTOM-000' });
      const result = await adapter.validate!();

      expect(result.success).toBe(true);
    });
  });
});
