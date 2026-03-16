import { join } from "pathe";

import { sanitizeJsonParse } from "../../sanitize";
import { validateBranding } from "../../branding";
import { VALID_TRACKERS } from "../../wizard";

import type { CheckResult, DoctorCheck } from "../types";

export const configValidationCheck: DoctorCheck = {
  name: "Config Validation",

  async run(): Promise<CheckResult> {
    const cwd = process.cwd();
    const configPath = join(cwd, ".planning", "config.json");
    const manifestPath = join(cwd, ".planning", "manifest.json");

    if (!(await Bun.file(configPath).exists())) {
      return {
        name: this.name,
        status: "fail",
        message: "config.json missing",
        fixCommand: "bunx luca init",
        details: "Luca configuration file not found in .planning/",
      };
    }

    try {
      const configContent = await Bun.file(configPath).text();
      const config = sanitizeJsonParse(configContent) as Record<
        string,
        unknown
      >;

      // Basic validation
      const requiredFields = ["branding", "stack", "workTracker"];
      const missingFields = requiredFields.filter((f) => !config[f]);

      if (missingFields.length > 0) {
        return {
          name: this.name,
          status: "fail",
          message: "config.json invalid",
          fixCommand: `Add the missing fields to .planning/config.json: ${missingFields.join(", ")}. Run 'bunx luca init' in a new project to see example values.`,
          details: `Missing required fields: ${missingFields.join(", ")}`,
        };
      }

      // Deep branding validation — check required subfields then validate values
      if (config.branding && typeof config.branding === "object") {
        const branding = config.branding as Record<string, string>;
        const requiredBrandingFields = ["frameworkName", "commandPrefix"];
        const missingBrandingFields = requiredBrandingFields.filter(
          (f) => !branding[f],
        );
        if (missingBrandingFields.length > 0) {
          return {
            name: this.name,
            status: "fail",
            message: "config.json has incomplete branding",
            fixCommand:
              "Fix the invalid fields in .planning/config.json. Run 'bunx luca init' in a new project to see example values.",
            details: `Missing required branding fields: ${missingBrandingFields.join(", ")}`,
          };
        }

        const brandingResult = validateBranding(branding);
        if (!brandingResult.valid) {
          const errorDetails = Object.entries(brandingResult.errors)
            .map(([field, error]) => `${field}: ${error}`)
            .join("; ");
          return {
            name: this.name,
            status: "fail",
            message: "config.json has invalid branding",
            fixCommand:
              "Fix the invalid fields in .planning/config.json. Run 'bunx luca init' in a new project to see example values.",
            details: `Branding validation failed — ${errorDetails}`,
          };
        }
      }

      // Validate workTracker value
      if (
        config.workTracker &&
        !VALID_TRACKERS.includes(
          config.workTracker as (typeof VALID_TRACKERS)[number],
        )
      ) {
        return {
          name: this.name,
          status: "fail",
          message: "config.json has invalid workTracker",
          fixCommand:
            "Fix the invalid fields in .planning/config.json. Run 'bunx luca init' in a new project to see example values.",
          details: `workTracker must be one of: ${VALID_TRACKERS.join(", ")}. Got: "${config.workTracker}"`,
        };
      }

      // Check manifest
      if (!(await Bun.file(manifestPath).exists())) {
        return {
          name: this.name,
          status: "warning",
          message: "manifest.json missing",
          fixCommand: "bunx luca update",
          details: "Manifest file missing. Updates may not be safe.",
        };
      }

      return {
        name: this.name,
        status: "pass",
        message: "Configuration is valid",
        fixCommand: null,
        details: `Stack: ${config.stack}, Tracker: ${config.workTracker}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const isJsonEscapeError =
        errorMessage.includes("escape") ||
        errorMessage.includes("token") ||
        errorMessage.includes("Unexpected");
      return {
        name: this.name,
        status: "fail",
        message: "config.json unreadable",
        fixCommand:
          "Fix the invalid fields in .planning/config.json. Run 'bunx luca init' in a new project to see example values.",
        details: isJsonEscapeError
          ? `${errorMessage}. Hint: Ensure backslashes in regex patterns are double-escaped (e.g., "[A-Z]+-\\\\d+" not "[A-Z]+-\\d+")`
          : errorMessage,
      };
    }
  },
};
