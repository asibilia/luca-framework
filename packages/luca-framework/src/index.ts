import { defineCommand, runMain as cittyRunMain } from 'citty';
import { initCommand, runInit } from './commands/init';
import { updateCommand } from './commands/update';
import doctorCommand from './commands/doctor';
import { checkForUpdates } from './utils/version-check';

const main = defineCommand({
  meta: {
    name: 'luca',
    version: '0.0.1',
    description: 'Luca - Agentic development framework for Cursor IDE',
  },
  subCommands: {
    init: initCommand,
    update: updateCommand,
    doctor: doctorCommand,
  },
});

export const runMain = () => {
  // Non-blocking version check runs in background
  checkForUpdates();
  return cittyRunMain(main);
};

export { runInit };

// Re-export types for consumers
export type { ProjectContext, BrandingConfig, LucaConfig, LucaManifest, FileComparison, ApprovalConfig } from './types';
