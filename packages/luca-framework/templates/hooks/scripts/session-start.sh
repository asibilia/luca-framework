#!/usr/bin/env bash
# session-start.sh -- Initialize .planning/ directory for Luca
#
# Hook event: SessionStart
# Type: Command hook (synchronous)
# Timeout: 15 seconds
#
# Creates .planning/ directory with STATE.md, ROADMAP.md, and config.json
# on first session. Subsequent sessions only create missing files
# (validate & repair mode).
#
# NOTE (v9.2.0): BRAIN.md, MEMORY.md, and WORKING.md creation removed.
# Project identity and session memory are now stored in MuninnDB.
# Run /seed-memory to bootstrap project identity into MuninnDB.
#
# config.json includes runtime detection (bun vs node).
#
# Uses `bun -e` for JSON parsing and file generation (project convention).

set -euo pipefail

# Read stdin JSON (standard hook pattern)
INPUT=$(cat)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
PLANNING_DIR="$PROJECT_DIR/.planning"

# Step 1: Check bun availability
if ! command -v bun &>/dev/null; then
  # Output systemMessage warning -- do not block session start
  printf '{"systemMessage":"[Luca] Bun is not installed. Luca hooks require Bun for JSON parsing and build commands. Install from https://bun.sh"}'
  exit 0
fi

# Step 2: Create .planning/ directory if missing
mkdir -p "$PLANNING_DIR"

CREATED=""

# Step 3a: MEMORY.md and WORKING.md creation removed.
# These files are sunset in favor of MuninnDB (muninn_remember / muninn_recall).
# Session context is now stored in MuninnDB under the repo vault.
# See: https://github.com/alecsibilia/luca-framework/discussions

# Step 3c: Create STATE.md if missing
if [ ! -f "$PLANNING_DIR/STATE.md" ]; then
  cat > "$PLANNING_DIR/STATE.md" << 'STATE_EOF'
# Project State

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
STATE_EOF
  CREATED="${CREATED}STATE.md "
fi

# Step 3d: Create ROADMAP.md if missing
if [ ! -f "$PLANNING_DIR/ROADMAP.md" ]; then
  cat > "$PLANNING_DIR/ROADMAP.md" << 'ROADMAP_EOF'
# Roadmap

## Overview

[Project roadmap -- run /lu to begin planning]

## Phases

No phases defined yet.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| -     | -              | -      | -         |
ROADMAP_EOF
  CREATED="${CREATED}ROADMAP.md "
fi

# Step 3e: Initialize state machine (if bridge exists)
STATE_JSON="$PLANNING_DIR/state.json"
# Resolve bridge: try installed package, then monorepo path
STATE_MACHINE_BRIDGE=$(node -e "console.log(require.resolve('@alecsibilia/luca-framework/state/bridge'))" 2>/dev/null || echo "packages/luca-framework/src/state/bridge.ts")

