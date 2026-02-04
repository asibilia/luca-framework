import { defineCommand, runMain as cittyRunMain } from 'citty';
import { initCommand, runInit } from './commands/init';

const main = defineCommand({
  meta: {
    name: 'luca',
    version: '0.0.1',
    description: 'Luca - Agentic development framework for Cursor IDE',
  },
  subCommands: {
    init: initCommand,
  },
});

export const runMain = () => cittyRunMain(main);
export { runInit };

// Re-export types for consumers
export type { ProjectContext, BrandingConfig, LucaConfig, LucaManifest } from './types';
