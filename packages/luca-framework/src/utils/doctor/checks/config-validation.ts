import { join } from "pathe";
import { sanitizeJsonParse } from "../../sanitize";
import { validateBranding } from "../../branding";
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
        fixCommand: "npx luca init",
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
          fixCommand: "Delete .planning/ directory, then run: npx luca init",
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
            fixCommand: "Delete .planning/ directory, then run: npx luca init",
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
            fixCommand: "Delete .planning/ directory, then run: npx luca init",
            details: `Branding validation failed — ${errorDetails}`,
          };
        }
      }

      // Validate workTracker value
      const validTrackers = ["jira", "github", "none"];
      if (
        config.workTracker &&
        !validTrackers.includes(config.workTracker as string)
      ) {
        return {
          name: this.name,
          status: "fail",
          message: "config.json has invalid workTracker",
          fixCommand: "Delete .planning/ directory, then run: npx luca init",
          details: `workTracker must be one of: ${validTrackers.join(", ")}. Got: "${config.workTracker}"`,
        };
      }

      // Check manifest
      if (!(await Bun.file(manifestPath).exists())) {
        return {
          name: this.name,
          status: "warning",
          message: "manifest.json missing",
          fixCommand: "npx luca update",
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
        fixCommand: "Delete .planning/ directory, then run: npx luca init",
        details: isJsonEscapeError
          ? `${errorMessage}. Hint: Ensure backslashes in regex patterns are double-escaped (e.g., "[A-Z]+-\\\\d+" not "[A-Z]+-\\d+")`
          : errorMessage,
      };
    }
  },
};
