import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';

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

let mockExecuteDoctor: ReturnType<typeof mock>;
let processExitSpy: ReturnType<typeof spyOn>;

// ---------------------------------------------------------------------------
// Setup & Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockExecuteDoctor = mock(() => Promise.resolve(0));

  mock.module('../../../../../packages/luca-framework/src/utils/doctor/index', () => ({
    executeDoctor: mockExecuteDoctor,
  }));

  processExitSpy = spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
    throw new ProcessExitError(typeof code === 'number' ? code : 1);
  });
});

afterEach(() => {
  processExitSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Helper to run the doctor command
// ---------------------------------------------------------------------------

async function loadDoctorCommand() {
  const mod = await import('../../../../../packages/luca-framework/src/commands/doctor.ts');
  return mod.default;
}

async function runCommand(args: Record<string, unknown> = {}) {
  const cmd = await loadDoctorCommand();
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

describe('doctor command', () => {
  test('calls executeDoctor', async () => {
    await runCommand();

    expect(mockExecuteDoctor).toHaveBeenCalledTimes(1);
  });

  test('exits with code 0 when all checks pass', async () => {
    mockExecuteDoctor = mock(() => Promise.resolve(0));
    mock.module('../../../../../packages/luca-framework/src/utils/doctor/index', () => ({
      executeDoctor: mockExecuteDoctor,
    }));

    await runCommand();

    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  test('exits with code 1 when some checks fail', async () => {
    mockExecuteDoctor = mock(() => Promise.resolve(1));
    mock.module('../../../../../packages/luca-framework/src/utils/doctor/index', () => ({
      executeDoctor: mockExecuteDoctor,
    }));

    await runCommand();

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
