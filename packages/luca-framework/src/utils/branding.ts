import { join } from "pathe";

import type { BrandingConfig } from "../types";

import { safeSanitizeJsonParse } from "./sanitize";

/**
 * Default branding configuration - used when user skips customization.
 *
 * These values define the "Luca" brand, which is the default identity
 * for the framework when users don't customize during installation.
 */
export const defaultBranding: BrandingConfig = {
  frameworkName: "Luca",
  commandPrefix: "lu",
  ticketPattern: "[A-Z]+-\\d+",
  placeholderTicket: "PROJ-0000",
};

/**
 * Validation rules for branding fields.
 *
 * Each field has specific constraints to ensure valid, safe values
 * that work correctly in templates, filenames, and commands.
 */
const validationRules = {
  frameworkName: {
    pattern: /^[a-zA-Z][a-zA-Z0-9-]*$/,
    message:
      "Name must start with letter, contain only letters, numbers, dashes",
    minLength: 2,
    maxLength: 20,
  },
  commandPrefix: {
    pattern: /^[a-z][a-z0-9]*$/,
    message: "Prefix must be lowercase letters and numbers only",
    minLength: 2,
    maxLength: 10,
  },
  ticketPattern: {
    // Validate it's a valid regex
    isRegex: true,
    message: "Ticket pattern must be a valid regular expression",
  },
  placeholderTicket: {
    pattern: /^[A-Z]+-\d+$/,
    message: "Placeholder ticket must match pattern like PROJ-0000",
  },
} as const;

type ValidationRuleKey = keyof typeof validationRules;

/**
 * Validate a single branding field.
 *
 * @param field - The branding field to validate
 * @param value - The value to validate
 * @returns Validation result with optional error message
 *
 * @example
 * ```typescript
 * const result = validateBrandingField('frameworkName', 'MyBrand');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateBrandingField(
  field: keyof BrandingConfig,
  value: string,
): { valid: boolean; error?: string } {
  const rules = validationRules[field as ValidationRuleKey];

  if (!value || value.trim() === "") {
    return { valid: false, error: `${field} is required` };
  }

  if ("minLength" in rules && value.length < rules.minLength) {
    return {
      valid: false,
      error: `${field} must be at least ${rules.minLength} characters`,
    };
  }

  if ("maxLength" in rules && value.length > rules.maxLength) {
    return {
      valid: false,
      error: `${field} must be at most ${rules.maxLength} characters`,
    };
  }

  if ("pattern" in rules && !rules.pattern.test(value)) {
    return { valid: false, error: rules.message };
  }

  if ("isRegex" in rules) {
    try {
      new RegExp(value);
    } catch {
      return { valid: false, error: rules.message };
    }
  }

  return { valid: true };
}

/**
 * Validate complete branding configuration.
 *
 * Validates all provided fields and returns aggregated results.
 * Only validates fields that are present in the input.
 *
 * @param branding - Partial branding config to validate
 * @returns Validation result with errors object
 *
 * @example
 * ```typescript
 * const result = validateBranding({
 *   frameworkName: 'MyBrand',
 *   commandPrefix: 'mb'
 * });
 *
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateBranding(branding: Partial<BrandingConfig>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  for (const field of Object.keys(
    defaultBranding,
  ) as (keyof BrandingConfig)[]) {
    const value = branding[field];
    if (value !== undefined) {
      const result = validateBrandingField(field, value);
      if (!result.valid && result.error) {
        errors[field] = result.error;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Create template context from branding config.
 *
 * Adds computed properties useful in templates, such as
 * the slash-prefixed command and case variants.
 *
 * @param branding - Complete branding configuration
 * @returns Template context object with branding and computed helpers
 *
 * @example
 * ```typescript
 * const context = createBrandingContext(defaultBranding);
 * // context.branding.commandSlash === '/lu'
 * // context.branding.nameUppercase === 'LUCA'
 * // context.branding.nameLowercase === 'luca'
 * ```
 */
export function createBrandingContext(branding: BrandingConfig) {
  return {
    branding: {
      ...branding,
      // Computed helpers for templates
      commandSlash: `/${branding.commandPrefix}`,
      nameUppercase: branding.frameworkName.toUpperCase(),
      nameLowercase: branding.frameworkName.toLowerCase(),
      // JSON-safe ticket pattern: double-escape backslashes so the
      // rendered config.json contains valid JSON string escapes.
      ticketPatternJson: branding.ticketPattern.replace(/\\/g, "\\\\"),
    },
  };
}

/**
 * Merge user branding with defaults.
 *
 * Any missing fields are filled in from defaultBranding.
 * Undefined values are filtered out to prevent overriding defaults.
 *
 * @param userBranding - Partial user branding config
 * @returns Complete branding configuration
 *
 * @example
 * ```typescript
 * const branding = mergeBranding({ frameworkName: 'MyBrand' });
 * // Uses 'MyBrand' but defaults for commandPrefix, ticketPattern, etc.
 * ```
 */
export function mergeBranding(
  userBranding: Partial<BrandingConfig>,
): BrandingConfig {
  // Filter out undefined values to prevent overriding defaults
  const definedUserBranding = Object.fromEntries(
    Object.entries(userBranding).filter(([, value]) => value !== undefined),
  ) as Partial<BrandingConfig>;

  return {
    ...defaultBranding,
    ...definedUserBranding,
  };
}

/**
 * Read project branding from `.planning/config.json`.
 *
 * Reads the config file at the given project directory, extracts the
 * `branding` section, and merges it with defaults via `mergeBranding()`.
 * Never throws -- all error paths return `defaultBranding`.
 *
 * Follows the vault-setup.ts config-read pattern:
 * 1. Build path with `join(projectDir, '.planning', 'config.json')`
 * 2. Guard with `Bun.file(path).exists()`
 * 3. Parse with `safeSanitizeJsonParse(await file.text())`
 * 4. Extract `raw.branding` with nullish coalescing
 * 5. Return `mergeBranding(partial)`
 *
 * @param projectDir - Project root directory (defaults to `process.cwd()`)
 * @returns Complete branding configuration, merged with defaults
 *
 * @example
 * ```typescript
 * // Read branding from current project
 * const branding = await readProjectBranding();
 * console.log(branding.frameworkName); // "Luca" or custom name
 *
 * // Read branding from a specific directory
 * const branding = await readProjectBranding('/path/to/project');
 * ```
 */
export async function readProjectBranding(
  projectDir?: string,
): Promise<BrandingConfig> {
  try {
    const configPath = join(
      projectDir ?? process.cwd(),
      ".planning",
      "config.json",
    );
    const file = Bun.file(configPath);

    if (!(await file.exists())) {
      return defaultBranding;
    }

    const result = safeSanitizeJsonParse(await file.text());
    if (!result.success) {
      return defaultBranding;
    }

    const raw = result.data as Record<string, unknown>;
    const partial = (raw.branding ?? {}) as Partial<BrandingConfig>;

    return mergeBranding(partial);
  } catch {
    return defaultBranding;
  }
}
