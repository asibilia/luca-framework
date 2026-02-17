import * as p from "@clack/prompts";
import { logger } from "./logger";
import { detectProjectContext, formatStack } from "./detect";
import {
  validateBrandingField,
  validateBranding,
  defaultBranding,
  mergeBranding,
} from "./branding";
import type { LucaConfig, BrandingConfig, ProjectContext } from "../types";
import { readFile } from "fs/promises";
import { sanitizeJsonParse } from "./sanitize";

/**
 * Run the interactive setup wizard.
 *
 * Guides users through branding, stack, and work tracker selection
 * with beautiful @clack/prompts UI. Respects detected project context.
 *
 * @param context - Detected project context from detectProjectContext()
 * @returns Complete LucaConfig ready for file generation, or null if cancelled
 *
 * @example
 * ```typescript
 * const context = await detectProjectContext();
 * const config = await runWizard(context);
 * if (config) {
 *   await generateFiles({ config });
 * }
 * ```
 */
export async function runWizard(
  context: ProjectContext,
): Promise<LucaConfig | null> {
  p.intro("🚀 Welcome to Luca");

  // Show detected context
  if (context.hasPackageJson) {
    p.note(
      `Detected: ${context.projectName || "project"}\nStack: ${formatStack(context.detectedStack)}`,
      "Project Context",
    );
  }

  // Group 1: Branding (early per CONTEXT.md)
  const branding = await p.group(
    {
      frameworkName: () =>
        p.text({
          message: "What should we call your assistant?",
          placeholder: defaultBranding.frameworkName,
          defaultValue: defaultBranding.frameworkName,
          validate: (value) => {
            const result = validateBrandingField("frameworkName", value ?? "");
            return result.valid ? undefined : result.error;
          },
        }),
      commandPrefix: () =>
        p.text({
          message: "Command prefix for skills?",
          placeholder: defaultBranding.commandPrefix,
          defaultValue: defaultBranding.commandPrefix,
          validate: (value) => {
            const result = validateBrandingField("commandPrefix", value ?? "");
            return result.valid ? undefined : result.error;
          },
        }),
      ticketPattern: () =>
        p.text({
          message: "Ticket ID pattern (regex)?",
          placeholder: defaultBranding.ticketPattern,
          defaultValue: defaultBranding.ticketPattern,
          validate: (value) => {
            const result = validateBrandingField("ticketPattern", value ?? "");
            return result.valid ? undefined : result.error;
          },
        }),
      placeholderTicket: () =>
        p.text({
          message: "Placeholder ticket ID for untracked work?",
          placeholder: defaultBranding.placeholderTicket,
          defaultValue: defaultBranding.placeholderTicket,
          validate: (value) => {
            const result = validateBrandingField(
              "placeholderTicket",
              value ?? "",
            );
            return result.valid ? undefined : result.error;
          },
        }),
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    },
  );

  if (!branding) return null;

  // Group 2: Stack selection
  const detectedStack =
    context.detectedStack !== "unknown" ? context.detectedStack : undefined;
  const stack = await p.select({
    message: "Select your stack template",
    options: [
      {
        value: "react-ts",
        label: "React + TypeScript",
        hint: detectedStack?.includes("react") ? "(detected)" : undefined,
      },
      {
        value: "custom",
        label: "Custom (minimal base files only)",
      },
    ],
    initialValue: detectedStack?.includes("react") ? "react-ts" : "custom",
  });

  if (p.isCancel(stack)) {
    p.cancel("Setup cancelled.");
    return null;
  }

  // Group 3: Work tracker
  const workTracker = await p.select({
    message: "Which work tracker do you use?",
    options: [
      { value: "jira", label: "Jira" },
      { value: "github", label: "GitHub Issues" },
      { value: "none", label: "None / Placeholder tickets" },
    ],
  });

  if (p.isCancel(workTracker)) {
    p.cancel("Setup cancelled.");
    return null;
  }

  // Confirmation summary
  const confirmed = await p.confirm({
    message: `Create ${branding.frameworkName} project with /${branding.commandPrefix} commands?`,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Setup cancelled.");
    return null;
  }

  return {
    branding: branding as BrandingConfig,
    stack: stack as string,
    workTracker: workTracker as "jira" | "github" | "none",
  };
}

/**
 * Create config from CLI arguments (quick mode or explicit args).
 *
 * Merges provided arguments with defaults for any missing fields.
 *
 * @param args - CLI arguments (name, prefix, stack, tracker)
 * @returns Complete LucaConfig
 *
 * @example
 * ```typescript
 * // Quick mode with defaults
 * const config = createConfigFromArgs({});
 *
 * // Explicit values
 * const config = createConfigFromArgs({
 *   name: 'MyBot',
 *   prefix: 'mb',
 *   stack: 'react-ts',
 *   tracker: 'github'
 * });
 * ```
 */
export const VALID_STACKS = ["react-ts", "custom"] as const;
export const VALID_TRACKERS = ["jira", "github", "none"] as const;

export function createConfigFromArgs(args: {
  name?: string;
  prefix?: string;
  stack?: string;
  tracker?: string;
}): LucaConfig {
  // Validate provided branding fields before merging with defaults
  const providedBranding: Record<string, string> = {};
  if (args.name) providedBranding.frameworkName = args.name;
  if (args.prefix) providedBranding.commandPrefix = args.prefix;

  const validation = validateBranding(providedBranding);
  if (!validation.valid) {
    const errorMessages = Object.entries(validation.errors)
      .map(([field, error]) => `${field}: ${error}`)
      .join("; ");
    throw new Error(`Invalid branding arguments: ${errorMessages}`);
  }

  // Validate --stack argument
  if (
    args.stack &&
    !VALID_STACKS.includes(args.stack as (typeof VALID_STACKS)[number])
  ) {
    throw new Error(
      `Invalid --stack value "${args.stack}". Valid options: ${VALID_STACKS.join(", ")}`,
    );
  }

  // Validate --tracker argument
  if (
    args.tracker &&
    !VALID_TRACKERS.includes(args.tracker as (typeof VALID_TRACKERS)[number])
  ) {
    throw new Error(
      `Invalid --tracker value "${args.tracker}". Valid options: ${VALID_TRACKERS.join(", ")}`,
    );
  }

  return {
    branding: mergeBranding({
      frameworkName: args.name,
      commandPrefix: args.prefix,
    }),
    stack: args.stack || "custom",
    workTracker: (args.tracker as "jira" | "github" | "none") || "none",
  };
}

/**
 * Load config from JSON file (non-interactive mode).
 *
 * Reads configuration from a JSON file and merges with defaults.
 * Useful for CI/CD or scripted installations.
 *
 * @param configPath - Path to JSON configuration file
 * @returns Complete LucaConfig
 * @throws Error if file cannot be read or parsed
 *
 * @example
 * ```typescript
 * const config = await loadConfigFromFile('./luca.config.json');
 * ```
 *
 * @example Config file format:
 * ```json
 * {
 *   "branding": {
 *     "frameworkName": "MyBot",
 *     "commandPrefix": "mb"
 *   },
 *   "stack": "react-ts",
 *   "workTracker": "github"
 * }
 * ```
 */
export async function loadConfigFromFile(
  configPath: string,
): Promise<LucaConfig> {
  const content = await readFile(configPath, "utf-8");
  const parsed = sanitizeJsonParse(content) as Record<string, unknown>;

  // Validate branding fields from config file
  const brandingInput = (parsed.branding || {}) as Record<string, string>;
  const validation = validateBranding(brandingInput);
  if (!validation.valid) {
    const errorMessages = Object.entries(validation.errors)
      .map(([field, error]) => `${field}: ${error}`)
      .join("; ");
    throw new Error(`Invalid branding in config file: ${errorMessages}`);
  }

  // Validate stack and workTracker values (same rules as createConfigFromArgs)
  const stack = (parsed.stack as string) || "custom";
  if (!VALID_STACKS.includes(stack as (typeof VALID_STACKS)[number])) {
    throw new Error(
      `Invalid stack in config file "${stack}". Valid options: ${VALID_STACKS.join(", ")}`,
    );
  }

  const workTracker = (parsed.workTracker as string) || "none";
  if (
    !VALID_TRACKERS.includes(workTracker as (typeof VALID_TRACKERS)[number])
  ) {
    throw new Error(
      `Invalid workTracker in config file "${workTracker}". Valid options: ${VALID_TRACKERS.join(", ")}`,
    );
  }

  return {
    branding: mergeBranding(brandingInput),
    stack,
    workTracker: workTracker as "jira" | "github" | "none",
  };
}
