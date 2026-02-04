import * as p from '@clack/prompts';
import { logger } from './logger';
import { detectProjectContext, formatStack } from './detect';
import { validateBrandingField, defaultBranding, mergeBranding } from './branding';
import type { LucaConfig, BrandingConfig, ProjectContext } from '../types';
import { readFile } from 'fs/promises';

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
export async function runWizard(context: ProjectContext): Promise<LucaConfig | null> {
  p.intro('🚀 Welcome to Luca');

  // Show detected context
  if (context.hasPackageJson) {
    p.note(
      `Detected: ${context.projectName || 'project'}\nStack: ${formatStack(context.detectedStack)}`,
      'Project Context'
    );
  }

  // Group 1: Branding (early per CONTEXT.md)
  const branding = await p.group(
    {
      frameworkName: () =>
        p.text({
          message: 'What should we call your assistant?',
          placeholder: defaultBranding.frameworkName,
          defaultValue: defaultBranding.frameworkName,
          validate: (value) => {
            const result = validateBrandingField('frameworkName', value);
            return result.valid ? undefined : result.error;
          },
        }),
      commandPrefix: () =>
        p.text({
          message: 'Command prefix for skills?',
          placeholder: defaultBranding.commandPrefix,
          defaultValue: defaultBranding.commandPrefix,
          validate: (value) => {
            const result = validateBrandingField('commandPrefix', value);
            return result.valid ? undefined : result.error;
          },
        }),
      ticketPattern: () =>
        p.text({
          message: 'Ticket ID pattern (regex)?',
          placeholder: defaultBranding.ticketPattern,
          defaultValue: defaultBranding.ticketPattern,
          validate: (value) => {
            const result = validateBrandingField('ticketPattern', value);
            return result.valid ? undefined : result.error;
          },
        }),
      placeholderTicket: () =>
        p.text({
          message: 'Placeholder ticket ID for untracked work?',
          placeholder: defaultBranding.placeholderTicket,
          defaultValue: defaultBranding.placeholderTicket,
          validate: (value) => {
            const result = validateBrandingField('placeholderTicket', value);
            return result.valid ? undefined : result.error;
          },
        }),
    },
    {
      onCancel: () => {
        p.cancel('Setup cancelled.');
        return null;
      },
    }
  );

  if (!branding) return null;

  // Group 2: Stack selection
  const detectedStack = context.detectedStack !== 'unknown' ? context.detectedStack : undefined;
  const stack = await p.select({
    message: 'Select your stack template',
    options: [
      {
        value: 'react-ts',
        label: 'React + TypeScript',
        hint: detectedStack?.includes('react') ? '(detected)' : undefined,
      },
      {
        value: 'custom',
        label: 'Custom (minimal base files only)',
      },
    ],
    initialValue: detectedStack?.includes('react') ? 'react-ts' : 'custom',
  });

  if (p.isCancel(stack)) {
    p.cancel('Setup cancelled.');
    return null;
  }

  // Group 3: Work tracker
  const workTracker = await p.select({
    message: 'Which work tracker do you use?',
    options: [
      { value: 'jira', label: 'Jira' },
      { value: 'github', label: 'GitHub Issues' },
      { value: 'none', label: 'None / Placeholder tickets' },
    ],
  });

  if (p.isCancel(workTracker)) {
    p.cancel('Setup cancelled.');
    return null;
  }

  // Confirmation summary
  const confirmed = await p.confirm({
    message: `Create ${branding.frameworkName} project with /${branding.commandPrefix} commands?`,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Setup cancelled.');
    return null;
  }

  return {
    branding: branding as BrandingConfig,
    stack: stack as string,
    workTracker: workTracker as 'jira' | 'github' | 'none',
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
export function createConfigFromArgs(args: {
  name?: string;
  prefix?: string;
  stack?: string;
  tracker?: string;
}): LucaConfig {
  return {
    branding: mergeBranding({
      frameworkName: args.name,
      commandPrefix: args.prefix,
    }),
    stack: args.stack || 'custom',
    workTracker: (args.tracker as 'jira' | 'github' | 'none') || 'none',
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
export async function loadConfigFromFile(configPath: string): Promise<LucaConfig> {
  const content = await readFile(configPath, 'utf-8');
  const parsed = JSON.parse(content);

  return {
    branding: mergeBranding(parsed.branding || {}),
    stack: parsed.stack || 'custom',
    workTracker: parsed.workTracker || 'none',
  };
}
