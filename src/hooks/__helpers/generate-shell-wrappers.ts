/**
 * Build-time shell wrapper generator for hooks.
 *
 * Reads the canonical hook registry and generates `.sh` wrappers that
 * delegate to the TypeScript implementations in `scripts/`. These wrappers
 * are written to `.claude/hooks/` (or `.claude/statusline.sh` for the
 * statusline hook) by the build pipeline.
 *
 * This is the single source of truth for shell wrapper content — no
 * hand-written `.sh` shims remain in the source tree.
 *
 * Source: src/hooks/__helpers/generate-shell-wrappers.ts
 *
 * @module generate-shell-wrappers
 */

import { resolveCanonicalRegistry } from "./hook-registry";

/**
 * Generates shell wrapper content for a single hook.
 *
 * The wrapper invokes `bun` on the TypeScript implementation, passing
 * through all arguments and stdin. The path is relative to the wrapper's
 * location in `.claude/hooks/` (two directories up to reach `src/hooks/scripts/`).
 *
 * @param hookName - Canonical hook name (e.g. "post-edit-format")
 * @returns Shell script string with exec bun invocation
 */
export function generateShellWrapper(hookName: string): string {
  const scriptName = `${hookName}.ts`;
  // Wrapper lives at .claude/hooks/{hookName}.sh
  // TypeScript source lives at src/hooks/scripts/{hookName}.ts
  // Relative path: ../../src/hooks/scripts/{hookName}.ts
  return `#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/${scriptName}" "$@" <&0
`;
}

/**
 * Generates shell wrappers for all hooks in the canonical registry.
 *
 * Returns a Record mapping output file paths to shell script content.
 * Most hooks map to `.claude/hooks/{name}.sh`. The `statusline` hook
 * is special — it maps to `.claude/statusline.sh` (not inside hooks/).
 *
 * @returns Record mapping output path (e.g. ".claude/hooks/post-edit-format.sh")
 *          to shell script content
 */
export function generateAllShellWrappers(): Record<string, string> {
  const registry = resolveCanonicalRegistry();
  const wrappers: Record<string, string> = {};

  for (const hookName of Object.keys(registry)) {
    const content = generateShellWrapper(hookName);

    if (hookName === "statusline") {
      wrappers[".claude/statusline.sh"] = content;
    } else {
      wrappers[`.claude/hooks/${hookName}.sh`] = content;
    }
  }

  return wrappers;
}
