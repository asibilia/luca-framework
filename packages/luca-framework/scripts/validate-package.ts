#!/usr/bin/env bun
/**
 * Validate that the built package is correct before publishing.
 *
 * Checks:
 * 1. bin/luca.js exists and starts with #!/usr/bin/env bun
 * 2. dist/index.mjs exists and contains the correct version string
 * 3. dist/index.mjs does NOT contain the stale "0.0.1" sentinel
 * 4. templates/ directory exists with expected subdirectories
 * 5. dist/plugin/ exists (from build:plugin)
 * 6. package.json version matches the version in dist output
 *
 * Usage: bun run scripts/validate-package.ts
 * Exit: 0 on all pass, 1 with details on failure
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkgDir = resolve(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf-8"));
const version: string = pkg.version;

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, fn: () => { passed: boolean; message: string }) {
  try {
    const result = fn();
    results.push({ name, ...result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, message: `Error: ${errorMessage}` });
  }
}

// Check 1: bin/luca.js shebang
check("bin/luca.js shebang", () => {
  const binPath = resolve(pkgDir, "bin", "luca.js");
  if (!existsSync(binPath)) {
    return { passed: false, message: "bin/luca.js does not exist" };
  }
  const content = readFileSync(binPath, "utf-8");
  if (!content.startsWith("#!/usr/bin/env bun")) {
    return {
      passed: false,
      message: `Expected shebang #!/usr/bin/env bun, got: ${content.split("\n")[0]}`,
    };
  }
  return { passed: true, message: "Correct shebang: #!/usr/bin/env bun" };
});

// Check 2: dist/index.mjs exists
check("dist/index.mjs exists", () => {
  const distPath = resolve(pkgDir, "dist", "index.mjs");
  if (!existsSync(distPath)) {
    return {
      passed: false,
      message: "dist/index.mjs does not exist. Run `bun run build` first.",
    };
  }
  return { passed: true, message: "dist/index.mjs exists" };
});

// Check 3: dist/index.mjs contains correct version
check("dist version matches package.json", () => {
  const distPath = resolve(pkgDir, "dist", "index.mjs");
  if (!existsSync(distPath)) {
    return { passed: false, message: "dist/index.mjs does not exist" };
  }
  const content = readFileSync(distPath, "utf-8");
  if (!content.includes(version)) {
    return {
      passed: false,
      message: `dist/index.mjs does not contain version "${version}"`,
    };
  }
  return {
    passed: true,
    message: `dist/index.mjs contains version "${version}"`,
  };
});

// Check 4: dist output does NOT contain stale "0.0.1"
check("no stale 0.0.1 version", () => {
  const distPath = resolve(pkgDir, "dist", "index.mjs");
  if (!existsSync(distPath)) {
    return { passed: false, message: "dist/index.mjs does not exist" };
  }
  const content = readFileSync(distPath, "utf-8");
  // Look for the specific hardcoded version pattern, not just any occurrence of 0.0.1
  if (
    content.includes('LUCA_VERSION = "0.0.1"') ||
    content.includes("LUCA_VERSION = '0.0.1'")
  ) {
    return {
      passed: false,
      message: 'dist/index.mjs still contains hardcoded LUCA_VERSION "0.0.1"',
    };
  }
  return { passed: true, message: "No stale 0.0.1 LUCA_VERSION found" };
});

// Check 5: templates/ directory with expected subdirs
check("templates/ directory structure", () => {
  const templatesDir = resolve(pkgDir, "templates");
  if (!existsSync(templatesDir)) {
    return { passed: false, message: "templates/ directory does not exist" };
  }
  const expectedSubdirs = ["base", "framework", "harness", "hooks", "stacks"];
  const missing = expectedSubdirs.filter(
    (d) => !existsSync(resolve(templatesDir, d)),
  );
  if (missing.length > 0) {
    return {
      passed: false,
      message: `Missing template subdirectories: ${missing.join(", ")}`,
    };
  }
  return {
    passed: true,
    message: `All template subdirectories present: ${expectedSubdirs.join(", ")}`,
  };
});

// Check 6: dist/plugin/ exists
check("dist/plugin/ exists", () => {
  const pluginDir = resolve(pkgDir, "dist", "plugin");
  if (!existsSync(pluginDir)) {
    return {
      passed: false,
      message: "dist/plugin/ does not exist. Run `bun run build:plugin` first.",
    };
  }
  return { passed: true, message: "dist/plugin/ exists" };
});

// Print results
console.log("\n=== Package Validation ===\n");
console.log(`Package: ${pkg.name}@${version}\n`);

let allPassed = true;
for (const result of results) {
  const icon = result.passed ? "PASS" : "FAIL";
  console.log(`  [${icon}] ${result.name}`);
  console.log(`         ${result.message}`);
  if (!result.passed) allPassed = false;
}

console.log("");

if (allPassed) {
  console.log("All checks passed. Package is ready to publish.");
  process.exit(0);
} else {
  console.error("Some checks failed. Fix issues before publishing.");
  process.exit(1);
}
