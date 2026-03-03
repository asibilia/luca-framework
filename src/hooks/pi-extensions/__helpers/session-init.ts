/**
 * Session initialization logic for Pi extensions.
 *
 * Extracted from session-start.sh (~475 lines of shell). Creates the
 * .planning/ directory with BRAIN.md, MEMORY.md, WORKING.md, STATE.md,
 * ROADMAP.md, config.json, and session lock. Subsequent sessions only
 * create missing files (validate & repair mode).
 *
 * All APIs are node:fs — Pi runs on Node.js, not Bun.
 *
 * Source: src/hooks/pi-extensions/__helpers/session-init.ts
 * Deployed to: .pi/extensions/__helpers/session-init.ts
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { runShellCommand } from "./exec";

/** Result of session initialization. */
export interface SessionInitResult {
  /** Files that were created during init. */
  created: string[];
  /** Warning messages to surface. */
  warnings: string[];
}

/**
 * Ensure .planning/ directory exists and create missing memory files.
 *
 * @param cwd - Project root directory
 * @returns List of created file names
 */
export function ensurePlanningDir(cwd: string): string[] {
  const planningDir = join(cwd, ".planning");
  mkdirSync(planningDir, { recursive: true });
  return createMemoryFiles(planningDir);
}

/**
 * Create missing memory files (MEMORY.md, WORKING.md, STATE.md, ROADMAP.md).
 *
 * Only creates files that don't already exist.
 *
 * @param planningDir - Path to .planning/ directory
 * @returns List of created file names
 */
export function createMemoryFiles(planningDir: string): string[] {
  const created: string[] = [];

  const files: Array<{ name: string; content: string }> = [
    {
      name: "MEMORY.md",
      content: `# Luca Memory

> Long-term learning storage. Updated after verified work.

## Patterns

<!-- Validated approaches that work -->

## Decisions

<!-- Past choices with rationale -->

## Pitfalls

<!-- Known issues to avoid -->

## Preferences

<!-- User and project preferences -->

---

*Luca Memory initialized*
`,
    },
    {
      name: "WORKING.md",
      content: `# Luca Working Memory

> Active session memory. Cleared after learning extraction.

## Current Context

- **Task:** None
- **Started:** N/A

## Findings

<!-- Immediate discoveries -->

## Hypotheses

<!-- For debugging -->

## Candidate Learnings

<!-- To be verified before committing to MEMORY.md -->

---

*Luca Working Memory initialized*
`,
    },
    {
      name: "STATE.md",
      content: `# Project State

## Current Position

Phase: None
Plan: None
Status: Not started
Last activity: N/A

## Accumulated Context

### Decisions

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: N/A
Stopped at: N/A
`,
    },
    {
      name: "ROADMAP.md",
      content: `# Roadmap

## Overview

[Project roadmap -- run /lu to begin planning]

## Phases

No phases defined yet.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| -     | -              | -      | -         |
`,
    },
  ];

  for (const file of files) {
    const filePath = join(planningDir, file.name);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, file.content, "utf-8");
      created.push(file.name);
    }
  }

  return created;
}

/**
 * Initialize or refresh the state machine via the bridge CLI.
 *
 * Uses cascading bridge lookup: installed binary → monorepo source.
 * If state.json exists and is < 24h old, runs snapshot (resume).
 * Otherwise, runs ensure-init (fresh start).
 *
 * @param cwd - Project root directory
 * @returns "state.json" if freshly created, empty string otherwise
 */
