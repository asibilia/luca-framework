import { defineCommand, runMain } from 'citty';
import * as p from '@clack/prompts';
import { logger } from '../utils/logger';
import { detectProjectContext } from '../utils/detect';
import { runWizard, createConfigFromArgs, loadConfigFromFile } from '../utils/wizard';
import { generateFiles, setupCleanupHandler } from '../utils/files';
import type { LucaConfig } from '../types';

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize a new Luca project',
  },
  args: {
    quick: {
      type: 'boolean',
      description: 'Skip interactive prompts, use defaults',
      default: false,
      alias: 'q',
    },
    config: {
      type: 'string',
      description: 'Path to config file for non-interactive mode',
      alias: 'c',
    },
    name: {
      type: 'string',
      description: 'Framework name (default: Luca)',
    },
    prefix: {
      type: 'string',
      description: 'Command prefix (default: lu)',
    },
    stack: {
      type: 'string',
      description: 'Stack template (react-ts, custom)',
    },
    tracker: {
      type: 'string',
      description: 'Work tracker (jira, github, none)',
    },
  },
  async run({ args }) {
    // Setup cleanup handler for SIGINT
    setupCleanupHandler();

    // Detect project context
    const context = await detectProjectContext();

    // Check for existing installation
    if (context.hasLuca) {
      logger.error('Luca is already installed in this project.');
      logger.info('Run `npx luca update` to update to the latest version.');
      process.exit(1);
    }

    let config: LucaConfig;

    // Determine mode and get config
    if (args.config) {
      // Config file mode
      logger.info(`Reading config from ${args.config}`);
      try {
        config = await loadConfigFromFile(args.config);
      } catch (error) {
        logger.error(`Failed to read config file: ${error}`);
        process.exit(1);
      }
    } else if (args.quick || args.name || args.prefix || args.stack || args.tracker) {
      // Quick mode or explicit args
      logger.info('Using provided arguments / defaults');
      config = createConfigFromArgs({
        name: args.name,
        prefix: args.prefix,
        stack: args.stack,
        tracker: args.tracker,
      });
    } else {
      // Interactive mode
      const wizardResult = await runWizard(context);
      if (!wizardResult) {
        process.exit(0);
      }
      config = wizardResult;
    }

    // Generate files
    const result = await generateFiles({ config });

    if (!result.success) {
      logger.error('Installation failed');
      process.exit(1);
    }

    // Success output
    p.outro(`✅ ${config.branding.frameworkName} initialized!`);

    logger.box(`
Next steps:

1. Review .planning/BRAIN.md and customize for your project
2. Run /${config.branding.commandPrefix} to get started
3. Use /${config.branding.commandPrefix}-help for command reference

Files created:
- .planning/config.json (workflow configuration)
- .planning/BRAIN.md (project identity)
- .planning/manifest.json (installation tracking)
- .cursor/luca/ (framework files)
    `);
  },
});

/**
 * Run init command directly (used by create-luca)
 */
export const runInit = () => runMain(initCommand);
