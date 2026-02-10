import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import {
  existsSync as _existsSync,
  statSync as _statSync,
  readdirSync as _readdirSync,
  readFileSync as _readFileSync,
  writeFileSync as _writeFileSync,
  mkdirSync as _mkdirSync,
  rmSync as _rmSync,
  createReadStream as _createReadStream,
  createWriteStream as _createWriteStream,
} from 'fs';
import {
  readFile as _readFile,
  writeFile as _writeFile,
  mkdir as _mkdir,
  rm as _rm,
  cp as _cp,
  readdir as _readdir,
  mkdtemp as _mkdtemp,
  stat as _stat,
} from 'fs/promises';
import type { LucaManifest, FileComparison } from '../../../../../packages/luca-framework/src/types';
import { validLucaManifest, validBrandingConfig } from '../../../../utils/fixtures';

// ---------------------------------------------------------------------------
// Sentinel error thrown by the mocked process.exit so execution halts
// ---------------------------------------------------------------------------

class ProcessExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExitError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------

let mockReadManifest: ReturnType<typeof mock>;
let mockWriteManifest: ReturnType<typeof mock>;
let mockCompareFiles: ReturnType<typeof mock>;
let mockHashContent: ReturnType<typeof mock>;
let mockGetTemplatesDir: ReturnType<typeof mock>;
let mockProcessTemplate: ReturnType<typeof mock>;
let mockProcessFilename: ReturnType<typeof mock>;
let mockCreateBrandingContext: ReturnType<typeof mock>;
let mockLogger: Record<string, ReturnType<typeof mock>>;
let mockOutro: ReturnType<typeof mock>;
let mockCancel: ReturnType<typeof mock>;
let mockSpinnerStart: ReturnType<typeof mock>;
let mockSpinnerStop: ReturnType<typeof mock>;
let mockSelect: ReturnType<typeof mock>;
let processExitSpy: ReturnType<typeof spyOn>;

const testManifest: LucaManifest = { ...validLucaManifest };

// Helper to build comparisons arrays
function makeComparisons(opts: {
  unchanged?: number;
  modified?: number;
  newFiles?: number;
  deleted?: number;
}): FileComparison[] {
  const comparisons: FileComparison[] = [];
  for (let i = 0; i < (opts.unchanged ?? 0); i++) {
    comparisons.push({
      path: `file-unchanged-${i}.md`,
      status: 'unchanged',
      originalHash: 'hash-a',
      currentHash: 'hash-a',
      newHash: 'hash-b',
    });
  }
  for (let i = 0; i < (opts.modified ?? 0); i++) {
    comparisons.push({
      path: `file-modified-${i}.md`,
      status: 'user-modified',
      originalHash: 'hash-a',
      currentHash: 'hash-c',
      newHash: 'hash-b',
    });
  }
  for (let i = 0; i < (opts.newFiles ?? 0); i++) {
    comparisons.push({
      path: `file-new-${i}.md`,
      status: 'new',
      originalHash: null,
      currentHash: null,
      newHash: 'hash-b',
    });
  }
  for (let i = 0; i < (opts.deleted ?? 0); i++) {
    comparisons.push({
      path: `file-deleted-${i}.md`,
      status: 'deleted',
      originalHash: 'hash-a',
      currentHash: null,
      newHash: 'hash-b',
    });
  }
  return comparisons;
}

