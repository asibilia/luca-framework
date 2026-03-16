#!/usr/bin/env bun

/**
 * generate-hooks-registry-json.ts — Emit canonical hook registry as a JSON artifact.
 *
 * Resolves the canonicalHookRegistry from src/hooks and serializes it
 * to dist/hooks-registry.json. This artifact is consumed at runtime by
 * the init/update pipeline so the CLI knows which hooks to deploy without
 * importing the full src/ build tree.
 *
 * Usage:
 *   bun ./scripts/generate-hooks-registry-json.ts   # direct invocation
 *   Called automatically by build-all.ts             # via build pipeline
 *
 * Output:
 *   dist/hooks-registry.json
 *
 * @module generate-hooks-registry-json
 */

import path from "path";

import { ensureDir } from "./build-utils";
import { resolveCanonicalRegistry } from "../src/hooks/__helpers/hook-registry";
import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";

/**
 * Generate the hooks registry JSON artifact.
 *
 * Resolves all canonical hook thunks and writes them to dist/hooks-registry.json.
 * Creates the dist/ directory if it does not exist.
 *
 * @returns The absolute path of the generated file
 */
export async function generateHooksRegistryJson(): Promise<string> {
  const registry = resolveCanonicalRegistry();
  const packageRoot = resolvePackageRoot();
  const outputDir = path.join(packageRoot, "dist");
  const outputPath = path.join(outputDir, "hooks-registry.json");

  await ensureDir(outputDir);
  await Bun.write(outputPath, JSON.stringify(registry, null, 2) + "\n");

  return outputPath;
}

// Direct invocation
if (import.meta.main) {
  const outputPath = await generateHooksRegistryJson();
  console.log(`Wrote hooks registry to ${outputPath}`);
}
