import { logger } from '../logger';
import type { CheckResult, DoctorCheck } from './types';

export async function executeDoctor(): Promise<number> {
  logger.info('Running environment diagnostics...\n');

  // Import all checks
  const { nodeVersionCheck } = await import('./checks/node-version');
  const { cursorIdeCheck } = await import('./checks/cursor-ide');
  const { configValidationCheck } = await import('./checks/config-validation');

  const checks: DoctorCheck[] = [nodeVersionCheck, cursorIdeCheck, configValidationCheck];

  // Run all checks in parallel
  const results = await Promise.all(checks.map(check => check.run()));

  // Count results
  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const warningCount = results.filter(r => r.status === 'warning').length;

  // Display results
  logger.info('Environment Diagnostics');
  logger.info('═'.repeat(50));
  
  for (const result of results) {
    const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '⚠';
    const logLine = `${icon} ${result.name}: ${result.message}`;
    
    if (result.status === 'pass') {
      logger.success(logLine);
    } else if (result.status === 'fail') {
      logger.error(logLine);
    } else {
      logger.warn(logLine);
    }
    
    if (result.details) {
      logger.info(`  ${result.details}`);
    }
  }

  logger.info('');
  logger.info('═'.repeat(50));
  logger.info(`Results: ${passCount} passing, ${failCount} failing, ${warningCount} warning(s)`);

  // Show fix suggestions for failed checks
  const failedChecks = results.filter(r => r.status === 'fail' && r.fixCommand);
  
  if (failedChecks.length > 0) {
    logger.info('');
    logger.info('Suggested fixes:');
    logger.info('─'.repeat(50));
    
    for (const check of failedChecks) {
      if (check.fixCommand) {
        logger.info(`• ${check.name}:`);
        logger.info(`  ${check.fixCommand}`);
      }
    }
  }

  logger.info('');

  // Return exit code
  if (failCount > 0) {
    logger.error('Some checks failed. Run with --verbose for more details.');
    return 1;
  }

  if (warningCount > 0) {
    logger.warn('All checks passed with warnings.');
    return 0;
  }

  logger.success('All checks passed! Your environment is ready.');
  return 0;
}
