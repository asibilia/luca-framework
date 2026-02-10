import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'pathe';
import { sanitizeJsonParse } from '../../sanitize';
import type { CheckResult, DoctorCheck } from '../types';

export const configValidationCheck: DoctorCheck = {
  name: 'Config Validation',

  async run(): Promise<CheckResult> {
    const cwd = process.cwd();
    const configPath = join(cwd, '.planning', 'config.json');
    const manifestPath = join(cwd, '.planning', 'manifest.json');

    if (!existsSync(configPath)) {
      return {
        name: this.name,
        status: 'fail',
        message: 'config.json missing',
        fixCommand: 'npx luca init',
        details: 'Luca configuration file not found in .planning/',
      };
    }

    try {
      const configContent = await readFile(configPath, 'utf-8');
      const config = sanitizeJsonParse(configContent) as Record<string, unknown>;

      // Basic validation
      const requiredFields = ['branding', 'stack', 'workTracker'];
      const missingFields = requiredFields.filter(f => !config[f]);

      if (missingFields.length > 0) {
        return {
          name: this.name,
          status: 'fail',
          message: 'config.json invalid',
          fixCommand: 'npx luca init --force',
          details: `Missing required fields: ${missingFields.join(', ')}`,
        };
      }

      // Check manifest
      if (!existsSync(manifestPath)) {
        return {
          name: this.name,
          status: 'warning',
          message: 'manifest.json missing',
          fixCommand: 'npx luca update --repair',
          details: 'Manifest file missing. Updates may not be safe.',
        };
      }

      return {
        name: this.name,
        status: 'pass',
        message: 'Configuration is valid',
        fixCommand: null,
        details: `Stack: ${config.stack}, Tracker: ${config.workTracker}`,
      };
    } catch (error) {
      return {
        name: this.name,
        status: 'fail',
        message: 'config.json unreadable',
        fixCommand: 'npx luca init --force',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
