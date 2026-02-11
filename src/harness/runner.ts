/**
 * Harness runner for the verification system.
 *
 * Reads configuration, executes checks via Bun.spawn, invokes parsers,
 * and returns structured HarnessResult. Can also be run as a standalone
 * CLI entry point.
 */

import type { HarnessConfig, HarnessResult, CheckResult, CheckConfig } from './types';
import { DEFAULT_HARNESS_CONFIG } from './types';
import { parserRegistry } from './parsers';
import { join } from 'path';

const RAW_OUTPUT_MAX_LINES = 50;

export async function loadHarnessConfig(projectDir: string): Promise<HarnessConfig> {
  const configPath = join(projectDir, '.planning', 'config.json');
  const configFile = Bun.file(configPath);

  if (await configFile.exists()) {
    try {
      const raw = await configFile.json();
      if (raw.harness) {
        return raw.harness as HarnessConfig;
      }
    } catch {
      // Invalid JSON — fall through to defaults
    }
  }

  return { ...DEFAULT_HARNESS_CONFIG };
}

async function runCheck(check: CheckConfig, projectDir: string): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const proc = Bun.spawn(['sh', '-c', check.command], {
      cwd: projectDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const timeoutMs = check.timeout * 1000;
    let timedOut = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
        reject(new Error('timeout'));
      }, timeoutMs);
      // Prevent timer from keeping the process alive in tests
      if (typeof timer === 'object' && 'unref' in timer) {
        (timer as NodeJS.Timeout).unref();
      }
    });

    let stdout = '';
    let stderr = '';
    let exitCode = 1;

    try {
      const [stdoutText, stderrText] = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]),
        timeoutPromise,
      ]);
      stdout = stdoutText;
      stderr = stderrText;
      exitCode = await proc.exited;
    } catch (e) {
      if (timedOut) {
        return {
          name: check.name,
          status: 'timeout',
          exitCode: -1,
          errors: [],
          warnings: [],
          rawOutput: `Command timed out after ${check.timeout}s`,
          duration: Date.now() - startTime,
        };
      }
      throw e;
    }

    const combinedOutput = stdout + (stderr ? '\n' + stderr : '');
    const outputLines = combinedOutput.split('\n');
    const truncatedOutput = outputLines.slice(-RAW_OUTPUT_MAX_LINES).join('\n');

    const parser = parserRegistry[check.parser] ?? parserRegistry['generic']!;
    const allParsed = parser(combinedOutput);
    const errors = allParsed.filter(e => e.severity === 'error');
    const warnings = allParsed.filter(e => e.severity === 'warning');

    return {
      name: check.name,
      status: exitCode === 0 ? 'passed' : 'failed',
      exitCode,
      errors,
      warnings,
      rawOutput: truncatedOutput,
      duration: Date.now() - startTime,
    };
  } catch (e) {
    return {
      name: check.name,
      status: 'skipped',
      exitCode: -1,
      errors: [],
      warnings: [],
      rawOutput: `Failed to execute: ${(e as Error).message}`,
      duration: Date.now() - startTime,
    };
  }
}

export async function runHarness(config: HarnessConfig, projectDir: string): Promise<HarnessResult> {
  const startTime = Date.now();
  const enabledChecks = config.checks.filter(c => c.enabled);
  const results: CheckResult[] = [];

  for (const check of enabledChecks) {
    const result = await runCheck(check, projectDir);
    results.push(result);
    if (config.failFast && result.status === 'failed') break;
  }

  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const overallStatus = results.every(r => r.status === 'passed' || r.status === 'skipped') ? 'passed' : 'failed';

  return {
    status: overallStatus,
    checks: results,
    totalErrors,
    totalWarnings,
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

// CLI entry point
if (import.meta.main) {
  const projectDir = process.argv.find(a => a.startsWith('--project-dir='))?.split('=')[1] ?? '.';
  const config = await loadHarnessConfig(projectDir);
  const result = await runHarness(config, projectDir);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'passed' ? 0 : 1);
}
