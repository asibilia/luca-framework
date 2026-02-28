import * as p from "@clack/prompts";
import { logger } from "./logger";
import { detectProjectContext, formatStack } from "./detect";
import {
  validateBrandingField,
  validateBranding,
  defaultBranding,
  mergeBranding,
} from "./branding";
import type {
  LucaConfig,
  BrandingConfig,
  ProjectContext,
  HarnessId,
} from "../types";
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

  // Group 2.5: Harness selection
  const harnesses = await p.multiselect({
    message: "Which AI harness platforms do you use?",
    options: [
      { value: "claude", label: "Claude Code", hint: "(.claude/ directory)" },
      { value: "cursor", label: "Cursor IDE", hint: "(.cursor/ directory)" },
      { value: "pi", label: "Pi", hint: "(.pi/ directory)" },
    ],
    initialValues: ["claude", "cursor"],
    required: true,
  });

  if (p.isCancel(harnesses)) {
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
    harnesses: harnesses as HarnessId[],
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
export const VALID_HARNESSES: readonly HarnessId[] = [
  "claude",
  "cursor",
  "pi",
] as const;

/** Default harnesses when none specified (backward compat) */
export const DEFAULT_HARNESSES: HarnessId[] = ["claude", "cursor"];

export function createConfigFromArgs(args: {
  name?: string;
  prefix?: string;
  stack?: string;
  tracker?: string;
  harness?: string;
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

  // Parse and validate --harness argument (comma-separated)
  let harnesses: HarnessId[] = DEFAULT_HARNESSES;
  if (args.harness) {
    const parsed = args.harness.split(",").map((h) => h.trim()) as HarnessId[];
    const invalid = parsed.filter(
      (h) => !VALID_HARNESSES.includes(h as HarnessId),
    );
    if (invalid.length > 0) {
      throw new Error(
        `Invalid --harness value "${invalid.join(", ")}". Valid options: ${VALID_HARNESSES.join(", ")}`,
      );
    }
    harnesses = parsed;
  }

  return {
    branding: mergeBranding({
      frameworkName: args.name,
      commandPrefix: args.prefix,
    }),
    stack: args.stack || "custom",
    workTracker: (args.tracker as "jira" | "github" | "none") || "none",
    harnesses,
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
  const content = await Bun.file(configPath).text();
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

  // Parse and validate harnesses (default to ['claude', 'cursor'])
  let harnesses: HarnessId[] = DEFAULT_HARNESSES;
  if (Array.isArray(parsed.harnesses)) {
    const invalid = (parsed.harnesses as string[]).filter(
      (h) => !VALID_HARNESSES.includes(h as HarnessId),
    );
    if (invalid.length > 0) {
      throw new Error(
        `Invalid harnesses in config file: "${invalid.join(", ")}". Valid options: ${VALID_HARNESSES.join(", ")}`,
      );
    }
    harnesses = parsed.harnesses as HarnessId[];
  }

  return {
    branding: mergeBranding(brandingInput),
    stack,
    workTracker: workTracker as "jira" | "github" | "none",
    harnesses,
  };
}