if [ -f "$STATE_MACHINE_BRIDGE" ]; then
  if [ -f "$STATE_JSON" ]; then
    # State exists -- check age to decide resume vs reinit
    # macOS stat -f "%m", Linux stat -c "%Y"
    STATE_MTIME=$(stat -f "%m" "$STATE_JSON" 2>/dev/null || stat -c "%Y" "$STATE_JSON" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    STATE_AGE=$((NOW - STATE_MTIME))

    if [ "$STATE_AGE" -lt 86400 ]; then
      # Fresh enough -- resume (regenerate snapshot)
      bun run "$STATE_MACHINE_BRIDGE" snapshot 2>/dev/null || true
    else
      # Stale -- reinitialize
      bun run "$STATE_MACHINE_BRIDGE" ensure-init --force 2>/dev/null || true
      CREATED="${CREATED}state.json "
    fi
  else
    # No state.json -- initialize fresh
    bun run "$STATE_MACHINE_BRIDGE" ensure-init 2>/dev/null || true
    CREATED="${CREATED}state.json "
  fi
fi

# Step 4: Detect runtime
if command -v bun &>/dev/null; then
  RUNTIME="bun"
else
  RUNTIME="node"
fi

# Step 5: Create or update config.json
if [ ! -f "$PLANNING_DIR/config.json" ]; then
  # Create full config with runtime field
  HOOK_PLANNING_DIR="$PLANNING_DIR" HOOK_RUNTIME="$RUNTIME" bun -e "
    const planningDir = process.env.HOOK_PLANNING_DIR;
    const runtime = process.env.HOOK_RUNTIME;
    const config = {
      mode: 'interactive',
      depth: 'standard',
      model_profile: 'balanced',
      runtime: runtime,
      cognitive: {
        enabled: true,
        memory_recall: true,
        working_memory: true,
        intuition_check: true,
        routing: 'auto'
      },
      workflow: {
        research: true,
        plan_check: true,
        verifier: true,
        code_review: true,
        uat_required: true,
        always_verify: true,
        capture_learnings: true
      },
      planning: {
        commit_docs: true,
        search_gitignored: false
      },
      parallelization: {
        enabled: true,
        plan_level: true,
        task_level: false,
        skip_checkpoints: true,
        max_concurrent_agents: 3,
        min_plans_for_parallel: 2
      },
      gates: {
        confirm_project: true,
        confirm_phases: true,
        confirm_roadmap: true,
        confirm_breakdown: true,
        confirm_plan: true,
        execute_next_plan: true,
        issues_review: true,
        confirm_transition: true
      },
      safety: {
        always_confirm_destructive: true,
        always_confirm_external_services: true
      },
      hooks: {
        enabled: true,
        formatter: runtime === 'bun' ? 'bunx --bun prettier --write' : 'npx prettier --write',
        formatterExtensions: ['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.md', '.yaml', '.yml', '.html'],
        typeChecker: runtime === 'bun' ? 'bunx --bun tsc --noEmit' : 'npx tsc --noEmit',
        typeCheckExtensions: ['.ts', '.tsx'],
        preCommitChecks: runtime === 'bun'
          ? ['bun test', 'bunx --bun tsc --noEmit']
          : ['npm test', 'npx tsc --noEmit'],
        commitPatterns: ['git commit', 'git merge', 'bun run commit'],
        contextThresholds: { warn: 100000, alert: 200000, critical: 300000 }
      },
      harness: {
        enabled: true,
        maxFixIterations: 3,
        failFast: false,
        checks: [
          { name: 'test', command: runtime === 'bun' ? 'bun test' : 'npm test', enabled: true, timeout: 120, parser: 'bun-test' },
          { name: 'typecheck', command: runtime === 'bun' ? 'bunx --bun tsc --noEmit' : 'npx tsc --noEmit', enabled: true, timeout: 60, parser: 'tsc' },
          { name: 'lint', command: runtime === 'bun' ? 'bunx --bun eslint . --format json' : 'npx eslint . --format json', enabled: false, timeout: 60, parser: 'eslint' },
          { name: 'build', command: runtime === 'bun' ? 'bun run check:drift' : 'npm run check:drift', enabled: false, timeout: 120, parser: 'generic' }
        ]
      },
      complexity: {
        defaultLevel: 'auto',
        matrix: {
          TRIVIAL: { cognitivePreflight: 'lite', research: 'skip', discussion: 'skip', planVerificationIterations: 0, harnessFixIterations: 1, verificationMode: 'quick', codeReviewAgents: [], uat: 'skip', learningCapture: 'skip' },
          SIMPLE: { cognitivePreflight: 'lite', research: 'skip', discussion: 'skip', planVerificationIterations: 0, harnessFixIterations: 2, verificationMode: 'quick', codeReviewAgents: [], uat: 'skip', learningCapture: 'brief' },
          MODERATE: { cognitivePreflight: 'full', research: 'optional', discussion: 'optional', planVerificationIterations: 1, harnessFixIterations: 3, verificationMode: 'standard', codeReviewAgents: ['dx-advocate', 'code-simplifier'], uat: 'optional', learningCapture: 'standard' },
          COMPLEX: { cognitivePreflight: 'full', research: 'required', discussion: 'run', planVerificationIterations: 2, harnessFixIterations: 3, verificationMode: 'full', codeReviewAgents: ['dx-advocate', 'code-simplifier', 'code-architect', 'tailwind-auditor'], uat: 'required', learningCapture: 'full' },
          CRITICAL: { cognitivePreflight: 'full', research: 'required', discussion: 'required', planVerificationIterations: 3, harnessFixIterations: 5, verificationMode: 'full+human', codeReviewAgents: ['dx-advocate', 'code-simplifier', 'code-architect', 'tailwind-auditor', 'security-auditor'], uat: 'required+thorough', learningCapture: 'full+debrief' }
        }
      },
      dogfood: {
        enabled: false,
        source: 'src/',
        outputs: ['.claude/', '.cursor/'],
        build_command: runtime === 'bun' ? 'bun run build:all' : 'npm run build:all',
        lock_file: '.claude/.session-lock',
        manifest_file: '.claude/.build-manifest.json'
      }
    };
    await Bun.write(
      planningDir + '/config.json',
      JSON.stringify(config, null, 2) + '\n'
    );
  "
  CREATED="${CREATED}config.json "
else
  # config.json exists -- update runtime field only
  HOOK_CONFIG="$PLANNING_DIR/config.json" HOOK_RUNTIME="$RUNTIME" bun -e "
    const cfg = JSON.parse(await Bun.file(process.env.HOOK_CONFIG).text());
    cfg.runtime = process.env.HOOK_RUNTIME;
    await Bun.write(process.env.HOOK_CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  "
fi

# Step 6: BRAIN.md creation removed.
# Project identity is now stored in MuninnDB under brain:project-identity.
# Use `muninn_remember_tree` to seed or `muninn_recall_tree` to recall.
# Run /seed-memory to bootstrap project identity into MuninnDB.

# Step 7: Write environment variables for the session (if supported)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export LUCA_RUNTIME=$RUNTIME" >> "$CLAUDE_ENV_FILE"
  echo "export LUCA_PLANNING_DIR=$PLANNING_DIR" >> "$CLAUDE_ENV_FILE"
fi

# Step 8: Create session lock file (with build manifest snapshot)
HOOK_PROJECT_DIR_LOCK="$PROJECT_DIR" bun -e "
  const path = require('path');
  const projectDir = process.env.HOOK_PROJECT_DIR_LOCK;
  const lockPath = path.join(projectDir, '.claude', '.session-lock');
  const manifestPath = path.join(projectDir, '.claude', '.build-manifest.json');

  let buildManifestAt = null;
  try {
    const manifestFile = Bun.file(manifestPath);
    if (await manifestFile.exists()) {
      const manifest = JSON.parse(await manifestFile.text());
      buildManifestAt = manifest.built_at ?? null;
    }
  } catch {
    // No manifest or parse error — leave as null
  }

  const payload = {
    created_at: new Date().toISOString(),
    pid: process.pid,
    build_manifest_at: buildManifestAt
  };
  await Bun.write(lockPath, JSON.stringify(payload, null, 2) + '\n');
"

# Step 9: Output summary if anything was created
if [ -n "$CREATED" ]; then
  HOOK_CREATED="$CREATED" bun -e "
    const created = process.env.HOOK_CREATED.trim();
    const files = created.split(' ').filter(Boolean);
    const msg = '[Luca] Initialized .planning/ directory. Created: ' + files.join(', ');
    const isClaude = !!process.env.CLAUDE_PROJECT_DIR;
    const output = isClaude
      ? { systemMessage: msg }
      : { followup_message: msg };
    process.stdout.write(JSON.stringify(output));
  "
fi

exit 0
