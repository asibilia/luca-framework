#!/usr/bin/env bun

/**
 * Lightweight import boundary checker for the Luca domain architecture.
 *
 * Validates that:
 * 1. Tier rules are respected (downward-only imports)
 * 2. Entity domains (agents/skills/rules) never cross-import
 * 3. No cross-domain imports into __helpers/ (shared exempt)
 *
 * Exit 0 = clean, Exit 1 = violations found.
 *
 * Usage: bun run scripts/check-domain-boundaries.ts
 */

import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { relative, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Domain tier assignments
// ---------------------------------------------------------------------------

const DOMAIN_TIER: Record<string, number> = {
  shared: 0,
  complexity: 0,
  context: 1,
  planner: 1,
  harness: 1,
  iteration: 1,
  memory: 1,
  agents: 2,
  skills: 2,
  rules: 2,
  compilers: 3,
  hooks: 3,
};

const ENTITY_DOMAINS = new Set(["agents", "skills", "rules"]);

// ---------------------------------------------------------------------------
// Known exceptions (source domain -> target domain)
// ---------------------------------------------------------------------------

const EXCEPTIONS: Array<{ source: string; target: string; reason: string }> = [
  {
    source: "shared",
    target: "agents",
    reason: "validation-utils references agent schemas",
  },
  {
    source: "shared",
    target: "skills",
    reason: "validation-utils references skill schemas",
  },
  {
    source: "shared",
    target: "rules",
    reason: "validation-utils references rule schemas",
  },
];

function isException(sourceDomain: string, targetDomain: string): boolean {
  return EXCEPTIONS.some(
    (e) => e.source === sourceDomain && e.target === targetDomain,
  );
}

// ---------------------------------------------------------------------------
// Import extraction
// ---------------------------------------------------------------------------

/**
 * Extract ~/... import paths from actual top-level import/export statements.
 * Stops scanning when we hit the first non-import declaration (const, function,
 * etc.) to avoid matching example imports inside template literal strings.
 */
function extractTildeImports(content: string): string[] {
  const imports: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Skip empty lines, comments, and JSDoc
    if (
      trimmed === "" ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("*/")
    )
      continue;

    // Stop at the first non-import declaration
    if (
      !trimmed.startsWith("import") &&
      !trimmed.startsWith("export") &&
      !trimmed.startsWith("}")
    )
      break;

    const match = /from\s+["']~\/([^"']+)["']/.exec(line);
    if (match) {
      imports.push(match[1]!);
    }
  }
  return imports;
}

function getDomain(filePath: string): string | null {
  // filePath relative to src/, e.g. "agents/__helpers/create-agent.ts"
  const parts = filePath.split("/");
  if (parts.length < 1) return null;
  return parts[0] ?? null;
}

function getTargetDomain(importPath: string): string | null {
  const parts = importPath.split("/");
  if (parts.length < 1) return null;
  return parts[0] ?? null;
}

function isHelpersImport(importPath: string): boolean {
  return importPath.includes("__helpers/");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  import: string;
  rule: string;
  detail: string;
}

async function main(): Promise<void> {
  const srcDir = `${process.cwd()}/src`;
  const glob = new Glob("**/*.ts");
  const violations: Violation[] = [];

  for await (const filePath of glob.scan({ cwd: srcDir })) {
    const sourceDomain = getDomain(filePath);
    if (!sourceDomain || !(sourceDomain in DOMAIN_TIER)) continue;

    const fullPath = `${srcDir}/${filePath}`;
    const content = readFileSync(fullPath, "utf-8");
    const imports = extractTildeImports(content);

    for (const importPath of imports) {
      const targetDomain = getTargetDomain(importPath);
      if (!targetDomain || !(targetDomain in DOMAIN_TIER)) continue;
      if (sourceDomain === targetDomain) continue; // intra-domain is always fine

      // Check exception list
      if (isException(sourceDomain, targetDomain)) continue;

      const sourceTier = DOMAIN_TIER[sourceDomain]!;
      const targetTier = DOMAIN_TIER[targetDomain]!;

      // Rule 1: Downward-only imports (source tier >= target tier)
      if (sourceTier < targetTier) {
        violations.push({
          file: `src/${filePath}`,
          import: `~/${importPath}`,
          rule: "tier-violation",
          detail: `T${sourceTier} (${sourceDomain}) cannot import from T${targetTier} (${targetDomain})`,
        });
      }

      // Rule 2: Entity isolation
      if (
        ENTITY_DOMAINS.has(sourceDomain) &&
        ENTITY_DOMAINS.has(targetDomain)
      ) {
        violations.push({
          file: `src/${filePath}`,
          import: `~/${importPath}`,
          rule: "entity-isolation",
          detail: `Entity domain ${sourceDomain} cannot import from entity domain ${targetDomain}`,
        });
      }

      // Rule 3: No cross-domain __helpers/ imports (shared exempt)
      if (isHelpersImport(importPath) && targetDomain !== "shared") {
        violations.push({
          file: `src/${filePath}`,
          import: `~/${importPath}`,
          rule: "helpers-encapsulation",
          detail: `Cross-domain import into ${targetDomain}/__helpers/ (use barrel instead)`,
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log("✓ No domain boundary violations found.");
    process.exit(0);
  }

  console.error(`✗ Found ${violations.length} domain boundary violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.rule}: ${v.file}`);
    console.error(`    import: ${v.import}`);
    console.error(`    → ${v.detail}\n`);
  }
  process.exit(1);
}

main();
