#!/usr/bin/env bun

/**
 * build-statusline.ts — Bundle the statusline renderer into a standalone file.
 *
 * The statusline TypeScript source (`src/hooks/scripts/statusline.ts`) lives in
 * the monorepo `src/` directory, which is NOT published to npm. This script uses
 * Bun's bundler to compile it (and all its internal dependencies) into a single
 * self-contained JS file at `dist/statusline.bundle.js`.
 *
 * The shell wrapper (`templates/harness/claude/statusline.sh`) prefers this
 * bundle when `src/` is not available (i.e., npm installs).
 *
 * Usage:
 *   bun run build:statusline                     # via package.json script
 *   bun ./packages/luca-framework/scripts/build-statusline.ts  # direct
 *
 * @module build-statusline
 */

import { resolve, dirname } from "path";

const packageRoot = dirname(dirname(import.meta.path));
const monorepoRoot = resolve(packageRoot, "../..");

const entrypoint = resolve(monorepoRoot, "src/hooks/scripts/statusline.ts");
const outdir = resolve(packageRoot, "dist");

const result = await Bun.build({
  entrypoints: [entrypoint],
  outdir,
  naming: "statusline.bundle.js",
  target: "bun",
  minify: false,
  sourcemap: "none",
  external: [],
});

if (!result.success) {
  console.error("Failed to bundle statusline:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`Statusline bundled -> ${outdir}/statusline.bundle.js`);