export function initStateMachine(cwd: string): string {
  const stateJsonPath = join(cwd, ".planning", "state.json");
  const bridgePath = join(
    cwd,
    "packages",
    "luca-framework",
    "src",
    "state",
    "bridge.ts",
  );

  // Determine bridge command
  let bridgeCmd: string | null = null;
  try {
    const whichResult = runShellCommand("command -v luca-bridge", {
      cwd,
      timeout: 5,
    });
    if (whichResult.passed) {
      bridgeCmd = "luca-bridge";
    }
  } catch {
    // not found
  }

  if (!bridgeCmd && existsSync(bridgePath)) {
    bridgeCmd = `bun run "${bridgePath}"`;
  }

  if (!bridgeCmd) return "";

  if (existsSync(stateJsonPath)) {
    // Check age
    try {
      const mtime = statSync(stateJsonPath).mtimeMs;
      const ageSeconds = (Date.now() - mtime) / 1000;

      if (ageSeconds < 86400) {
        // Fresh enough — resume via snapshot
        runShellCommand(`${bridgeCmd} snapshot`, { cwd, timeout: 10 });
        return "";
      }
    } catch {
      // stat failed — reinit
    }

    // Stale — reinitialize
    runShellCommand(`${bridgeCmd} ensure-init --force`, { cwd, timeout: 10 });
    return "state.json";
  }

  // No state.json — initialize fresh
  runShellCommand(`${bridgeCmd} ensure-init`, { cwd, timeout: 10 });
  return "state.json";
}

/**
 * Detect runtime and create/update config.json.
 *
 * Creates a full config on first run. On subsequent runs, only updates
 * the runtime field.
 *
 * @param cwd - Project root directory
 * @param runtime - Detected runtime ("bun" or "node")
 * @returns "config.json" if freshly created, empty string otherwise
 */
