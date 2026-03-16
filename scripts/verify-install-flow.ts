/**
 * End-to-end install flow verification script.
 *
 * Exercises the full install flow programmatically, validating that all
 * pieces from phases 172-178 work together. Runs without interactive
 * prompts and outputs pass/fail for each check.
 *
 * Exit 0 if all checks pass, exit 1 if any fail.
 *
 * @example
 * ```bash
 * bun scripts/verify-install-flow.ts
 * ```
 *
 * @module verify-install-flow
 */

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "pathe";

// ─── Check infrastructure ────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: CheckResult[] = [];

/**
 * Record a check result.
 *
 * @param name - Check name for display
 * @param passed - Whether the check passed
 * @param message - Human-readable result message
 */
function recordCheck(name: string, passed: boolean, message: string): void {
  results.push({ name, passed, message });
  const icon = passed ? "PASS" : "FAIL";
  console.log(`  [${icon}] ${name}: ${message}`);
}

// ─── Check 1: Prerequisites ──────────────────────────────────────────────────

console.log("\n--- Check 1: Prerequisites ---");

try {
  const { checkPrerequisites } =
    await import("../packages/luca-framework/src/utils/prerequisites");
  const prereqs = checkPrerequisites();

  recordCheck(
    "Bun detected",
    prereqs.bun.installed,
    prereqs.bun.installed
      ? `Bun ${prereqs.bun.version} at ${prereqs.bun.path}`
      : "Bun not found",
  );

  recordCheck(
    "Bun meets minimum version",
    prereqs.bun.meetsMinimum,
    prereqs.bun.meetsMinimum
      ? `${prereqs.bun.version} >= 1.0.0`
      : `${prereqs.bun.version ?? "unknown"} < 1.0.0`,
  );
} catch (error) {
  recordCheck(
    "Prerequisites check",
    false,
    `Import failed: ${error instanceof Error ? error.message : "unknown"}`,
  );
}

// ─── Check 2: Runtime context ────────────────────────────────────────────────

console.log("\n--- Check 2: Runtime context ---");

try {
  const { detectRuntimeContext } =
    await import("../packages/luca-framework/src/utils/runtime-context");
  const ctx = detectRuntimeContext();

  recordCheck(
    "Runtime mode detected",
    ctx.mode === "dev" || ctx.mode === "global",
    `Mode: ${ctx.mode}, packageDir: ${ctx.packageDir}`,
  );

  // In the monorepo, we should be in dev mode
  recordCheck(
    "Dev mode in monorepo",
    ctx.mode === "dev",
    ctx.mode === "dev"
      ? "Correctly detected monorepo dev mode"
      : `Expected dev mode but got: ${ctx.mode}`,
  );
} catch (error) {
  recordCheck(
    "Runtime context detection",
    false,
    `Import failed: ${error instanceof Error ? error.message : "unknown"}`,
  );
}

// ─── Check 3: Project detection ──────────────────────────────────────────────

console.log("\n--- Check 3: Project detection ---");

try {
  const { detectProjectContext } =
    await import("../packages/luca-framework/src/utils/detect");
  const projectCtx = await detectProjectContext(process.cwd());

  recordCheck(
    "Package.json detected",
    projectCtx.hasPackageJson,
    projectCtx.hasPackageJson
      ? `Project: ${projectCtx.projectName ?? "unnamed"}`
      : "No package.json found",
  );

  recordCheck(
    "Stack detected",
    projectCtx.detectedStack !== "unknown",
    `Stack: ${projectCtx.detectedStack}`,
  );

  recordCheck(
    "TypeScript detected",
    projectCtx.hasTypeScript,
    projectCtx.hasTypeScript
      ? "TypeScript configuration found"
      : "No TypeScript detected",
  );
} catch (error) {
  recordCheck(
    "Project detection",
    false,
    `Import failed: ${error instanceof Error ? error.message : "unknown"}`,
  );
}

// ─── Check 4: Harness template ───────────────────────────────────────────────

console.log("\n--- Check 4: Harness template ---");

