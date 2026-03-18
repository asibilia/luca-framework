#!/usr/bin/env bun

/**
 * build-compile.ts — Compile src/ definitions to EJS templates.
 *
 * Stage 1 of the split build pipeline. Generates all Claude Code outputs
 * in memory via `generateAllOutputs()`, filters for `.claude/` entries,
 * transforms them into branded EJS templates via `transformOutputsToTemplates()`,
 * and writes the results to `packages/luca-framework/templates/harness/claude/`.
 *
 * This stage is independent of branding config and produces portable
 * templates that any branding context can resolve.
 *
 * Usage:
 *   bun run build:compile                    # via package.json script
 *   bun ./scripts/build-compile.ts           # direct invocation
 *
 * Output:
 *   packages/luca-framework/templates/harness/claude/
 *     agents/    (branded EJS templates)
 *     skills/    (branded EJS templates)
 *     rules/     (raw, no branding needed)
 *     hooks/     (raw shell scripts)
 *     settings.json (with hooks merged)
 *
 * @module build-compile
 */

import path from "path";
import { rmSync, existsSync } from "node:fs";

import { generateAllOutputs } from "./build-shared";
import { transformOutputsToTemplates } from "../src/compilers";
import {
  ensureDir,
  VAULT_GUARD_PROMPT,
  computeOutputCounts,
  buildErrorHandler,
} from "./build-utils";
import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";

// ---------------------------------------------------------------------------
// Output directory
// ---------------------------------------------------------------------------

const TEMPLATE_OUTPUT_DIR = path.join(
  resolvePackageRoot(),
  "packages",
  "luca-framework",
  "templates",
  "harness",
  "claude",
);

// ---------------------------------------------------------------------------
// Main compile function
// ---------------------------------------------------------------------------

/**
 * Run the compile stage: src/ -> templates/harness/claude/.
 *
 * 1. Calls generateAllOutputs() to compile every agent, skill, rule, and hook
 * 2. Filters for `.claude/` entries (excludes dist/plugin/ and settings fragment)
 * 3. Handles the special `settings.json__hooks` fragment by merging into settings.json
 * 4. Strips the `.claude/` prefix from keys
 * 5. Applies branding transforms to produce EJS templates
 * 6. Writes all entries to the template output directory
 *
 * @returns Object with counts of compiled files
 */
export async function runCompile(): Promise<{
  agents: number;
  skills: number;
  rules: number;
  hooks: number;
  total: number;
}> {
  // =========================================================================
  // 1. Generate all outputs in memory
  // =========================================================================
  const generated = await generateAllOutputs();

  // =========================================================================
  // 2. Filter for .claude/ entries and extract settings fragment
  // =========================================================================
  const claudeEntries = new Map<string, string>();
  let settingsHooksFragment: string | undefined;

  for (const [relPath, content] of generated) {
    if (relPath === ".claude/settings.json__hooks") {
      settingsHooksFragment = content;
      continue;
    }

    if (relPath.startsWith(".claude/")) {
      // Strip the .claude/ prefix for template storage
      const templatePath = relPath.slice(".claude/".length);
      claudeEntries.set(templatePath, content);
    }
  }

  // =========================================================================
  // 3. Handle settings.json with hooks merged
  // =========================================================================
  if (settingsHooksFragment) {
    const existingSettings: Record<string, unknown> = {};
    try {
      existingSettings.hooks = JSON.parse(settingsHooksFragment);
    } catch {
      console.warn(
        "Failed to parse settings hooks fragment, using empty hooks",
      );
      existingSettings.hooks = {};
    }

    // Add statusLine configuration (camelCase key required by Claude Code)
    existingSettings.statusLine = {
      type: "command",
      command: '"$CLAUDE_PROJECT_DIR"/.claude/statusline.sh',
    };

    // =========================================================================
    // 3b. Inject vault-guard prompt hook into PreToolUse
    //
    // The canonical hook registry (generateAllOutputs) only supports
    // type: "command" hooks. This prompt hook bypasses the registry and is
    // injected directly into the dogfood settings.json.
    //
    // SYNC: The prompt text below must match the prompt in
    //   packages/luca-framework/templates/hooks/settings-hooks.json
    //   (the PreToolUse entry with matcher "mcp__muninn__muninn_remember...")
    // =========================================================================
    const hooksObj = existingSettings.hooks as
      | Record<string, unknown[]>
      | undefined;
    if (hooksObj) {
      if (!Array.isArray(hooksObj.PreToolUse)) {
        hooksObj.PreToolUse = [];
      }
      const preToolUse = hooksObj.PreToolUse as Array<Record<string, unknown>>;
      const hasVaultGuard = preToolUse.some(
        (entry) =>
          typeof entry.matcher === "string" &&
          entry.matcher.includes("muninn_remember"),
      );
      if (!hasVaultGuard) {
        preToolUse.push({
          matcher:
            "mcp__muninn__muninn_remember|mcp__muninn__muninn_remember_batch",
          hooks: [
            {
              type: "prompt",
              prompt: VAULT_GUARD_PROMPT,
            },
          ],
        });
      }
    }

    claudeEntries.set(
      "settings.json",
      JSON.stringify(existingSettings, null, 2) + "\n",
    );
  }

  // =========================================================================
  // 4. Apply branding transforms to produce EJS templates
  // =========================================================================
  const templates = transformOutputsToTemplates(claudeEntries);

  // =========================================================================
  // 5. Clean output directory and write templates
  // =========================================================================
  if (existsSync(TEMPLATE_OUTPUT_DIR)) {
    rmSync(TEMPLATE_OUTPUT_DIR, { recursive: true, force: true });
  }
  await ensureDir(TEMPLATE_OUTPUT_DIR);

  const hookScriptPaths: string[] = [];

  for (const [relPath, content] of templates) {
    const absPath = path.join(TEMPLATE_OUTPUT_DIR, relPath);
    await ensureDir(path.dirname(absPath));
    await Bun.write(absPath, content);

    if (relPath.endsWith(".sh")) {
      hookScriptPaths.push(absPath);
    }
  }

  // chmod +x on shell scripts
  for (const scriptPath of hookScriptPaths) {
    Bun.spawnSync(["chmod", "+x", scriptPath]);
  }

  // =========================================================================
  // 6. Compute counts and print summary
  // =========================================================================
  const keys = [...templates.keys()];
  const counts = computeOutputCounts(keys);

  console.log(`\n=== Build Compile Summary ===`);
  console.log(`  Agents:   ${counts.agents}`);
  console.log(`  Skills:   ${counts.skills}`);
  console.log(`  Rules:    ${counts.rules}`);
  console.log(`  Hooks:    ${counts.hooks}`);
  console.log(`  Total:    ${counts.total} files -> ${TEMPLATE_OUTPUT_DIR}`);

  return counts;
}

// ---------------------------------------------------------------------------
// Direct invocation
// ---------------------------------------------------------------------------
if (import.meta.main) {
  runCompile().catch((error) => buildErrorHandler("build-compile", error));
}