export function detectAndWriteConfig(cwd: string, runtime: string): string {
  const configPath = join(cwd, ".planning", "config.json");

  if (existsSync(configPath)) {
    // Update runtime field only
    try {
      const raw = readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      config.runtime = runtime;
      writeFileSync(
        configPath,
        JSON.stringify(config, null, 2) + "\n",
        "utf-8",
      );
    } catch {
      // parse error — leave as-is
    }
    return "";
  }

  // Create full config
  const isBun = runtime === "bun";
  const config = {
    mode: "interactive",
    depth: "standard",
    model_profile: "balanced",
    runtime,
    cognitive: {
      enabled: true,
      memory_recall: true,
      working_memory: true,
      intuition_check: true,
      routing: "auto",
    },
    workflow: {
      research: true,
      plan_check: true,
      verifier: true,
      code_review: true,
      uat_required: true,
      always_verify: true,
      capture_learnings: true,
    },
    planning: {
      commit_docs: true,
      search_gitignored: false,
    },
    parallelization: {
      enabled: true,
      plan_level: true,
      task_level: false,
      skip_checkpoints: true,
      max_concurrent_agents: 3,
      min_plans_for_parallel: 2,
    },
    gates: {
      confirm_project: true,
      confirm_phases: true,
      confirm_roadmap: true,
      confirm_breakdown: true,
      confirm_plan: true,
      execute_next_plan: true,
      issues_review: true,
      confirm_transition: true,
    },
    safety: {
      always_confirm_destructive: true,
      always_confirm_external_services: true,
    },
    hooks: {
      enabled: true,
      formatter: isBun ? "bunx --bun prettier --write" : "npx prettier --write",
      formatterExtensions: [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".css",
        ".json",
        ".md",
        ".yaml",
        ".yml",
        ".html",
      ],
      typeChecker: isBun ? "bunx --bun tsc --noEmit" : "npx tsc --noEmit",
      typeCheckExtensions: [".ts", ".tsx"],
      preCommitChecks: isBun
        ? ["bun test", "bunx --bun tsc --noEmit"]
        : ["npm test", "npx tsc --noEmit"],
      commitPatterns: ["git commit", "git merge", "bun run commit"],
      contextThresholds: { warn: 100000, alert: 200000, critical: 300000 },
    },
    harness: {
      enabled: true,
      maxFixIterations: 3,
      failFast: false,
      checks: [
        {
          name: "test",
          command: isBun ? "bun test" : "npm test",
          enabled: true,
          timeout: 120,
          parser: "bun-test",
        },
        {
          name: "typecheck",
          command: isBun ? "bunx --bun tsc --noEmit" : "npx tsc --noEmit",
          enabled: true,
          timeout: 60,
          parser: "tsc",
        },
        {
          name: "lint",
          command: isBun
            ? "bunx --bun eslint . --format json"
            : "npx eslint . --format json",
          enabled: false,
          timeout: 60,
          parser: "eslint",
        },
        {
          name: "build",
          command: isBun ? "bun run check:drift" : "npm run check:drift",
          enabled: false,
          timeout: 120,
          parser: "generic",
        },
      ],
    },
    complexity: {
      defaultLevel: "auto",
      matrix: {
        TRIVIAL: {
          cognitivePreflight: "lite",
          research: "skip",
          discussion: "skip",
          planVerificationIterations: 0,
          harnessFixIterations: 1,
          verificationMode: "quick",
          codeReviewAgents: [],
          uat: "skip",
          learningCapture: "skip",
        },
        SIMPLE: {
          cognitivePreflight: "lite",
          research: "skip",
          discussion: "skip",
          planVerificationIterations: 0,
          harnessFixIterations: 2,
          verificationMode: "quick",
          codeReviewAgents: [],
          uat: "skip",
          learningCapture: "brief",
        },
        MODERATE: {
          cognitivePreflight: "full",
          research: "optional",
          discussion: "optional",
          planVerificationIterations: 1,
          harnessFixIterations: 2,
          verificationMode: "standard",
          codeReviewAgents: ["dx-advocate", "code-simplifier"],
          uat: "optional",
          learningCapture: "standard",
        },
        COMPLEX: {
          cognitivePreflight: "full",
          research: "required",
          discussion: "run",
          planVerificationIterations: 2,
          harnessFixIterations: 2,
          verificationMode: "full",
          codeReviewAgents: [
            "dx-advocate",
            "code-simplifier",
            "code-architect",
            "tailwind-auditor",
          ],
          uat: "required",
          learningCapture: "full",
        },
        CRITICAL: {
          cognitivePreflight: "full",
          research: "required",
          discussion: "required",
          planVerificationIterations: 3,
          harnessFixIterations: 3,
          verificationMode: "full+human",
          codeReviewAgents: [
            "dx-advocate",
            "code-simplifier",
            "code-architect",
            "tailwind-auditor",
            "security-auditor",
          ],
          uat: "required+thorough",
          learningCapture: "full+debrief",
        },
      },
    },
    dogfood: {
      enabled: false,
      source: "src/",
      outputs: [".claude/", ".cursor/"],
      build_command: isBun ? "bun run build:all" : "npm run build:all",
      lock_file: ".claude/.session-lock",
      manifest_file: ".claude/.build-manifest.json",
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return "config.json";
}

/**
 * Auto-detect project info and create BRAIN.md if missing.
 *
 * Reads package.json to detect language, framework, test runner,
 * build tool, and styling approach.
 *
 * @param cwd - Project root directory
 * @returns "BRAIN.md" if created, empty string otherwise
 */
export function autoDetectBrainMd(cwd: string): string {
  const brainPath = join(cwd, ".planning", "BRAIN.md");
  if (existsSync(brainPath)) return "";

  let name = "Project";
  let description = "[What this project does -- customize this]";
  let language = "[Primary language]";
  let framework = "[Framework]";
  let testing = "[Test framework]";
  let buildTool = "[Build tool]";
  let styling = "[Styling approach]";

  try {
    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) name = pkg.name;
      if (pkg.description) description = pkg.description;

      const deps: Record<string, string> = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      // Language detection
      const hasTsConfig = existsSync(join(cwd, "tsconfig.json"));
      language = deps.typescript || hasTsConfig ? "TypeScript" : "JavaScript";

      // Framework detection
      if (deps.next) framework = "Next.js";
      else if (deps.react) framework = "React";
      else if (deps.vue) framework = "Vue";
      else if (deps["@angular/core"]) framework = "Angular";
      else if (deps.svelte) framework = "Svelte";
      else if (deps.hono) framework = "Hono";
      else if (deps.express) framework = "Express";
      else if (deps.fastify) framework = "Fastify";
      else framework = "Node.js";

      // Test framework detection
      if (deps.vitest) testing = "Vitest";
      else if (deps.jest) testing = "Jest";
      else if (deps["@testing-library/react"] || deps["@testing-library/vue"])
        testing = "Testing Library";
      else testing = "bun:test";

      // Build tool detection
      if (deps.vite) buildTool = "Vite";
      else if (deps.webpack) buildTool = "Webpack";
      else if (deps.esbuild) buildTool = "esbuild";
      else if (deps.turbo || deps.turbopack) buildTool = "Turbopack";
      else {
        const hasBunfig = existsSync(join(cwd, "bunfig.toml"));
        buildTool = hasBunfig ? "Bun" : "[Build tool]";
      }

      // Styling detection
      if (deps.tailwindcss) styling = "Tailwind CSS";
      else if (deps["styled-components"]) styling = "styled-components";
      else if (deps["@emotion/react"] || deps["@emotion/styled"])
        styling = "Emotion";
      else if (deps.sass || deps["node-sass"]) styling = "Sass/SCSS";
    }
  } catch {
    // No package.json or parse error — use defaults
  }

  const content = `# Luca Brain

> Project identity and conventions. Loaded at session start.

## Project Identity

- **Name:** ${name}
- **Domain:** ${description}
- **Purpose:** [Why it exists -- customize this]

## Stack

- **Language:** ${language}
- **Framework:** ${framework}
- **Build:** ${buildTool}
- **Testing:** ${testing}
- **Styling:** ${styling}

## Architecture Patterns

[Describe key architectural decisions -- customize this]

## Code Conventions

[Add your code style preferences -- customize this]

## Development Preferences

- **Command Prefix:** /lu
- **Workflow:** Luca spec-driven development

---

*Luca Brain initialized (auto-detected from project files)*
`;

  writeFileSync(brainPath, content, "utf-8");
  return "BRAIN.md";
}

