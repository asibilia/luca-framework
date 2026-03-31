#!/usr/bin/env bun

/**
 * Branding utilities for the build pipeline.
 *
 * Re-exports canonical branding helpers from the luca-framework package
 * and provides `loadBrandingContext()` — the single shared function that
 * both `build-deploy.ts` and `check-drift.ts` use to resolve branding
 * from `.planning/config.json`.
 *
 * @module branding
 */

import path from "path";

import { sanitizeJsonParse } from "./sanitize";

import type { BrandingContext } from "./resolve-templates";

export {
  defaultBranding,
  validateBranding,
  validateBrandingField,
} from "../packages/luca-framework/src/utils/branding";

export type { BrandingConfig } from "../packages/luca-framework/src/types";

// Re-import for use within this module
import {
  defaultBranding,
  validateBranding,
} from "../packages/luca-framework/src/utils/branding";

/**
 * Read branding config from `.planning/config.json` and compute derived values.
 *
 * Falls back to Luca defaults if the config file is missing or malformed.
 *
 * @param projectDir - Absolute path to the project root directory
 * @returns Complete BrandingContext ready for template resolution
 *
 * @example
 * ```typescript
 * import { loadBrandingContext } from "./branding";
 * import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";
 *
 * const branding = await loadBrandingContext(resolvePackageRoot());
 * ```
 */
export async function loadBrandingContext(
  projectDir: string,
): Promise<BrandingContext> {
  const configPath = path.join(projectDir, ".planning", "config.json");

  let frameworkName = defaultBranding.frameworkName;
  let commandPrefix = defaultBranding.commandPrefix;
  let ticketPattern = defaultBranding.ticketPattern;
  let placeholderTicket = defaultBranding.placeholderTicket;

  try {
    const configFile = Bun.file(configPath);
    if (await configFile.exists()) {
      const raw = sanitizeJsonParse(await configFile.text()) as Record<
        string,
        unknown
      >;
      const branding = (raw as Record<string, unknown>)?.branding as
        | Record<string, string>
        | undefined;
      if (branding) {
        frameworkName = branding.frameworkName ?? frameworkName;
        commandPrefix = branding.commandPrefix ?? commandPrefix;
        ticketPattern = branding.ticketPattern ?? ticketPattern;
        placeholderTicket = branding.placeholderTicket ?? placeholderTicket;
      }
    }
  } catch {
    console.warn(
      "Warning: Could not read .planning/config.json, using default branding",
    );
  }

  // Validate resolved branding values (non-blocking: warn + continue on failure)
  const validationResult = validateBranding({
    frameworkName,
    commandPrefix,
    ticketPattern,
    placeholderTicket,
  });
  if (!validationResult.valid) {
    console.warn(
      "Warning: Branding validation failed, continuing with current values:",
    );
    for (const [field, message] of Object.entries(validationResult.errors)) {
      console.warn(`  ${field}: ${message}`);
    }
  }

  return {
    frameworkName,
    commandPrefix,
    commandSlash: `/${commandPrefix}`,
    nameLowercase: frameworkName.toLowerCase(),
    nameUppercase: frameworkName.toUpperCase(),
    ticketPattern,
    placeholderTicket,
    ticketPatternJson: ticketPattern.replace(/\\/g, "\\\\"),
  };
}
