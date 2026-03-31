#!/usr/bin/env bun

/**
 * Targeted domain recompilation.
 *
 * Compiles a single domain's artifacts without running the full build:all
 * pipeline. This avoids the known build:all crash in Claude Code sessions
 * by skipping plugin generation (Stage 3) and the session lock check.
 *
 * When `--domain=all` is specified, all domains are compiled sequentially
 * (equivalent to stages 1+2 of build:all without plugin output).
 *
 * For single-domain mode, the script generates only the specified domain's
 * output files from the registry, applies branding transforms, and writes
 * them to `dist/claude/`. Other domains' files are left untouched.
 *
 * Usage:
 *   bun run scripts/targeted-recompile.ts --domain=agents
 *   bun run scripts/targeted-recompile.ts --domain=skills
 *   bun run scripts/targeted-recompile.ts --domain=rules
 *   bun run scripts/targeted-recompile.ts --domain=hooks
 *   bun run scripts/targeted-recompile.ts --domain=all
 *
 * @module scripts/targeted-recompile
 */

import { parseArgs } from "util";
import path from "path";

import { agentRegistry } from "../src/agents/index";
import { skillRegistry } from "../src/skills/index";
import { ruleRegistry } from "../src/rules/index";
import {
  compileAgent,
  compileSkill,
  compileRule,
} from "../src/compilers/__helpers/compile";
import { transformOutputsToTemplates } from "../src/compilers";
import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";
import { runDeploy } from "./build-deploy";
import { ensureDir } from "./build-utils";

const VALID_DOMAINS = ["agents", "skills", "rules", "hooks"] as const;
type Domain = (typeof VALID_DOMAINS)[number];

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    domain: { type: "string" },
  },
});

const domain = values.domain;

if (!domain) {
  console.error(
    "Usage: bun run scripts/targeted-recompile.ts --domain=<agents|skills|rules|hooks|all>",
  );
  process.exit(1);
}

if (domain !== "all" && !VALID_DOMAINS.includes(domain as Domain)) {
  console.error(
    `Invalid domain: ${domain}. Valid: ${VALID_DOMAINS.join(", ")}, all`,
  );
  process.exit(1);
}

/**
 * Generate outputs for a single domain into a Map.
 *
 * @param d - The domain to generate outputs for
 * @returns Map of relative file paths to content strings
 */
async function generateDomainOutputs(d: Domain): Promise<Map<string, string>> {
  const generated = new Map<string, string>();

  switch (d) {
    case "agents":
      for (const [name, createAgent] of Object.entries(agentRegistry)) {
        const instance = createAgent();
        generated.set(
          `dist/claude/agents/${name}.md`,
          compileAgent(instance, "CLAUDE"),
        );
      }
      break;

    case "skills":
      for (const [name, createSkill] of Object.entries(skillRegistry)) {
        const instance = createSkill();
        generated.set(
          `dist/claude/skills/${name}/SKILL.md`,
          compileSkill(instance, "CLAUDE"),
        );
      }
      break;

    case "rules":
      for (const [name, createRule] of Object.entries(ruleRegistry)) {
        const instance = createRule();
        generated.set(
          `dist/claude/rules/${name}.md`,
          compileRule(instance, "CLAUDE"),
        );
      }
      break;

    case "hooks": {
      // Hooks use the full compile+deploy pipeline since they involve
      // shell wrapper generation and settings.json merging.
      // For hooks, fall through to the deploy stage which handles everything.
      const { generateAllShellWrappers } =
        await import("../src/hooks/__helpers/generate-shell-wrappers");
      const {
        resolveCanonicalRegistry,
        generateClaudeHooksConfigFromCanonical,
      } = await import("../src/hooks/index");

      const canonical = resolveCanonicalRegistry();
      const wrappers = generateAllShellWrappers();
      for (const [outputPath, content] of Object.entries(wrappers)) {
        generated.set(outputPath, content);
      }

      const hooksConfig = generateClaudeHooksConfigFromCanonical(canonical, {
        commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
        scriptExtension: ".sh",
      });
      generated.set(
        "dist/claude/settings.json__hooks",
        JSON.stringify(hooksConfig, null, 2),
      );
      break;
    }
  }

  return generated;
}

/**
 * Write generated outputs to disk, applying branding transforms for
 * agents and skills (rules and hooks are written as-is).
 *
 * @param generated - Map of relative paths to content
 */
async function writeDomainOutputs(
  generated: Map<string, string>,
): Promise<void> {
  const packageRoot = resolvePackageRoot();

  // Apply branding transforms to templates that need it
  const transformed = transformOutputsToTemplates(generated);

  for (const [relPath, content] of transformed) {
    // Only write dist/claude/ entries (skip dist/plugin/)
    if (!relPath.startsWith("dist/claude/")) continue;

    const absPath = path.join(packageRoot, relPath);
    await ensureDir(path.dirname(absPath));
    await Bun.write(absPath, content);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

const domainsToCompile: Domain[] =
  domain === "all" ? [...VALID_DOMAINS] : [domain as Domain];

for (const d of domainsToCompile) {
  console.log(`Compiling ${d}...`);
  const startMs = performance.now();

  try {
    if (domain === "all" && d === domainsToCompile[0]) {
      // For --domain=all, use the existing deploy pipeline (stages 1+2)
      // which handles everything correctly including settings.json merging.
      const { runCompile } = await import("./build-compile");
      const compileCounts = await runCompile();
      const deployCounts = await runDeploy();
      const elapsedMs = Math.round(performance.now() - startMs);
      console.log(
        `  All domains compiled+deployed (${compileCounts.total} templates, ${deployCounts.total} files, ${elapsedMs}ms)`,
      );
      break; // runCompile+runDeploy handles all domains at once
    }

    const outputs = await generateDomainOutputs(d);
    await writeDomainOutputs(outputs);
    const elapsedMs = Math.round(performance.now() - startMs);
    console.log(`  Done: ${outputs.size} files (${elapsedMs}ms)`);
  } catch (error) {
    console.error(
      `  Failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

console.log("Recompilation complete.");
