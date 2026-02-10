import { mock } from 'bun:test';

export interface ExecaCallConfig {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: Error;
}

export function createExecaMock(
  defaultConfig: ExecaCallConfig = { stdout: '', stderr: '', exitCode: 0 },
  callConfigs?: ExecaCallConfig[]
) {
  let callIndex = 0;
  const calls: Array<{ command: string; args: string[] }> = [];

  const execaMock = async (command: string, args: string[] = []) => {
    calls.push({ command, args });
    const config = callConfigs?.[callIndex] ?? defaultConfig;
    callIndex++;

    if (config.error) {
      throw config.error;
    }

    return {
      stdout: config.stdout ?? '',
      stderr: config.stderr ?? '',
      exitCode: config.exitCode ?? 0,
    };
  };

  return { execa: execaMock, getCalls: () => calls };
}

export function installExecaMock(mockInstance: ReturnType<typeof createExecaMock>) {
  mock.module('execa', () => ({
    execa: mockInstance.execa,
  }));
}
