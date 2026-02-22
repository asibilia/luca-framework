/**
 * Shell execution mock utilities for testing code that uses Bun.$.
 *
 * Provides `createShellMock()` and `installShellMock()` as replacements for
 * the old execa mock infrastructure. Works by temporarily overriding Bun.$
 * on the global Bun object.
 *
 * @module __tests__/utils/mock-shell
 */

export interface ShellCallConfig {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: Error;
}

/**
 * Create a shell mock that records calls and returns configured responses.
 *
 * @param defaultConfig - Default response for all calls
 * @param callConfigs - Optional per-call response overrides (by call order)
 * @returns Mock instance with shellFn and getCalls()
 *
 * @example
 * ```typescript
 * const shellMock = createShellMock({ stdout: '{"number": 42}' });
 * const restore = installShellMock(shellMock);
 * // ... run code that uses Bun.$ ...
 * expect(shellMock.getCalls().length).toBe(1);
 * restore();
 * ```
 */
export function createShellMock(
  defaultConfig: ShellCallConfig = { stdout: "", stderr: "", exitCode: 0 },
  callConfigs?: ShellCallConfig[],
) {
  let callIndex = 0;
  const calls: Array<{ raw: string }> = [];

  const shellFn = (pieces: TemplateStringsArray, ...args: unknown[]) => {
    // Build the raw command string from template parts and interpolated args
    let raw = "";
    pieces.forEach((piece, i) => {
      raw += piece;
      if (i < args.length) raw += String(args[i]);
    });
    calls.push({ raw: raw.trim() });

    const config = callConfigs?.[callIndex] ?? defaultConfig;
    callIndex++;

    if (config.error) {
      return {
        quiet: () => Promise.reject(config.error),
      };
    }

    return {
      quiet: () =>
        Promise.resolve({
          text: () => config.stdout ?? "",
          exitCode: config.exitCode ?? 0,
        }),
    };
  };

  return { shellFn, getCalls: () => calls };
}

/**
 * Install a shell mock by replacing Bun.$ on the global Bun object.
 *
 * Returns a cleanup function that restores the original Bun.$.
 * MUST be called in afterEach or after the test completes.
 *
 * @param mockInstance - Shell mock created by createShellMock()
 * @returns Cleanup function to restore original Bun.$
 */
export function installShellMock(
  mockInstance: ReturnType<typeof createShellMock>,
): () => void {
  const original = Bun.$;
  (Bun as any).$ = mockInstance.shellFn;
  return () => {
    (Bun as any).$ = original;
  };
}
