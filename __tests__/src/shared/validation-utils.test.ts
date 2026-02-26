/**
 * Unit tests for validation utility functions
 *
 * Tests validateAgentConfig, validateSkillConfig, validateRuleConfig (strict),
 * and safeValidateAgentConfig, safeValidateSkillConfig, safeValidateRuleConfig (safe).
 */
import { describe, test, expect } from "bun:test";
import {
  validateAgentConfig,
  validateSkillConfig,
  validateRuleConfig,
  safeValidateAgentConfig,
  safeValidateSkillConfig,
  safeValidateRuleConfig,
} from "../../../src/shared/__helpers/validation-utils";
import {
  validAgentConfig,
  validSkillConfig,
  validRuleConfig,
} from "../../utils/fixtures";

// ---------------------------------------------------------------------------
// validateAgentConfig (2 cases)
// ---------------------------------------------------------------------------
describe("validateAgentConfig", () => {
  test("returns validated config for valid input", () => {
    const result = validateAgentConfig(validAgentConfig);
    expect(result).toEqual(validAgentConfig);
  });

  test("throws on invalid input", () => {
    expect(() => validateAgentConfig({} as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateSkillConfig (2 cases)
// ---------------------------------------------------------------------------
describe("validateSkillConfig", () => {
  test("returns validated config for valid input", () => {
    const result = validateSkillConfig(validSkillConfig);
    expect(result).toEqual(validSkillConfig);
  });

  test("throws on invalid input", () => {
    expect(() => validateSkillConfig({ frontmatter: {} } as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateRuleConfig (2 cases)
// ---------------------------------------------------------------------------
describe("validateRuleConfig", () => {
  test("returns validated config for valid input", () => {
    const result = validateRuleConfig(validRuleConfig);
    expect(result).toEqual(validRuleConfig);
  });

  test("throws on invalid input", () => {
    expect(() => validateRuleConfig({ sections: [] } as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// safeValidateAgentConfig (2 cases)
// ---------------------------------------------------------------------------
describe("safeValidateAgentConfig", () => {
  test("returns success: true with data for valid input", () => {
    const result = safeValidateAgentConfig(validAgentConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validAgentConfig);
    }
    if (!result.success) {
      expect(result.error).toBeUndefined();
    }
  });

  test("returns success: false with error for invalid input", () => {
    const result = safeValidateAgentConfig({} as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// safeValidateSkillConfig (2 cases)
// ---------------------------------------------------------------------------
describe("safeValidateSkillConfig", () => {
  test("returns success: true with data for valid input", () => {
    const result = safeValidateSkillConfig(validSkillConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validSkillConfig);
    }
    if (!result.success) {
      expect(result.error).toBeUndefined();
    }
  });

  test("returns success: false with error for invalid input", () => {
    const result = safeValidateSkillConfig({
      frontmatter: { name: 123 },
    } as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// safeValidateRuleConfig (2 cases)
// ---------------------------------------------------------------------------
describe("safeValidateRuleConfig", () => {
  test("returns success: true with data for valid input", () => {
    const result = safeValidateRuleConfig(validRuleConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validRuleConfig);
    }
    if (!result.success) {
      expect(result.error).toBeUndefined();
    }
  });

  test("returns success: false with error for invalid input", () => {
    const result = safeValidateRuleConfig({
      frontmatter: { description: 42 },
    } as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });
});