/**
 * Create the session lock file with build manifest snapshot.
 *
 * @param cwd - Project root directory
 */
export function createSessionLock(cwd: string): void {
  const lockDir = join(cwd, ".claude");
  mkdirSync(lockDir, { recursive: true });
  const lockPath = join(lockDir, ".session-lock");
  const manifestPath = join(lockDir, ".build-manifest.json");

  let buildManifestAt: string | null = null;
  try {
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      buildManifestAt = manifest.built_at ?? null;
    }
  } catch {
    // No manifest or parse error
  }

  const payload = {
    created_at: new Date().toISOString(),
    pid: process.pid,
    build_manifest_at: buildManifestAt,
  };

  writeFileSync(lockPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
}

/**
 * Run the full session initialization sequence.
 *
 * Orchestrates all init steps in order. Returns a result with created
 * files and any warnings to surface to the user.
 *
 * @param cwd - Project root directory
 * @returns Session init result
 */
export function runSessionInit(cwd: string): SessionInitResult {
  const created: string[] = [];
  const warnings: string[] = [];

  // Step 1: Create .planning/ and missing memory files
  const memoryFiles = ensurePlanningDir(cwd);
  created.push(...memoryFiles);

  // Step 2: Initialize state machine
  const stateResult = initStateMachine(cwd);
  if (stateResult) created.push(stateResult);

  // Step 3: Detect runtime and write config
  const runtime = "bun"; // Pi extensions always have bun available in this monorepo
  const configResult = detectAndWriteConfig(cwd, runtime);
  if (configResult) created.push(configResult);

  // Step 4: Auto-detect and create BRAIN.md
  const brainResult = autoDetectBrainMd(cwd);
  if (brainResult) created.push(brainResult);

  // Step 5: Create session lock
  createSessionLock(cwd);

  return { created, warnings };
}
