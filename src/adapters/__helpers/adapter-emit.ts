/**
 * Shared emit orchestration for IDE adapters.
 *
 * Extracted from duplicated emit() implementations in cursor-adapter.ts,
 * windsurf-adapter.ts, and vscode-adapter.ts. Cursor and Windsurf had
 * byte-identical emit loops; VS Code added copilot-instructions aggregation.
 *
 * The `preEmit` hook enables VS Code's aggregation step without
 * coupling the shared helper to any specific adapter logic.
 *
 * @module
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { EmitResult } from "../__schemas/adapter.schemas";

/**
 * Result returned by the optional `preEmit` hook.
 *
 * Allows adapters to transform the file map before the write loop
 * (e.g., aggregating multiple entries into a single file).
 */
export type PreEmitResult = {
  /** The (possibly modified) file map to write */
  files: Map<string, string>;
  /** Additional files to write outside the main map */
  extraFiles?: Array<{ path: string; content: string }>;
  /** Additional warnings generated during the pre-emit step */
  warnings?: string[];
};

/**
 * Options for the shared emit function.
 */
export type EmitOptions = {
  /**
   * Optional pre-emit hook called before the write loop.
   *
   * Receives the compiled outputs map and may return a modified map,
   * extra files to write, and/or additional warnings. Used by the
   * VS Code adapter to aggregate copilot-instructions entries into
   * a single file.
   *
   * @param entries - The compiled outputs map (relative path -> content)
   * @returns Transformed files, optional extra files, optional warnings
   */
  preEmit?: (entries: Map<string, string>) => PreEmitResult;

  /**
   * Warnings accumulated during compilation, before the emit step.
   *
   * These are merged with any warnings produced by the preEmit hook
   * into the final EmitResult.
   */
  existingWarnings?: string[];
};

/**
 * Write compiled adapter outputs to disk and return an EmitResult.
 *
 * This is the shared emit orchestration used by all IDE adapters:
 * 1. Run the optional `preEmit` hook to transform the file map
 * 2. Iterate entries: create parent directories and write each file
 * 3. Write any extra files produced by the preEmit hook
 * 4. Construct an EmitResult with file counts, paths, and merged warnings
 * 5. Clear the compiledOutputs buffer
 *
 * @param compiledOutputs - Map of relative paths to compiled content (mutated: cleared after emit)
 * @param outputDir - Absolute path to the root output directory
 * @param options - Optional pre-emit hook and existing warnings
 * @returns The EmitResult describing what was written
 *
 * @example
 * ```typescript
 * // Simple emit (Cursor, Windsurf)
 * const result = await emitCompiledOutputs(compiledOutputs, outputDir);
 *
 * // Emit with pre-processing (VS Code copilot-instructions aggregation)
 * const result = await emitCompiledOutputs(compiledOutputs, outputDir, {
 *   existingWarnings: ruleWarnings,
 *   preEmit: (entries) => {
 *     // aggregate copilot-instructions entries...
 *     return { files: modifiedEntries, extraFiles: [aggregatedFile] };
 *   },
 * });
 * ```
 */
export async function emitCompiledOutputs(
  compiledOutputs: Map<string, string>,
  outputDir: string,
  options?: EmitOptions,
): Promise<EmitResult> {
  const filesPaths: string[] = [];
  const warnings: string[] = [...(options?.existingWarnings ?? [])];

  // Step 1: Run optional preEmit hook
  let filesToWrite: Map<string, string> = compiledOutputs;
  let extraFiles: Array<{ path: string; content: string }> = [];

  if (options?.preEmit) {
    const preEmitResult = options.preEmit(compiledOutputs);
    filesToWrite = preEmitResult.files;
    extraFiles = preEmitResult.extraFiles ?? [];
    if (preEmitResult.warnings) {
      warnings.push(...preEmitResult.warnings);
    }
  }

  // Step 2: Write main file map
  for (const [relativePath, content] of filesToWrite) {
    const absolutePath = join(outputDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await Bun.write(absolutePath, content);
    filesPaths.push(absolutePath);
  }

  // Step 3: Write extra files from preEmit
  for (const extra of extraFiles) {
    const absolutePath = join(outputDir, extra.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await Bun.write(absolutePath, extra.content);
    filesPaths.push(absolutePath);
  }

  // Step 4: Construct result
  const result: EmitResult = {
    filesWritten: filesPaths.length,
    filesPaths,
    warnings,
  };

  // Step 5: Clear the buffer
  compiledOutputs.clear();

  return result;
}