try {
  const { getHarnessTemplate, HarnessTemplateSchema } =
    await import("../packages/luca-framework/src/utils/harness-templates");

  const harness = getHarnessTemplate("node-ts");

  recordCheck(
    "Harness template returns valid object",
    HarnessTemplateSchema.safeParse(harness).success,
    `${harness.checks.length} checks generated`,
  );

  recordCheck(
    "Has 4 check types",
    harness.checks.length === 4,
    `Expected 4, got ${harness.checks.length}`,
  );

  const checkNames: string[] = harness.checks.map((c) => c.name);
  const expectedNames = ["test", "typecheck", "lint", "build"];
  const hasAllNames = expectedNames.every((n) => checkNames.includes(n));
  recordCheck(
    "All check types present",
    hasAllNames,
    hasAllNames
      ? "test, typecheck, lint, build"
      : `Missing: ${expectedNames.filter((n) => !checkNames.includes(n)).join(", ")}`,
  );

  const testCheck = harness.checks.find((c) => c.name === "test");
  const typecheckCheck = harness.checks.find((c) => c.name === "typecheck");

  recordCheck(
    "Test check enabled for node-ts",
    testCheck?.enabled === true,
    testCheck?.enabled
      ? `Command: ${testCheck.command}`
      : "test check not enabled",
  );

  recordCheck(
    "Typecheck enabled for node-ts",
    typecheckCheck?.enabled === true,
    typecheckCheck?.enabled
      ? `Command: ${typecheckCheck.command}`
      : "typecheck not enabled",
  );

  // Verify unknown stack has all disabled
  const unknownHarness = getHarnessTemplate("unknown");
  const allDisabled = unknownHarness.checks.every((c) => !c.enabled);
  recordCheck(
    "Unknown stack all disabled",
    allDisabled,
    allDisabled
      ? "All checks disabled for unknown stack"
      : "Some checks unexpectedly enabled for unknown stack",
  );

  // Verify JS stack has typecheck disabled
  const jsHarness = getHarnessTemplate("node");
  const typecheckDisabled =
    jsHarness.checks.find((c) => c.name === "typecheck")?.enabled === false;
  recordCheck(
    "JS stack typecheck disabled",
    typecheckDisabled,
    typecheckDisabled
      ? "Typecheck correctly disabled for node stack"
      : "Typecheck unexpectedly enabled for node stack",
  );
} catch (error) {
  recordCheck(
    "Harness template",
    false,
    `Import failed: ${error instanceof Error ? error.message : "unknown"}`,
  );
}

// ─── Check 5: Settings merger dry-run ────────────────────────────────────────

console.log("\n--- Check 5: Settings merger dry-run ---");

try {
  const { computeMergeActions } =
    await import("../packages/luca-framework/src/utils/settings-merger");

  // Mock existing settings (empty hooks)
  const existing: Record<string, unknown> = {
    hooks: {},
  };

  // Mock proposed hooks (one simple hook)
  const proposed: Record<string, unknown> = {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: '"~/.claude/hooks/session-start.sh"',
            timeout: 15,
          },
        ],
      },
    ],
  };

  const knownScripts = new Set(["session-start.sh"]);
  const actions = computeMergeActions(existing, proposed, knownScripts);

  recordCheck(
    "Merge actions computed",
    actions.length > 0,
    `${actions.length} action(s) computed`,
  );

  const hasAutoMerge = actions.some((a) => a.type === "auto-merge");
  recordCheck(
    "New slot triggers auto-merge",
    hasAutoMerge,
    hasAutoMerge ? "auto-merge for new slot" : "Expected auto-merge not found",
  );

  const hasNoConflicts = actions.every((a) => a.type !== "conflict");
  recordCheck(
    "No unexpected conflicts",
    hasNoConflicts,
    hasNoConflicts
      ? "No conflicts in clean merge"
      : "Unexpected conflicts found",
  );
} catch (error) {
  recordCheck(
    "Settings merger",
    false,
    `Import failed: ${error instanceof Error ? error.message : "unknown"}`,
  );
}

// ─── Check 6: Config template renders valid JSON ─────────────────────────────

console.log("\n--- Check 6: Config template ---");

try {
  const templatePath = resolve(
    "packages/luca-framework/templates/base/.planning/config.json",
  );

  recordCheck(
    "Base config template exists",
    existsSync(templatePath),
    existsSync(templatePath)
      ? `Found at ${templatePath}`
      : "Template file not found",
  );

  if (existsSync(templatePath)) {
    const content = await Bun.file(templatePath).text();

    // Verify it contains EJS template tags (it's a template, not final JSON)
    const hasEjsTags = content.includes("<%=");
    recordCheck(
      "Template contains EJS tags",
      hasEjsTags,
      hasEjsTags ? "EJS template syntax detected" : "No EJS tags found",
    );

    // Render the template with mock values to verify it produces valid JSON
    const { processTemplate } =
      await import("../packages/luca-framework/src/utils/template");
    const { createBrandingContext } =
      await import("../packages/luca-framework/src/utils/branding");

    const mockConfig = {
      branding: {
        frameworkName: "Luca",
        commandPrefix: "lu",
        ticketPattern: "[A-Z]+-\\d+",
        placeholderTicket: "PROJ-0000",
      },
      stack: "node-ts",
      workTracker: "github",
    };

    const context = {
      ...createBrandingContext(mockConfig.branding),
      config: mockConfig,
    };

    const rendered = await processTemplate(content, context);

    let parsedConfig: Record<string, unknown> | null = null;
    try {
      parsedConfig = JSON.parse(rendered);
    } catch {
      // Parse failed
    }

    recordCheck(
      "Rendered template is valid JSON",
      parsedConfig !== null,
      parsedConfig !== null
        ? `${Object.keys(parsedConfig).length} top-level keys`
        : "Rendered template is not valid JSON",
    );

    if (parsedConfig) {
      recordCheck(
        "Rendered config has stack field",
        typeof parsedConfig.stack === "string",
        `stack: ${parsedConfig.stack}`,
      );
    }
  }
} catch (error) {
  recordCheck(
    "Config template",
    false,
    `Error: ${error instanceof Error ? error.message : "unknown"}`,
  );
}