// ---------------------------------------------------------------------------
// Setup & Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockReadManifest = mock(() => Promise.resolve(testManifest));
  mockWriteManifest = mock(() => Promise.resolve());
  mockCompareFiles = mock(() => Promise.resolve(makeComparisons({ unchanged: 2, newFiles: 1 })));
  mockHashContent = mock(() => 'mock-hash');
  mockGetTemplatesDir = mock(() => '/fake/templates');
  mockProcessTemplate = mock((content: string) => Promise.resolve(content));
  mockProcessFilename = mock((filename: string) => filename);
  mockCreateBrandingContext = mock(() => ({ branding: validBrandingConfig }));
  mockOutro = mock(() => {});
  mockCancel = mock(() => {});
  mockSpinnerStart = mock(() => {});
  mockSpinnerStop = mock(() => {});
  mockSelect = mock(async () => 'theirs');
  mockLogger = {
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    success: mock(() => {}),
    debug: mock(() => {}),
    box: mock(() => {}),
    start: mock(() => {}),
    step: mock(() => {}),
  };

  // Mock modules
  mock.module('../../../../../packages/luca-framework/src/utils/manifest', () => ({
    readManifest: mockReadManifest,
    writeManifest: mockWriteManifest,
    compareFiles: mockCompareFiles,
    hashContent: mockHashContent,
  }));

  mock.module('../../../../../packages/luca-framework/src/utils/template', () => ({
    getTemplatesDir: mockGetTemplatesDir,
    processTemplate: mockProcessTemplate,
    processFilename: mockProcessFilename,
  }));

  mock.module('../../../../../packages/luca-framework/src/utils/branding', () => ({
    createBrandingContext: mockCreateBrandingContext,
  }));

  mock.module('../../../../../packages/luca-framework/src/utils/logger', () => ({
    logger: mockLogger,
  }));

  // Mock fs modules used directly in update.ts.
  // Include captured real exports to avoid breaking other test files
  // that share the global mock scope in bun test.
  mock.module('fs/promises', () => ({
    mkdtemp: _mkdtemp,
    stat: _stat,
    readFile: mock(async () => 'template-content'),
    writeFile: mock(async () => {}),
    cp: mock(async () => {}),
    rm: mock(async () => {}),
    mkdir: mock(async () => {}),
    readdir: mock(async () => []),
  }));

  mock.module('fs', () => ({
    statSync: _statSync,
    readdirSync: _readdirSync,
    readFileSync: _readFileSync,
    writeFileSync: _writeFileSync,
    mkdirSync: _mkdirSync,
    rmSync: _rmSync,
    createReadStream: _createReadStream,
    createWriteStream: _createWriteStream,
    existsSync: mock(() => false),
  }));

  mock.module('fs-extra', () => ({
    ensureDir: mock(async () => {}),
  }));

  mock.module('@clack/prompts', () => ({
    intro: mock(() => {}),
    outro: mockOutro,
    cancel: mockCancel,
    note: mock(() => {}),
    log: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
    spinner: () => ({ start: mockSpinnerStart, stop: mockSpinnerStop }),
    isCancel: (value: unknown) => typeof value === 'symbol',
    group: mock(async () => null),
    select: mockSelect,
    confirm: mock(async () => true),
    text: mock(async () => 'default'),
  }));

  processExitSpy = spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
    throw new ProcessExitError(typeof code === 'number' ? code : 1);
  });
});

