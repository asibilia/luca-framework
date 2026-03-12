/**
 * Session initialization logic for Pi extensions.
 *
 * Extracted from session-start.sh (~475 lines of shell). Creates the
 * .planning/ directory with STATE.md, ROADMAP.md, config.json, and
 * session lock. Subsequent sessions only create missing files
 * (validate & repair mode).
 *
 * NOTE: Memory files (BRAIN.md, MEMORY.md, WORKING.md) are no longer
 * created here. Long-term memory is handled by MuninnDB MCP.
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
 * Ensure .planning/ directory exists and create missing planning files.
 *
 * @param cwd - Project root directory
 * @returns List of created file names
 */
export function ensurePlanningDir(cwd: string): string[] {
  const planningDir = join(cwd, ".planning");
  mkdirSync(planningDir, { recursive: true });
  return createPlanningFiles(planningDir);
}

/**
 * Create missing planning files (STATE.md, ROADMAP.md).
 *
 * Only creates files that don't already exist.
 * NOTE: Memory files (MEMORY.md, WORKING.md, BRAIN.md) are no longer
 * created here. Long-term memory is handled by MuninnDB MCP.
 *
 * @param planningDir - Path to .planning/ directory
 * @returns List of created file names
 */
export function createPlanningFiles(planningDir: string): string[] {
  const created: string[] = [];

  const files: Array<{ name: string; content: string }> = [
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
          planVerificationIterations: 1,
          harnessFixIterations: 1,
          verifyFixIterations: 1,
          verificationMode: "quick",
        },
        SIMPLE: {
          cognitivePreflight: "lite",
          planVerificationIterations: 1,
          harnessFixIterations: 2,
          verifyFixIterations: 1,
          verificationMode: "quick",
        },
        MODERATE: {
          cognitivePreflight: "full",
          planVerificationIterations: 1,
          harnessFixIterations: 2,
          verifyFixIterations: 1,
          verificationMode: "standard",
        },
        COMPLEX: {
          cognitivePreflight: "full",
          planVerificationIterations: 2,
          harnessFixIterations: 2,
          verifyFixIterations: 1,
          verificationMode: "full",
        },
        CRITICAL: {
          cognitivePreflight: "full",
          planVerificationIterations: 3,
          harnessFixIterations: 3,
          verifyFixIterations: 2,
          verificationMode: "full+human",
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
 * Check if a process with the given PID is still running.
 *
 * Uses process.kill(pid, 0) which sends no signal but errors
 * if the process does not exist.
 *
 * @param pid - Process ID to check
 * @returns true if the process is running, false otherwise
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up stale session lock if the owning process is no longer running.
 *
 * Reads the lock file, checks the PID, and removes the lock if the
 * process has exited. Also removes locks older than 12 hours regardless
 * of PID status (safety net for zombie detection edge cases).
 *
 * @param cwd - Project root directory
 * @returns Warning message if a stale lock was cleaned, empty string otherwise
 */
export function cleanupStaleLock(cwd: string): string {
  const lockPath = join(cwd, ".claude", ".session-lock");
  if (!existsSync(lockPath)) return "";

  try {
    const raw = readFileSync(lockPath, "utf-8");
    const lockData = JSON.parse(raw);
    const pid = lockData.pid as number | undefined;
    const createdAt = lockData.created_at
      ? new Date(lockData.created_at)
      : null;

    // Check age — auto-remove locks older than 12 hours
    if (createdAt) {
      const hoursOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursOld > 12) {
        unlinkSync(lockPath);
        return `[Luca] Removed stale session lock (${Math.round(hoursOld)}h old)`;
      }
    }

    // Check PID — auto-remove if owning process is no longer running
    if (pid && !isProcessRunning(pid)) {
      unlinkSync(lockPath);
      return `[Luca] Removed stale session lock (PID ${pid} no longer running)`;
    }
  } catch {
    // Lock file is malformed or unreadable — remove it as stale
    try {
      unlinkSync(lockPath);
      return "[Luca] Removed malformed session lock file";
    } catch {
      // Cannot remove — best effort
    }
  }

  return "";
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

  // Step 0: Clean up stale session locks from crashed sessions
  const staleLockMsg = cleanupStaleLock(cwd);
  if (staleLockMsg) {
    warnings.push(staleLockMsg);
  }

  // Step 1: Create .planning/ and missing planning files (STATE.md, ROADMAP.md)
  const planningFiles = ensurePlanningDir(cwd);
  created.push(...planningFiles);

  // Step 2: Initialize state machine
  const stateResult = initStateMachine(cwd);
  if (stateResult) created.push(stateResult);

  // Step 3: Detect runtime and write config
  const runtime = "bun"; // Pi extensions always have bun available in this monorepo
  const configResult = detectAndWriteConfig(cwd, runtime);
  if (configResult) created.push(configResult);

  // Step 4: Create session lock
  createSessionLock(cwd);

  return { created, warnings };
}
