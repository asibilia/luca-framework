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
 * through all arguments and stdin. It supports two resolution strategies:
 *
 * 1. **Global install** (`$LUCA_PACKAGE_ROOT` set): Uses the absolute path
 *    from the env var. This is set by `deploy-global.ts` or session-start.
 * 2. **Monorepo dev** (fallback): Uses a relative path from the wrapper's
 *    location in `.claude/hooks/` (two directories up to reach `src/`).
 *
 * This makes `deploy-global.ts`'s `rewriteWrapperPaths()` unnecessary for
 * new installs, though it remains as a transition mechanism.
 *
 * @param hookName - Canonical hook name (e.g. "post-edit-format")
 * @param outputPath - Relative output path (e.g. ".claude/hooks/post-edit-format.sh")
 * @returns Shell script string with context-aware exec bun invocation
 */
export function generateShellWrapper(
  hookName: string,
  outputPath?: string,
): string {
  const scriptName = `${hookName}.ts`;
  // Most wrappers live at .claude/hooks/{hookName}.sh → ../../ to reach src/
  // Statusline wrapper lives at .claude/statusline.sh → ../ to reach src/
  const isRootLevel =
    outputPath?.startsWith(".claude/") &&
    !outputPath.startsWith(".claude/hooks/");
  const relativePrefix = isRootLevel ? ".." : "../..";

  // The wrapper checks LUCA_PACKAGE_ROOT first (global install),
  // then falls back to the relative path (monorepo dev).
  return `#!/bin/sh
# Resolve the hook script path: absolute (global) or relative (monorepo)
if [ -n "$LUCA_PACKAGE_ROOT" ]; then
  SCRIPT="$LUCA_PACKAGE_ROOT/src/hooks/scripts/${scriptName}"
else
  SCRIPT="$(dirname "$0")/${relativePrefix}/src/hooks/scripts/${scriptName}"
fi
exec bun "$SCRIPT" "$@" <&0
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

  for (const [hookName, hook] of Object.entries(registry)) {
    // Prompt hooks don't need shell wrappers — they're inline LLM evaluations
    if (hook.type === "prompt") continue;

    const outputPath = `.claude/hooks/${hookName}.sh`;
    const content = generateShellWrapper(hookName, outputPath);
    wrappers[outputPath] = content;
  }

  // Statusline is not a hook event — it's a Claude Code statusLine setting.
  // But it uses the same TypeScript-in-scripts/ pattern and needs a shell wrapper.
  const statuslineOutputPath = ".claude/statusline.sh";
  wrappers[statuslineOutputPath] = generateShellWrapper(
    "statusline",
    statuslineOutputPath,
  );

  return wrappers;
}
