import { describe, test, expect } from 'bun:test';

describe('logger', () => {
  test('logger module exports all expected methods', async () => {
    const { logger } = await import(
      '../../../../../packages/luca-framework/src/utils/logger'
    );
    expect(logger).toBeDefined();
    expect(typeof logger.start).toBe('function');
    expect(typeof logger.success).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.box).toBe('function');
    expect(typeof logger.step).toBe('function');
  });

  test('logger methods do not throw when called', async () => {
    const { logger } = await import(
      '../../../../../packages/luca-framework/src/utils/logger'
    );
    expect(() => logger.info('test info')).not.toThrow();
    expect(() => logger.debug('test debug')).not.toThrow();
    expect(() => logger.warn('test warn')).not.toThrow();
    expect(() => logger.step(1, 3, 'test step')).not.toThrow();
  });

  test('exports log and consola', async () => {
    const mod = await import(
      '../../../../../packages/luca-framework/src/utils/logger'
    );
    expect(mod.log).toBeDefined();
    expect(mod.consola).toBeDefined();
  });
});