afterEach(() => {
  processExitSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Helper to run the update command
// ---------------------------------------------------------------------------

async function loadUpdateCommand() {
  const mod = await import('../../../../../packages/luca-framework/src/commands/update.ts');
  return mod.updateCommand;
}

async function runCommand(args: Record<string, unknown> = {}) {
  const cmd = await loadUpdateCommand();
  try {
    await cmd.run!({ args: args as any, rawArgs: [], cmd });
  } catch (err) {
    if (err instanceof ProcessExitError) return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('update command', () => {
  test('exits with code 1 when no manifest found (Luca not installed)', async () => {
    mockReadManifest = mock(() => Promise.resolve(null));
    mock.module('../../../../../packages/luca-framework/src/utils/manifest', () => ({
      readManifest: mockReadManifest,
      writeManifest: mockWriteManifest,
      compareFiles: mockCompareFiles,
      hashContent: mockHashContent,
    }));

    await runCommand();

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('exits with code 1 when both --accept-theirs and --accept-mine are provided', async () => {
    await runCommand({ 'accept-theirs': true, 'accept-mine': true });

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('shows dry run summary and returns without changes when --dry-run is set', async () => {
    await runCommand({ 'dry-run': true });

    // Should NOT exit (no process.exit call)
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalled();
    // writeManifest should not be called in dry-run
    expect(mockWriteManifest).not.toHaveBeenCalled();
  });

  test('returns early when nothing to update', async () => {
    mockCompareFiles = mock(() => Promise.resolve([]));
    mock.module('../../../../../packages/luca-framework/src/utils/manifest', () => ({
      readManifest: mockReadManifest,
      writeManifest: mockWriteManifest,
      compareFiles: mockCompareFiles,
      hashContent: mockHashContent,
    }));

    await runCommand();

    expect(processExitSpy).not.toHaveBeenCalled();
    // Should NOT write manifest when nothing changed
    expect(mockWriteManifest).not.toHaveBeenCalled();
  });

  test('processes update when files have changes (no conflicts)', async () => {
    // Set up comparisons with unchanged and new files only (no conflicts)
    mockCompareFiles = mock(() => Promise.resolve(makeComparisons({ unchanged: 3, newFiles: 2 })));
    mock.module('../../../../../packages/luca-framework/src/utils/manifest', () => ({
      readManifest: mockReadManifest,
      writeManifest: mockWriteManifest,
      compareFiles: mockCompareFiles,
      hashContent: mockHashContent,
    }));

    await runCommand();

    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockOutro).toHaveBeenCalled();
  });

  test('exits with code 0 when user cancels conflict resolution', async () => {
    // Set up comparisons with conflicts
    mockCompareFiles = mock(() => Promise.resolve(makeComparisons({ unchanged: 1, modified: 2 })));
    mock.module('../../../../../packages/luca-framework/src/utils/manifest', () => ({
      readManifest: mockReadManifest,
      writeManifest: mockWriteManifest,
      compareFiles: mockCompareFiles,
      hashContent: mockHashContent,
    }));

    // User selects "cancel"
    mockSelect = mock(async () => 'cancel');
    mock.module('@clack/prompts', () => ({
      intro: mock(() => {}),
      outro: mockOutro,
      cancel: mockCancel,
      note: mock(() => {}),
      log: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
      spinner: () => ({ start: mockSpinnerStart, stop: mockSpinnerStop }),
      isCancel: (value: unknown) => typeof value === 'symbol',
      group: mock(async () => null),
      select: mockSelect,
      confirm: mock(async () => true),
      text: mock(async () => 'default'),
    }));

    await runCommand();

    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  test('skips conflict prompt when --force flag is used', async () => {
    mockCompareFiles = mock(() => Promise.resolve(makeComparisons({ unchanged: 1, modified: 2 })));
    mock.module('../../../../../packages/luca-framework/src/utils/manifest', () => ({
      readManifest: mockReadManifest,
      writeManifest: mockWriteManifest,
      compareFiles: mockCompareFiles,
      hashContent: mockHashContent,
    }));

    await runCommand({ force: true });

    // Should not prompt user
    expect(mockSelect).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockOutro).toHaveBeenCalled();
  });

  test('skips conflict prompt when --accept-theirs is used', async () => {
    mockCompareFiles = mock(() => Promise.resolve(makeComparisons({ unchanged: 1, modified: 1 })));
    mock.module('../../../../../packages/luca-framework/src/utils/manifest', () => ({
      readManifest: mockReadManifest,
      writeManifest: mockWriteManifest,
      compareFiles: mockCompareFiles,
      hashContent: mockHashContent,
    }));

    await runCommand({ 'accept-theirs': true });

    expect(mockSelect).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockOutro).toHaveBeenCalled();
  });

  test('skips conflict prompt when --accept-mine is used', async () => {
    mockCompareFiles = mock(() => Promise.resolve(makeComparisons({ unchanged: 1, modified: 1 })));
    mock.module('../../../../../packages/luca-framework/src/utils/manifest', () => ({
      readManifest: mockReadManifest,
      writeManifest: mockWriteManifest,
      compareFiles: mockCompareFiles,
      hashContent: mockHashContent,
    }));

    await runCommand({ 'accept-mine': true });

    expect(mockSelect).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockOutro).toHaveBeenCalled();
  });
});