// ─── Check 7: Hook dedup coverage ────────────────────────────────────────────

console.log("\n--- Check 7: Hook dedup coverage ---");

try {
  const hooksDir = resolve("src/hooks/scripts");
  const hookFiles = readdirSync(hooksDir).filter((f) => f.endsWith(".ts"));

  // statusline.ts is exempt: it's a status line command, not a lifecycle hook
  const DEDUP_EXEMPTIONS = new Set(["statusline.ts"]);

  let allHaveDedup = true;
  const missing: string[] = [];

  for (const hookFile of hookFiles) {
    if (DEDUP_EXEMPTIONS.has(hookFile)) continue;

    const content = await Bun.file(join(hooksDir, hookFile)).text();
    const hasGuardDedup = content.includes("guardDedup(");

    if (!hasGuardDedup) {
      allHaveDedup = false;
      missing.push(hookFile);
    }
  }

  recordCheck(
    "All hook scripts checked",
    hookFiles.length >= 14,
    `${hookFiles.length} hook scripts found (${DEDUP_EXEMPTIONS.size} exempted)`,
  );

  recordCheck(
    "All non-exempt hooks have guardDedup",
    allHaveDedup,
    allHaveDedup
      ? `${hookFiles.length - DEDUP_EXEMPTIONS.size} hooks protected`
      : `Missing guardDedup: ${missing.join(", ")}`,
  );
} catch (error) {
  recordCheck(
    "Hook dedup coverage",
    false,
    `Error: ${error instanceof Error ? error.message : "unknown"}`,
  );
}

// ─── Check 8: Doctor check registry ──────────────────────────────────────────

console.log("\n--- Check 8: Doctor check registry ---");

try {
  const checks =
    await import("../packages/luca-framework/src/utils/doctor/checks/index");

  const checkNames = Object.keys(checks);

  recordCheck(
    "Doctor checks importable",
    checkNames.length > 0,
    `${checkNames.length} checks exported`,
  );

  // Verify expected check names are present
  const expectedChecks = [
    "bunRuntimeCheck",
    "configValidationCheck",
    "globalArtifactsCheck",
    "frameworkRuntimeCheck",
    "muninndbHealthCheck",
    "harnessInstallationCheck",
    "driftDetectionCheck",
    "projectContextCheck",
  ];

  const missingChecks = expectedChecks.filter(
    (name) => !checkNames.includes(name),
  );
  const allPresent = missingChecks.length === 0;

  recordCheck(
    "All expected doctor checks present",
    allPresent,
    allPresent
      ? `${expectedChecks.length} expected checks found`
      : `Missing: ${missingChecks.join(", ")}`,
  );

  // Verify each check has a run() method (DoctorCheck interface compliance)
  let allCallable = true;
  for (const name of expectedChecks) {
    const check = (checks as Record<string, unknown>)[name] as
      | { run?: unknown }
      | undefined;
    if (!check || typeof check.run !== "function") {
      allCallable = false;
    }
  }

  recordCheck(
    "All checks have run() method",
    allCallable,
    allCallable
      ? "All checks implement DoctorCheck interface"
      : "Some checks missing run() method",
  );
} catch (error) {
  recordCheck(
    "Doctor check registry",
    false,
    `Import failed: ${error instanceof Error ? error.message : "unknown"}`,
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(60));

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
const total = results.length;

console.log(`Results: ${passed}/${total} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\nFailed checks:");
  for (const r of results.filter((r) => !r.passed)) {
    console.log(`  - ${r.name}: ${r.message}`);
  }
  console.log("");
  process.exit(1);
} else {
  console.log("\nAll checks passed.");
  process.exit(0);
}
