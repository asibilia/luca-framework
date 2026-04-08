import { existsSync } from "node:fs";
import { join } from "pathe";

import type { ProjectContext } from "../types";

/**
 * Detect project context to inform vault wizard defaults.
 * Called early in vault:init to adapt prompts based on existing setup.
 */
export async function detectProjectContext(
  cwd: string = process.cwd(),
): Promise<ProjectContext> {
  const context: ProjectContext = {
    hasPackageJson: false,
    hasGit: false,
    hasLuca: false,
    detectedStack: "unknown",
    hasTypeScript: false,
    projectName: null,
  };

  // Check for package.json
  const pkgPath = join(cwd, "package.json");
  try {
    const pkgFile = Bun.file(pkgPath);
    if (await pkgFile.exists()) {
      const pkg = JSON.parse(await pkgFile.text()) as Record<string, unknown>;
      context.hasPackageJson = true;
      context.projectName = (pkg.name as string) || null;
      context.projectDescription = (pkg.description as string) || null;

      // Detect stack from dependencies
      const deps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };

      if (deps["react"] || deps["@types/react"]) {
        context.detectedStack = deps["typescript"] ? "react-ts" : "react";
      } else if (deps["typescript"]) {
        context.detectedStack = "node-ts";
      } else if (context.hasPackageJson) {
        context.detectedStack = "node";
      }

      // Check for TypeScript
      context.hasTypeScript = !!(
        deps["typescript"] ||
        (await Bun.file(join(cwd, "tsconfig.json")).exists())
      );
    }
  } catch {
    // No package.json or parse error — that's fine
  }

  // Directory existence checks — existsSync required (Bun.file doesn't support dirs)
  context.hasGit = existsSync(join(cwd, ".git"));
  context.hasLuca = existsSync(join(cwd, ".planning"));

  // Detect existing source code directories
  context.hasExistingSource =
    existsSync(join(cwd, "src")) ||
    existsSync(join(cwd, "app")) ||
    existsSync(join(cwd, "lib"));

  return context;
}
