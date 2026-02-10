import { describe, test, expect } from 'bun:test';
import {
  defaultBranding,
  validateBrandingField,
  validateBranding,
  createBrandingContext,
  mergeBranding,
} from '../../../../../packages/luca-framework/src/utils/branding';
import { validBrandingConfig } from '../../../../utils/fixtures';

// ---------------------------------------------------------------------------
// defaultBranding constant
// ---------------------------------------------------------------------------

describe('defaultBranding', () => {
  test('has all required fields with expected defaults', () => {
    expect(defaultBranding).toEqual({
      frameworkName: 'Luca',
      commandPrefix: 'lu',
      ticketPattern: '[A-Z]+-\\d+',
      placeholderTicket: 'PROJ-0000',
    });
  });
});

// ---------------------------------------------------------------------------
// validateBrandingField
// ---------------------------------------------------------------------------

describe('validateBrandingField', () => {
  // -- frameworkName --

  describe('frameworkName', () => {
    test('accepts valid name starting with letter', () => {
      expect(validateBrandingField('frameworkName', 'Luca')).toEqual({ valid: true });
    });

    test('accepts name with numbers and dashes', () => {
      expect(validateBrandingField('frameworkName', 'My-Bot-2')).toEqual({ valid: true });
    });

    test('rejects empty string', () => {
      const result = validateBrandingField('frameworkName', '');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('rejects whitespace-only string', () => {
      const result = validateBrandingField('frameworkName', '   ');
      expect(result.valid).toBe(false);
    });

    test('rejects name shorter than 2 characters', () => {
      const result = validateBrandingField('frameworkName', 'A');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 2');
    });

    test('rejects name longer than 20 characters', () => {
      const result = validateBrandingField('frameworkName', 'A'.repeat(21));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at most 20');
    });

    test('rejects name starting with number', () => {
      const result = validateBrandingField('frameworkName', '1Luca');
      expect(result.valid).toBe(false);
    });

    test('rejects name with spaces', () => {
      const result = validateBrandingField('frameworkName', 'My Bot');
      expect(result.valid).toBe(false);
    });

    test('rejects name with underscores', () => {
      const result = validateBrandingField('frameworkName', 'my_bot');
      expect(result.valid).toBe(false);
    });

    test('accepts minimum length name (2 chars)', () => {
      expect(validateBrandingField('frameworkName', 'Ab')).toEqual({ valid: true });
    });

    test('accepts maximum length name (20 chars)', () => {
      expect(validateBrandingField('frameworkName', 'Abcdefghijklmnopqrst')).toEqual({ valid: true });
    });
  });

  // -- commandPrefix --

  describe('commandPrefix', () => {
    test('accepts valid lowercase prefix', () => {
      expect(validateBrandingField('commandPrefix', 'lu')).toEqual({ valid: true });
    });

    test('accepts prefix with numbers', () => {
      expect(validateBrandingField('commandPrefix', 'lu2')).toEqual({ valid: true });
    });

    test('rejects empty string', () => {
      const result = validateBrandingField('commandPrefix', '');
      expect(result.valid).toBe(false);
    });

    test('rejects prefix shorter than 2 characters', () => {
      const result = validateBrandingField('commandPrefix', 'l');
      expect(result.valid).toBe(false);
    });

    test('rejects prefix longer than 10 characters', () => {
      const result = validateBrandingField('commandPrefix', 'a'.repeat(11));
      expect(result.valid).toBe(false);
    });

    test('rejects uppercase letters', () => {
      const result = validateBrandingField('commandPrefix', 'Lu');
      expect(result.valid).toBe(false);
    });

    test('rejects prefix starting with number', () => {
      const result = validateBrandingField('commandPrefix', '2lu');
      expect(result.valid).toBe(false);
    });

    test('rejects dashes', () => {
      const result = validateBrandingField('commandPrefix', 'my-cmd');
      expect(result.valid).toBe(false);
    });
  });

  // -- ticketPattern --

  describe('ticketPattern', () => {
    test('accepts valid regex pattern', () => {
      expect(validateBrandingField('ticketPattern', '[A-Z]+-\\d+')).toEqual({ valid: true });
    });

    test('accepts simple regex', () => {
      expect(validateBrandingField('ticketPattern', '\\d+')).toEqual({ valid: true });
    });

    test('rejects invalid regex', () => {
      const result = validateBrandingField('ticketPattern', '[invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('rejects empty string', () => {
      const result = validateBrandingField('ticketPattern', '');
      expect(result.valid).toBe(false);
    });
  });

  // -- placeholderTicket --

  describe('placeholderTicket', () => {
    test('accepts valid placeholder like PROJ-0000', () => {
      expect(validateBrandingField('placeholderTicket', 'PROJ-0000')).toEqual({ valid: true });
    });

    test('accepts other valid placeholders', () => {
      expect(validateBrandingField('placeholderTicket', 'ABC-123')).toEqual({ valid: true });
    });

    test('rejects lowercase', () => {
      const result = validateBrandingField('placeholderTicket', 'proj-0000');
      expect(result.valid).toBe(false);
    });

    test('rejects empty string', () => {
      const result = validateBrandingField('placeholderTicket', '');
      expect(result.valid).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// validateBranding
// ---------------------------------------------------------------------------

describe('validateBranding', () => {
  test('returns valid for all correct fields', () => {
    const result = validateBranding(validBrandingConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test('returns valid for partial config with only valid fields', () => {
    const result = validateBranding({ frameworkName: 'TestBot' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test('returns errors for invalid fields', () => {
    const result = validateBranding({
      frameworkName: '1bad',
      commandPrefix: 'BAD',
    });
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).length).toBeGreaterThanOrEqual(2);
    expect(result.errors['frameworkName']).toBeDefined();
    expect(result.errors['commandPrefix']).toBeDefined();
  });

  test('skips undefined fields (does not validate them)', () => {
    // Only provides frameworkName, so other fields should not show as errors
    const result = validateBranding({ frameworkName: 'Good' });
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createBrandingContext
// ---------------------------------------------------------------------------

describe('createBrandingContext', () => {
  test('returns context with computed helpers for default branding', () => {
    const context = createBrandingContext(defaultBranding);
    expect(context.branding.frameworkName).toBe('Luca');
    expect(context.branding.commandPrefix).toBe('lu');
    expect(context.branding.commandSlash).toBe('/lu');
    expect(context.branding.nameUppercase).toBe('LUCA');
    expect(context.branding.nameLowercase).toBe('luca');
  });

  test('returns context with computed helpers for custom branding', () => {
    const context = createBrandingContext({
      frameworkName: 'MyBot',
      commandPrefix: 'mb',
      ticketPattern: '\\d+',
      placeholderTicket: 'TASK-001',
    });
    expect(context.branding.frameworkName).toBe('MyBot');
    expect(context.branding.commandSlash).toBe('/mb');
    expect(context.branding.nameUppercase).toBe('MYBOT');
    expect(context.branding.nameLowercase).toBe('mybot');
  });
});

// ---------------------------------------------------------------------------
// mergeBranding
// ---------------------------------------------------------------------------

describe('mergeBranding', () => {
  test('returns defaults when given empty object', () => {
    const result = mergeBranding({});
    expect(result).toEqual(defaultBranding);
  });

  test('overrides only provided fields', () => {
    const result = mergeBranding({ frameworkName: 'MyBot' });
    expect(result.frameworkName).toBe('MyBot');
    expect(result.commandPrefix).toBe(defaultBranding.commandPrefix);
    expect(result.ticketPattern).toBe(defaultBranding.ticketPattern);
    expect(result.placeholderTicket).toBe(defaultBranding.placeholderTicket);
  });

  test('overrides all fields when all provided', () => {
    const custom = {
      frameworkName: 'Custom',
      commandPrefix: 'cu',
      ticketPattern: '\\d+',
      placeholderTicket: 'CU-0000',
    };
    const result = mergeBranding(custom);
    expect(result).toEqual(custom);
  });

  test('filters out undefined values to prevent overriding defaults', () => {
    const result = mergeBranding({
      frameworkName: 'MyBot',
      commandPrefix: undefined,
    });
    expect(result.frameworkName).toBe('MyBot');
    expect(result.commandPrefix).toBe(defaultBranding.commandPrefix);
  });
});
