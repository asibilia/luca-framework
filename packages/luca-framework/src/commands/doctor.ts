import { defineCommand } from 'citty';
import { executeDoctor } from '../utils/doctor';

export default defineCommand({
  meta: {
    name: 'doctor',
    description: 'Run environment diagnostics and health checks',
  },
  args: {
    verbose: {
      type: 'boolean',
      description: 'Show detailed check information',
      alias: 'v',
      default: false,
    },
  },
  async run() {
    const exitCode = await executeDoctor();
    process.exit(exitCode);
  },
});
