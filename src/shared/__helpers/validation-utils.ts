/**
 * Utility functions for validating configurations with Zod schemas
 * and secure JSON parsing with prototype pollution protection.
 */
import { AgentConfigSchema } from "~/agents/__schemas/agent.schemas";
import { SkillConfigSchema } from "~/skills/__schemas/skill.schemas";
import { RuleConfigSchema } from "~/rules/__schemas/rule.schemas";

import type { AgentConfig } from "~/agents/__schemas/agent.schemas";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";
import type { RuleConfig } from "~/rules/__schemas/rule.schemas";
import type { Result } from "../__schemas/shared.schemas";

// ---------------------------------------------------------------------------
// Prototype Pollution Protection
// ---------------------------------------------------------------------------

/** Keys that can be exploited for prototype pollution attacks */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively strip prototype pollution keys from a parsed JSON value.
 *
 * Removes `__proto__`, `constructor`, and `prototype` keys from objects
 * at any nesting depth. Arrays are traversed and each element is sanitized.
 * Primitive values are returned as-is.
 *
 * @param obj - The value to sanitize (any JSON-compatible value)
 * @returns A new value with dangerous keys removed
 */
function stripPrototypeKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(stripPrototypeKeys);
  }

  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (!DANGEROUS_KEYS.has(key)) {
      cleaned[key] = stripPrototypeKeys((obj as Record<string, unknown>)[key]);
    }
  }
  return cleaned;
}

/**
 * Parse JSON and strip prototype pollution keys.
 *
 * Combines `JSON.parse` with recursive removal of `__proto__`,
 * `constructor`, and `prototype` keys to prevent prototype pollution.
 * Throws on invalid JSON (same as `JSON.parse`).
 *
 * @param json - The JSON string to parse
 * @returns Parsed and sanitized value
 * @throws {SyntaxError} If the input is not valid JSON
 *
 * @example
 * ```typescript
 * const data = sanitizeJsonParse('{"name": "safe", "__proto__": {"admin": true}}');
 * // data === { name: "safe" }  (__proto__ stripped)
 * ```
 */
/**
 * NOTE: This function exists in 2 copies across isolated package boundaries.
 * packages/luca-framework/ and src/ cannot cross-import by design.
 * If you modify this function, update the other copy:
 * - packages/luca-framework/src/utils/sanitize.ts
 * - src/shared/__helpers/validation-utils.ts (this file)
 */
export function sanitizeJsonParse(json: string): unknown {
  const parsed = JSON.parse(json);
  return stripPrototypeKeys(parsed);
}

/**
 * Safe wrapper around `sanitizeJsonParse` with try/catch error handling.
 *
 * Returns a result object instead of throwing, making it suitable for
 * user-facing code paths where graceful error handling is preferred.
 *
 * @param json - The JSON string to parse
 * @returns Object with `success`, optional `data`, and optional `error`
 *
 * @example
 * ```typescript
 * const result = safeSanitizeJsonParse('{"valid": true}');
 * if (result.success) {
 *   console.log(result.data); // { valid: true }
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function safeSanitizeJsonParse(json: string): Result<unknown> {
  try {
    const data = sanitizeJsonParse(json);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "JSON parse failed",
    };
  }
}

export function validateAgentConfig(config: AgentConfig): AgentConfig {
  return AgentConfigSchema.parse(config);
}

export function validateSkillConfig(config: SkillConfig): SkillConfig {
  return SkillConfigSchema.parse(config);
}

export function validateRuleConfig(config: RuleConfig): RuleConfig {
  return RuleConfigSchema.parse(config);
}

// Helper function to validate with error handling
export function safeValidateAgentConfig(
  config: AgentConfig,
): Result<AgentConfig> {
  try {
    const data = AgentConfigSchema.parse(config);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Validation failed",
    };
  }
}

export function safeValidateSkillConfig(
  config: SkillConfig,
): Result<SkillConfig> {
  try {
    const data = SkillConfigSchema.parse(config);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Validation failed",
    };
  }
}

export function safeValidateRuleConfig(config: RuleConfig): Result<RuleConfig> {
  try {
    const data = RuleConfigSchema.parse(config);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Validation failed",
    };
  }
}
