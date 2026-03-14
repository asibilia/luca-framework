/**
 * session-start — Initialize .planning/ directory for Luca.
 *
 * Creates .planning/ directory with STATE.md, ROADMAP.md, and config.json
 * on first session. Subsequent sessions only create missing files
 * (validate & repair mode). Also handles session lock, state machine init,
 * stale session detection, and environment variable export.
 *
 * Always exits 0 — session start should never block.
 *
 * @module session-start
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  statSync,
} from "fs";
import { join } from "path";

import {
  guardDedup,
  drainStdin,
  emitResult,
  exitSuccess,
  projectDir,
  isClaude,
} from "./_lib/hook-io.ts";
import { runBridge } from "./_lib/bridge.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("session-start");

// ─── Default Templates ───────────────────────────────────────────────────────

const DEFAULT_STATE_MD = `# Project State

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
Stopped at: N/A`;

const DEFAULT_ROADMAP_MD = `# Roadmap

## Overview

[Project roadmap -- run /lu to begin planning]

## Phases

No phases defined yet.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| -     | -              | -      | -         |`;

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Consume stdin (standard pattern)
  await drainStdin();

  const pd = projectDir();
  const planningDir = join(pd, ".planning");

  // Step 1: Check bun availability
  const bunCheck = Bun.spawnSync(["which", "bun"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (bunCheck.exitCode !== 0) {
    emitResult({
      systemMessage:
        "[Luca] Bun is not installed. Luca hooks require Bun for JSON parsing and build commands. Install from https://bun.sh",
    });
    return exitSuccess();
  }

  // Step 2: Create .planning/ directory if missing
  mkdirSync(join(planningDir, "notes", "done"), { recursive: true });

  let created = "";

  // Step 3: Create STATE.md if missing
  if (!existsSync(join(planningDir, "STATE.md"))) {
    writeFileSync(join(planningDir, "STATE.md"), DEFAULT_STATE_MD + "\n");
    created += "STATE.md ";
  }

  // Step 3d: Create ROADMAP.md if missing
  if (!existsSync(join(planningDir, "ROADMAP.md"))) {
    writeFileSync(join(planningDir, "ROADMAP.md"), DEFAULT_ROADMAP_MD + "\n");
    created += "ROADMAP.md ";
  }

  // Step 3e: Initialize state machine (via cascading bridge lookup)
  const stateJsonPath = join(planningDir, "state.json");

  if (existsSync(stateJsonPath)) {
    // State exists — check age to decide resume vs reinit
    try {
      const mtime = statSync(stateJsonPath).mtimeMs;
      const now = Date.now();
      const ageSeconds = (now - mtime) / 1000;

      if (ageSeconds < 86400) {
        // Fresh enough — resume (regenerate snapshot)
        await runBridge(["snapshot"]);
      } else {
        // Stale — reinitialize
        await runBridge(["ensure-init", "--force"]);
        created += "state.json ";
      }
    } catch {
      await runBridge(["snapshot"]);
    }
  } else {
    // No state.json — initialize fresh
    await runBridge(["ensure-init"]);
    if (existsSync(stateJsonPath)) {
      created += "state.json ";
    }
  }

  // Step 3f: Check for stale session-end marker
  const sessionEndMarker = join(planningDir, ".session-end-marker.json");
  let staleSessionMsg = "";
  if (existsSync(sessionEndMarker)) {
    try {
      const marker = JSON.parse(await Bun.file(sessionEndMarker).text());
      if (marker.cleanup_pending) {
        staleSessionMsg = `Stale session detected (ended: ${marker.ended_at || "unknown"}). MuninnDB cleanup will run during cognitive pre-flight.`;
      }
    } catch {
      // marker unreadable — skip
    }
    // Remove marker after reading
    try {
      unlinkSync(sessionEndMarker);
    } catch {
      // best-effort
    }
  }

  // Step 4: Detect runtime
  const runtime = "bun"; // We're running in bun (checked above)

  // Step 5: Create or update config.json
  const configPath = join(planningDir, "config.json");
  if (!existsSync(configPath)) {
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
        formatter: "bunx --bun prettier --write",
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
        typeChecker: "bunx --bun tsc --noEmit",
        typeCheckExtensions: [".ts", ".tsx"],
        preCommitChecks: ["bun test", "bunx --bun tsc --noEmit"],
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
            command: "bun test",
            enabled: true,
            timeout: 120,
            parser: "bun-test",
          },
          {
            name: "typecheck",
            command: "bunx --bun tsc --noEmit",
            enabled: true,
            timeout: 60,
            parser: "tsc",
          },
          {
            name: "lint",
            command: "bunx --bun eslint . --format json",
            enabled: false,
            timeout: 60,
            parser: "eslint",
          },
          {
            name: "build",
            command: "bun run check:drift",
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
            recallDepth: 1,
          },
          SIMPLE: {
            cognitivePreflight: "lite",
            planVerificationIterations: 1,
            harnessFixIterations: 2,
            verifyFixIterations: 1,
            verificationMode: "quick",
            recallDepth: 1,
          },
          MODERATE: {
            cognitivePreflight: "full",
            planVerificationIterations: 1,
            harnessFixIterations: 2,
            verifyFixIterations: 1,
            verificationMode: "standard",
            recallDepth: 3,
          },
          COMPLEX: {
            cognitivePreflight: "full",
            planVerificationIterations: 2,
            harnessFixIterations: 2,
            verifyFixIterations: 1,
            verificationMode: "full",
            recallDepth: null,
          },
          CRITICAL: {
            cognitivePreflight: "full",
            planVerificationIterations: 3,
            harnessFixIterations: 3,
            verifyFixIterations: 2,
            verificationMode: "full+human",
            recallDepth: null,
          },
        },
      },
      dogfood: {
        enabled: false,
        source: "src/",
        outputs: [".claude/"],
        build_command: "bun run build:all",
        lock_file: ".claude/.session-lock",
        manifest_file: ".claude/.build-manifest.json",
      },
      muninn: {
        vault: "default",
      },
    };

    await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
    created += "config.json ";
  } else {
    // config.json exists — update runtime field only
    try {
      const cfg = JSON.parse(await Bun.file(configPath).text());
      cfg.runtime = runtime;
      await Bun.write(configPath, JSON.stringify(cfg, null, 2) + "\n");
    } catch {
      // Can't update config — skip
    }
  }

  // Step 6: Write environment variables for the session (if supported)
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (envFile) {
    try {
      const envLines =
        [
          `export LUCA_RUNTIME=${runtime}`,
          `export LUCA_PLANNING_DIR=${planningDir}`,
          `export LUCA_SESSION_ACTIVE=1`,
        ].join("\n") + "\n";
      const { appendFileSync } = require("fs");
      appendFileSync(envFile, envLines);
    } catch {
      // Env file write failed — non-critical
    }
  }

  // Step 7b: Check for stale session lock (older than 2 hours = crashed session)
  const sessionLock = join(pd, ".claude", ".session-lock");
  if (existsSync(sessionLock)) {
    try {
      const lockMtime = statSync(sessionLock).mtimeMs;
      const now = Date.now();
      const lockAge = (now - lockMtime) / 1000;
      if (lockAge > 7200) {
        unlinkSync(sessionLock);
      }
    } catch {
      // Can't check lock — skip
    }
  }

  // Step 8: Create session lock file (with build manifest snapshot)
  try {
    const manifestPath = join(pd, ".claude", ".build-manifest.json");
    let buildManifestAt: string | null = null;
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(await Bun.file(manifestPath).text());
        buildManifestAt = manifest.built_at ?? null;
      } catch {
        // No manifest or parse error
      }
    }

    const lockPayload = {
      created_at: new Date().toISOString(),
      pid: process.pid,
      build_manifest_at: buildManifestAt,
    };

    // Ensure .claude/ directory exists
    mkdirSync(join(pd, ".claude"), { recursive: true });
    await Bun.write(sessionLock, JSON.stringify(lockPayload, null, 2) + "\n");
  } catch {
    // Lock creation failed — non-critical
  }

  // Step 8b: Check for pending developer notes
  let notesMsg = "";
  const notesDir = join(planningDir, "notes");
  if (existsSync(notesDir)) {
    try {
      const pendingNotes = readdirSync(notesDir).filter((f) =>
        f.endsWith(".md"),
      ).length;
      if (pendingNotes > 0) {
        notesMsg = ` ${pendingNotes} developer note(s) pending.`;
      }
    } catch {
      // notes dir not readable
    }
  }

  // Step 9: Output summary if anything was created or there are notes/stale sessions
  if (created.trim()) {
    const files = created.trim().split(" ").filter(Boolean);
    const msgText = `[Luca] Initialized .planning/ directory. Created: ${files.join(", ")}${notesMsg}${staleSessionMsg ? " " + staleSessionMsg : ""}`;
    if (isClaude()) {
      emitResult({ systemMessage: msgText });
    } else {
      process.stdout.write(JSON.stringify({ followup_message: msgText }));
    }
  } else if (notesMsg || staleSessionMsg) {
    const msgText = `[Luca]${notesMsg}${staleSessionMsg ? " " + staleSessionMsg : ""}`;
    if (isClaude()) {
      emitResult({ systemMessage: msgText });
    } else {
      process.stdout.write(JSON.stringify({ followup_message: msgText }));
    }
  }

  return exitSuccess();
};

await main();
