import { defineCommand, runMain } from 'citty';
import { logger } from '../utils/logger';
import { detectProjectContext, formatStack } from '../utils/detect';
import type { ProjectContext, LucaConfig } from '../types';

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
    logger.start('Initializing Luca...');

    // Detect project context
    const context = await detectProjectContext();

    // Check for existing installation
    if (context.hasLuca) {
      logger.error('Luca is already installed in this project.');
      logger.info('Run `npx luca update` to update to the latest version.');
      process.exit(1);
    }

    // Log detection results
    if (context.hasPackageJson) {
      logger.info(`Detected existing project: ${context.projectName || 'unnamed'}`);
      if (context.detectedStack !== 'unknown') {
        logger.info(`Detected stack: ${formatStack(context.detectedStack)}`);
      }
    } else {
      logger.info('No package.json detected - creating fresh project');
    }

    if (context.hasGit) {
      logger.info('Git repository detected');
    }

    // Placeholder for wizard (implemented in Plan 04)
    if (args.quick) {
      logger.info('Quick mode: using defaults');
      // TODO: Run file generation with defaults
    } else if (args.config) {
      logger.info(`Config mode: reading from ${args.config}`);
      // TODO: Read config file and generate
    } else {
      logger.info('Interactive wizard coming in Plan 04...');
      // TODO: Run interactive wizard
    }

    logger.success('Context detection complete');
    logger.box(`
Next: Plan 04 will implement the interactive wizard.

Detected:
- Package.json: ${context.hasPackageJson ? 'Yes' : 'No'}
- Git: ${context.hasGit ? 'Yes' : 'No'}
- Stack: ${formatStack(context.detectedStack)}
    `);
  },
});

/**
 * Run init command directly (used by create-luca)
 */
export const runInit = () => runMain(initCommand);
