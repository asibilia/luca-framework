import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { nodeVersionCheck } from '../../../../../../../packages/luca-framework/src/utils/doctor/checks/node-version';

let originalVersion: string;

beforeEach(() => {
  originalVersion = process.version;
});

afterEach(() => {
  Object.defineProperty(process, 'version', {
    value: originalVersion,
    writable: true,
    configurable: true,
  });
});

function setNodeVersion(version: string) {
  Object.defineProperty(process, 'version', {
    value: version,
    writable: true,
    configurable: true,
  });
}

describe('nodeVersionCheck', () => {
  test('Node 22 passes', async () => {
    setNodeVersion('v22.0.0');
    const result = await nodeVersionCheck.run();
    expect(result.status).toBe('pass');
    expect(result.message).toContain('v22.0.0');
    expect(result.fixCommand).toBeNull();
  });

  test('Node 20 passes', async () => {
    setNodeVersion('v20.11.0');
    const result = await nodeVersionCheck.run();
    expect(result.status).toBe('pass');
  });

  test('Node 18 passes (boundary)', async () => {
    setNodeVersion('v18.0.0');
    const result = await nodeVersionCheck.run();
    expect(result.status).toBe('pass');
  });

  test('Node 16 fails', async () => {
    setNodeVersion('v16.20.2');
    const result = await nodeVersionCheck.run();
    expect(result.status).toBe('fail');
    expect(result.message).toContain('v16.20.2');
    expect(result.fixCommand).toBeTypeOf('string');
    expect(result.details).toContain('18 or later');
  });

  test('Node 14 fails', async () => {
    setNodeVersion('v14.0.0');
    const result = await nodeVersionCheck.run();
    expect(result.status).toBe('fail');
  });

  test('result name is "Node.js Version"', async () => {
    const result = await nodeVersionCheck.run();
    expect(result.name).toBe('Node.js Version');
  });
});
