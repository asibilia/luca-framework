import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import type { LucaConfig, ProjectContext } from '../../../../../packages/luca-framework/src/types';
import { validLucaConfig, validProjectContext } from '../../../../utils/fixtures';

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

let mockDetectProjectContext: ReturnType<typeof mock>;
let mockRunWizard: ReturnType<typeof mock>;
let mockCreateConfigFromArgs: ReturnType<typeof mock>;
let mockLoadConfigFromFile: ReturnType<typeof mock>;
let mockGenerateFiles: ReturnType<typeof mock>;
let mockSetupCleanupHandler: ReturnType<typeof mock>;
let mockLogger: Record<string, ReturnType<typeof mock>>;
let mockOutro: ReturnType<typeof mock>;
let mockCancel: ReturnType<typeof mock>;
let processExitSpy: ReturnType<typeof spyOn>;

// The context that detect returns by default (no Luca installed)
const freshContext: ProjectContext = { ...validProjectContext, hasLuca: false };

// The context where Luca is already installed
const installedContext: ProjectContext = { ...validProjectContext, hasLuca: true };

// A config object returned from wizard / args / file
const testConfig: LucaConfig = { ...validLucaConfig };

// ---------------------------------------------------------------------------
// Setup & Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockDetectProjectContext = mock(() => Promise.resolve(freshContext));
  mockRunWizard = mock(() => Promise.resolve(testConfig));
  mockCreateConfigFromArgs = mock(() => testConfig);
  mockLoadConfigFromFile = mock(() => Promise.resolve(testConfig));
  mockGenerateFiles = mock(() => Promise.resolve({ success: true, manifest: {} }));
  mockSetupCleanupHandler = mock(() => {});
  mockOutro = mock(() => {});
  mockCancel = mock(() => {});
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

  // Mock all modules BEFORE importing the command
  mock.module('../../../../../packages/luca-framework/src/utils/detect', () => ({
    detectProjectContext: mockDetectProjectContext,
  }));

  mock.module('../../../../../packages/luca-framework/src/utils/wizard', () => ({
    runWizard: mockRunWizard,
    createConfigFromArgs: mockCreateConfigFromArgs,
    loadConfigFromFile: mockLoadConfigFromFile,
  }));

  mock.module('../../../../../packages/luca-framework/src/utils/files', () => ({
    generateFiles: mockGenerateFiles,
    setupCleanupHandler: mockSetupCleanupHandler,
  }));

  mock.module('../../../../../packages/luca-framework/src/utils/logger', () => ({
    logger: mockLogger,
  }));

  mock.module('@clack/prompts', () => ({
    intro: mock(() => {}),
    outro: mockOutro,
    cancel: mockCancel,
    note: mock(() => {}),
    log: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
    spinner: () => ({ start: mock(() => {}), stop: mock(() => {}) }),
    isCancel: (value: unknown) => typeof value === 'symbol',
    group: mock(async () => null),
    select: mock(async () => 'default'),
    confirm: mock(async () => true),
    text: mock(async () => 'default'),
  }));

  // Mock process.exit to throw so execution halts at the call site
  processExitSpy = spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
    throw new ProcessExitError(typeof code === 'number' ? code : 1);
  });
});

afterEach(() => {
  processExitSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Helper to run the command, catching ProcessExitError
// ---------------------------------------------------------------------------

async function loadInitCommand() {
  const mod = await import('../../../../../packages/luca-framework/src/commands/init.ts');
  return mod.initCommand;
}

async function runCommand(args: Record<string, unknown> = {}) {
  const cmd = await loadInitCommand();
  try {
    await cmd.run!({ args: args as any, rawArgs: [], cmd });
  } catch (err) {
    if (err instanceof ProcessExitError) return; // expected
    throw err; // unexpected error
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('init command', () => {
  test('calls setupCleanupHandler on run', async () => {
    await runCommand();

    expect(mockSetupCleanupHandler).toHaveBeenCalledTimes(1);
  });

  test('calls detectProjectContext on run', async () => {
    await runCommand();

    expect(mockDetectProjectContext).toHaveBeenCalledTimes(1);
  });

  test('exits with code 1 when Luca is already installed', async () => {
    mockDetectProjectContext = mock(() => Promise.resolve(installedContext));
    mock.module('../../../../../packages/luca-framework/src/utils/detect', () => ({
      detectProjectContext: mockDetectProjectContext,
    }));

    await runCommand();

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(mockLogger.error).toHaveBeenCalled();
    // Should NOT call generateFiles
    expect(mockGenerateFiles).not.toHaveBeenCalled();
  });

  test('uses loadConfigFromFile when --config arg is provided', async () => {
    await runCommand({ config: '/path/to/config.json' });

    expect(mockLoadConfigFromFile).toHaveBeenCalledWith('/path/to/config.json');
    expect(mockGenerateFiles).toHaveBeenCalled();
  });

  test('exits with code 1 when loadConfigFromFile throws', async () => {
    mockLoadConfigFromFile = mock(() => Promise.reject(new Error('file not found')));
    mock.module('../../../../../packages/luca-framework/src/utils/wizard', () => ({
      runWizard: mockRunWizard,
      createConfigFromArgs: mockCreateConfigFromArgs,
      loadConfigFromFile: mockLoadConfigFromFile,
    }));

    await runCommand({ config: '/bad/path.json' });

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockGenerateFiles).not.toHaveBeenCalled();
  });

  test('uses createConfigFromArgs in quick mode', async () => {
    await runCommand({ quick: true });

    expect(mockCreateConfigFromArgs).toHaveBeenCalled();
    expect(mockRunWizard).not.toHaveBeenCalled();
    expect(mockGenerateFiles).toHaveBeenCalled();
  });

  test('uses createConfigFromArgs when explicit args are provided', async () => {
    await runCommand({ name: 'MyBot', prefix: 'mb' });

    expect(mockCreateConfigFromArgs).toHaveBeenCalledWith({
      name: 'MyBot',
      prefix: 'mb',
      stack: undefined,
      tracker: undefined,
    });
    expect(mockRunWizard).not.toHaveBeenCalled();
  });

  test('runs interactive wizard when no args are provided', async () => {
    await runCommand();

    expect(mockRunWizard).toHaveBeenCalledTimes(1);
    expect(mockGenerateFiles).toHaveBeenCalled();
  });

  test('exits with code 0 when wizard returns null (user cancels)', async () => {
    mockRunWizard = mock(() => Promise.resolve(null));
    mock.module('../../../../../packages/luca-framework/src/utils/wizard', () => ({
      runWizard: mockRunWizard,
      createConfigFromArgs: mockCreateConfigFromArgs,
      loadConfigFromFile: mockLoadConfigFromFile,
    }));

    await runCommand();

    expect(processExitSpy).toHaveBeenCalledWith(0);
    expect(mockGenerateFiles).not.toHaveBeenCalled();
  });

  test('exits with code 1 when generateFiles returns success: false', async () => {
    mockGenerateFiles = mock(() => Promise.resolve({ success: false, error: 'disk full' }));
    mock.module('../../../../../packages/luca-framework/src/utils/files', () => ({
      generateFiles: mockGenerateFiles,
      setupCleanupHandler: mockSetupCleanupHandler,
    }));

    await runCommand({ quick: true });

    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('calls p.outro and logger.box on success', async () => {
    await runCommand({ quick: true });

    expect(mockOutro).toHaveBeenCalled();
    expect(mockLogger.box).toHaveBeenCalled();
  });
});
