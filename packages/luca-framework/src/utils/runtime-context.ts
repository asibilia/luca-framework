import { z } from "zod";
import { homedir } from "node:os";

/**
 * Zod schema for the runtime context result.
 *
 * Defines the shape of the object returned by `detectRuntimeContext()`,
 * including the execution mode (global install vs. monorepo dev),
 * the resolved package directory, and the user's home directory.
 */
export const RuntimeContextSchema = z.object({
  /** Whether Luca is running from a global npm/bun install or from the monorepo in dev mode. */
  mode: z.enum(["global", "dev"]),
  /** Absolute path to the package directory containing the running script. */
  packageDir: z.string(),
  /** Absolute path to the user's home directory. */
  homeDir: z.string(),
});

/** Runtime context inferred from the Zod schema. */
export type RuntimeContext = z.infer<typeof RuntimeContextSchema>;

/**
 * Detect whether Luca is running from a global install or from the monorepo in dev mode.
 *
 * Uses `import.meta.dir` to determine the absolute directory of the running script.
 * If the resolved path contains `packages/luca-framework/`, Luca is running in dev mode
 * (inside the monorepo). Otherwise, it is running as a globally installed package.
 *
 * @returns A validated `RuntimeContext` object with mode, packageDir, and homeDir.
 *
 * @example
 * ```typescript
 * const ctx = detectRuntimeContext();
 * if (ctx.mode === 'dev') {
 *   console.log('Running from monorepo at:', ctx.packageDir);
 * } else {
 *   console.log('Running from global install');
 * }
 * ```
 */
export function detectRuntimeContext(): RuntimeContext {
  const scriptDir = import.meta.dir;
  const isDevMode = scriptDir.includes("packages/luca-framework/");
  const home = homedir();

  const result: RuntimeContext = {
    mode: isDevMode ? "dev" : "global",
    packageDir: scriptDir,
    homeDir: home,
  };

  return RuntimeContextSchema.parse(result);
}
