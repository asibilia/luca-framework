import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

let originalPlatform: string;
let originalHome: string | undefined;
let originalLocalAppData: string | undefined;

// Track which paths should "exist" in the mock
let existingPaths: Set<string>;

// Mock fs: spread real module, only override existsSync.
// Cursor paths are controlled by existingPaths set;
// all other paths fall through to real existsSync.
const realFs = require('node:fs');
mock.module('fs', () => ({
  ...realFs,
  existsSync: (path: string) => {
    if (path.includes('Cursor') || path.includes('cursor')) {
      return existingPaths.has(path);
    }
    return realFs.existsSync(path);
  },
}));

// Must import after mock.module
const { cursorIdeCheck } = await import(
  '../../../../../../../packages/luca-framework/src/utils/doctor/checks/cursor-ide'
);

beforeEach(() => {
  originalPlatform = process.platform;
  originalHome = process.env.HOME;
  originalLocalAppData = process.env.LOCALAPPDATA;
  existingPaths = new Set();
});

afterEach(() => {
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
    configurable: true,
  });
  process.env.HOME = originalHome;
  if (originalLocalAppData !== undefined) {
    process.env.LOCALAPPDATA = originalLocalAppData;
  } else {
    delete process.env.LOCALAPPDATA;
  }
});

function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

describe('cursorIdeCheck', () => {
  test('macOS with Cursor in /Applications', async () => {
    setPlatform('darwin');
    existingPaths.add('/Applications/Cursor.app');
    const result = await cursorIdeCheck.run();
    expect(result.status).toBe('pass');
    expect(result.message).toContain('detected');
    expect(result.details).toContain('Found Cursor.app');
  });

  test('macOS with Cursor in ~/Applications', async () => {
    setPlatform('darwin');
    process.env.HOME = '/Users/test';
    existingPaths.add('/Users/test/Applications/Cursor.app');
    const result = await cursorIdeCheck.run();
    expect(result.status).toBe('pass');
  });

  test('macOS without Cursor', async () => {
    setPlatform('darwin');
    process.env.HOME = '/Users/test';
    // No paths added to existingPaths
    const result = await cursorIdeCheck.run();
    expect(result.status).toBe('warning');
    expect(result.fixCommand).toContain('cursor.sh');
  });

  test('Windows with Cursor installed', async () => {
    setPlatform('win32');
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    // pathe normalizes backslashes to forward slashes
    existingPaths.add('C:/Users/test/AppData/Local/Programs/cursor/Cursor.exe');
    const result = await cursorIdeCheck.run();
    expect(result.status).toBe('pass');
  });

  test('Windows without Cursor', async () => {
    setPlatform('win32');
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    const result = await cursorIdeCheck.run();
    expect(result.status).toBe('warning');
  });

  test('Linux with Cursor in /usr/bin', async () => {
    setPlatform('linux');
    existingPaths.add('/usr/bin/cursor');
    const result = await cursorIdeCheck.run();
    expect(result.status).toBe('pass');
  });

  test('Linux without Cursor', async () => {
    setPlatform('linux');
    const result = await cursorIdeCheck.run();
    expect(result.status).toBe('warning');
  });

  test('result name is "Cursor IDE"', async () => {
    const result = await cursorIdeCheck.run();
    expect(result.name).toBe('Cursor IDE');
  });
});
