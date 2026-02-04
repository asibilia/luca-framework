import { defineCommand, runMain as cittyRunMain } from 'citty';
import consola from 'consola';

// Placeholder init command - will be expanded in Plan 02
const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize a new Luca project',
  },
  run() {
    consola.info('Init command - to be implemented');
  },
});

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
export const runInit = () => cittyRunMain(initCommand);
