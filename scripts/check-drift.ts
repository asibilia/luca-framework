#!/usr/bin/env bun

/**
 * check-drift.ts — Detect drift between src/ source and dist/claude/dist/plugin/ outputs
 *
 * Generates all outputs in memory using the same compilation logic as
 * build-all.ts, then compares each generated file against its committed counterpart.
 *
 * Reports drifted, missing, and orphaned files.
 *
 * Exit codes:
 *   0 = all outputs match source (no drift)
 *   1 = drift detected
 *
 * Usage:
 *   bun run check:drift           # via package.json script
 *   bun ./scripts/check-drift.ts  # direct invocation
 */
import { generateAllOutputs, getActiveProfileNames } from "./build-shared";
import path from "path";
import { readdirSync, statSync } from "fs";
import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";
import { transformOutputsToTemplates } from "../src/compilers";
import { loadBrandingContext } from "./branding";

/**
 * Resolve EJS template placeholders in content using branding context.
 * Handles `<%= branding.X %>` patterns produced by transformOutputsToTemplates.
 */
function resolveBranding(
  content: string,
  branding: Record<string, string>,
): string {
  return content.replace(
    /<%=\s*branding\.(\w+)\s*%>/g,
    (_match, key) => branding[key] ?? _match,
  );
}

interface DriftResult {
  file: string;
  status: "drifted" | "missing" | "orphaned";
  detail?: string;
}

async function main() {
  const projectDir = resolvePackageRoot();
  const results: DriftResult[] = [];

  // Generate all outputs in memory (pre-branding)
  const rawGenerated = await generateAllOutputs();

  // Apply branding transform to dist/claude/ entries (same as compile+deploy pipeline)
  // This converts `# lu` → `# /lu`, `lu-router` → `{prefix}-router`, etc.
  // loadBrandingContext returns a BrandingContext (named interface).
  // Spread into Record<string, string> for dynamic key access in resolveBranding.
  const brandingCtx = await loadBrandingContext(projectDir);
  const branding: Record<string, string> = Object.fromEntries(
    Object.entries(brandingCtx).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const claudeEntries = new Map<string, string>();
  const nonClaudeEntries = new Map<string, string>();

  for (const [relPath, content] of rawGenerated) {
    if (relPath.startsWith("dist/claude/")) {
      claudeEntries.set(relPath, content);
    } else {
      nonClaudeEntries.set(relPath, content);
    }
  }

  // Transform dist/claude/ entries through branding pipeline
  const templates = transformOutputsToTemplates(claudeEntries);
  const generated = new Map<string, string>();

  for (const [templatePath, templateContent] of templates) {
    // Resolve template path: __branding.commandPrefix__ → actual prefix
    const resolvedPath = templatePath.replace(
      /__branding\.(\w+)__/g,
      (_match, key) => branding[key] ?? _match,
    );
    // Resolve template content: <%= branding.X %> → actual value
    const resolvedContent = resolveBranding(templateContent, branding);
    generated.set(resolvedPath, resolvedContent);
  }

  // Add non-dist/claude/ entries unchanged (dist/plugin/ etc.)
  for (const [relPath, content] of nonClaudeEntries) {
    generated.set(relPath, content);
  }

  // Compare each generated file against committed output
  for (const [relPath, expectedContent] of generated) {
    // settings.json__hooks is a virtual fragment — build-deploy intentionally
    // skips settings.json (merge happens at deploy time in deploy-global.ts).
    // Only verify hooks if settings.json happens to exist (e.g. in template harness).
    if (relPath === "dist/claude/settings.json__hooks") {
      const settingsPath = path.join(projectDir, "dist/claude/settings.json");
      const settingsFile = Bun.file(settingsPath);
      if (!(await settingsFile.exists())) {
        // Expected: build-deploy skips settings.json; hooks verified at deploy time
        continue;
      }
      try {
        const settings = JSON.parse(await settingsFile.text());
        const actualHooks = JSON.stringify(settings.hooks ?? {}, null, 2);
        if (actualHooks !== expectedContent) {
          results.push({
            file: "dist/claude/settings.json (hooks section)",
            status: "drifted",
            detail: "Hooks config differs from source",
          });
        }
      } catch {
        results.push({
          file: "dist/claude/settings.json",
          status: "drifted",
          detail: "Invalid JSON",
        });
      }
      continue;
    }

    const absPath = path.join(projectDir, relPath);
    const file = Bun.file(absPath);

    if (!(await file.exists())) {
      results.push({
        file: relPath,
        status: "missing",
        detail: "Output file does not exist",
      });
      continue;
    }

    const actualContent = await file.text();
    if (actualContent !== expectedContent) {
      // For readability, show first differing line
      const expectedLines = expectedContent.split("\n");
      const actualLines = actualContent.split("\n");
      let firstDiffLine = -1;
      const maxCheck = Math.max(expectedLines.length, actualLines.length);
      for (let i = 0; i < maxCheck; i++) {
        if (expectedLines[i] !== actualLines[i]) {
          firstDiffLine = i + 1;
          break;
        }
      }
      results.push({
        file: relPath,
        status: "drifted",
        detail: `Content differs (first diff at line ${firstDiffLine}, expected ${expectedLines.length} lines, actual ${actualLines.length} lines)`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Stale file detection: find compiled rules in output dirs that are NOT
  // in the generated Map. This catches the case where a profile was disabled
  // but old rule files remain on disk.
  // -------------------------------------------------------------------------
  const staleCheckDirs: Array<{ dir: string; prefix: string; ext: string }> = [
    {
      dir: path.join(projectDir, "dist", "claude", "rules"),
      prefix: "dist/claude/rules/",
      ext: ".md",
    },
  ];

  for (const { dir, prefix, ext } of staleCheckDirs) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (!entry.endsWith(ext)) continue;
        const relPath = `${prefix}${entry}`;
        if (!generated.has(relPath)) {
          results.push({
            file: relPath,
            status: "orphaned",
            detail: `Stale rule file: exists on disk but not in generated output (profile may have been disabled)`,
          });
        }
      }
    } catch {
      // Directory doesn't exist — nothing to check
    }
  }

  // Report results
  if (results.length === 0) {
    console.log("No drift detected. All outputs match source.");
    console.log(
      `Active profiles: ${(await getActiveProfileNames()).join(", ") || "none"}`,
    );
    process.exit(0);
  }

  console.error(`\nDrift detected: ${results.length} file(s) out of sync\n`);

  const drifted = results.filter((r) => r.status === "drifted");
  const missing = results.filter((r) => r.status === "missing");

  if (drifted.length > 0) {
    console.error("Drifted files (output differs from source):");
    for (const r of drifted) {
      console.error(`  - ${r.file}: ${r.detail}`);
    }
  }

  if (missing.length > 0) {
    console.error("Missing files (source exists but output not generated):");
    for (const r of missing) {
      console.error(`  - ${r.file}`);
    }
  }

  const orphaned = results.filter((r) => r.status === "orphaned");
  if (orphaned.length > 0) {
    console.error(
      "Stale files (exist on disk but not in generated output — profile may have been disabled):",
    );
    for (const r of orphaned) {
      console.error(`  - ${r.file}`);
    }
  }

  console.error(
    "\nFix: Run `bun run build:all` to regenerate all outputs from source.",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error("Drift check failed:", error.message || error);
  process.exit(1);
});
