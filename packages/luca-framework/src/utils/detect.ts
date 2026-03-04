import { existsSync } from "fs";
import { readPackageJSON } from "pkg-types";
import { join } from "pathe";
import type { ProjectContext } from "../types";

/**
 * Detect project context to inform wizard defaults.
 * Called early in init to adapt questions based on existing setup.
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
  try {
    const pkg = await readPackageJSON(cwd);
    context.hasPackageJson = true;
    context.projectName = pkg.name || null;

    // Detect stack from dependencies
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps["react"] || deps["@types/react"]) {
      context.detectedStack = deps["typescript"] ? "react-ts" : "react";
    } else if (deps["typescript"]) {
      context.detectedStack = "node-ts";
    } else if (context.hasPackageJson) {
      context.detectedStack = "node";
    }

    // Check for TypeScript
    context.hasTypeScript = !!(
      deps["typescript"] || existsSync(join(cwd, "tsconfig.json"))
    );
  } catch {
    // No package.json - that's fine
  }

  // Check for git
  context.hasGit = existsSync(join(cwd, ".git"));

  // Check for existing Luca installation
  context.hasLuca = existsSync(join(cwd, ".cursor", "luca"));

  // Detect installed harness platforms
  const harnesses: string[] = [];
  if (existsSync(join(cwd, ".claude"))) harnesses.push("claude");
  if (existsSync(join(cwd, ".cursor"))) harnesses.push("cursor");
  if (existsSync(join(cwd, ".pi"))) harnesses.push("pi");
  context.detectedHarnesses = harnesses;

  // Suggest first command based on detected harness
  // All harnesses use the same /lu entry point
  context.suggestedFirstCommand = "/lu";

  return context;
}

/**
 * Format detected stack for display
 */
export function formatStack(stack: ProjectContext["detectedStack"]): string {
  const labels: Record<ProjectContext["detectedStack"], string> = {
    "react-ts": "React + TypeScript",
    react: "React",
    "node-ts": "Node.js + TypeScript",
    node: "Node.js",
    unknown: "Unknown",
  };
  return labels[stack];
}
