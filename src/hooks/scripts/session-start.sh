#!/usr/bin/env bash
# session-start.sh -- Initialize .planning/ directory for Luca
#
# Canonical event: session_start
# Platform events: Claude=SessionStart, Cursor=sessionStart, Pi=session_start
# Type: Command hook (synchronous)
# Timeout: 15 seconds
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code: {}  (no meaningful payload)
# Cursor:      {}  (no meaningful payload)
# Pi:          {}  (no meaningful payload)
#
# Stdin is consumed (cat) but not inspected for session_start.
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# On first init:
#   Claude: { "systemMessage": "[Luca] Initialized .planning/ directory. Created: ..." }
#   Cursor: { "followup_message": "[Luca] Initialized .planning/ directory. Created: ..." }
# On missing bun:
#   { "systemMessage": "[Luca] Bun is not installed. ..." }
# On resume (nothing created): no output
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = always (session start should never block)
# ──────────────────────────────────────────────────────────────────────
#
# Creates .planning/ directory with STATE.md, ROADMAP.md, and config.json
# on first session. Subsequent sessions only create missing files
# (validate & repair mode).
#
# config.json includes runtime detection (bun vs node).
#
# NOTE: Memory files (BRAIN.md, MEMORY.md, WORKING.md) are no longer
# managed here. Long-term memory is handled by MuninnDB MCP.
#
# Uses `bun -e` for JSON parsing and file generation (project convention).

set -euo pipefail

# Ensure node_modules/.bin is in PATH for installed-package context
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

# Source shared hook library
HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_SCRIPT_DIR}/_lib/common.sh"

guard_dedup "session-start"

# Read stdin JSON (standard hook pattern — consumed but not parsed)
INPUT=$(cat || true)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
PLANNING_DIR="$PROJECT_DIR/.planning"

# Step 1: Check bun availability
if ! command -v bun &>/dev/null; then
  # Output systemMessage warning -- do not block session start
  printf '{"systemMessage":"[Luca] Bun is not installed. Luca hooks require Bun for JSON parsing and build commands. Install from https://bun.sh"}'
  exit 0
fi

# Step 1b: Check Pi OAuth token (only triggers if ~/.pi/agent/auth.json exists)
PI_AUTH_FILE="$HOME/.pi/agent/auth.json"
if [ -f "$PI_AUTH_FILE" ]; then
  PI_TOKEN_PREFIX=$(bun -e "
    try {
      const auth = JSON.parse(await Bun.file('$PI_AUTH_FILE').text());
      const token = auth?.anthropic?.access ?? '';
      process.stdout.write(token.substring(0, 14));
    } catch { process.stdout.write(''); }
  " 2>/dev/null || echo "")

  if [ "$PI_TOKEN_PREFIX" = "sk-ant-oat01-" ]; then
    printf '{"systemMessage":"[Luca] Pi is using an OAuth subscription token (sk-ant-oat01-*) which Anthropic no longer accepts for third-party API calls. To fix: 1) Create a Console API key at console.anthropic.com (starts with sk-ant-api03-*). 2) Set ANTHROPIC_API_KEY in your shell environment. See docs/troubleshooting.md for details."}'
  fi
fi

# Step 2: Create .planning/ directory if missing
mkdir -p "$PLANNING_DIR"
mkdir -p "$PLANNING_DIR/notes/done"

CREATED=""

# Step 3: Create STATE.md if missing
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

# Step 3e: Initialize state machine (via cascading bridge lookup)
STATE_JSON="$PLANNING_DIR/state.json"

if [ -f "$STATE_JSON" ]; then
  # State exists -- check age to decide resume vs reinit
  # macOS stat -f "%m", Linux stat -c "%Y"
  STATE_MTIME=$(stat -f "%m" "$STATE_JSON" 2>/dev/null || stat -c "%Y" "$STATE_JSON" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  STATE_AGE=$((NOW - STATE_MTIME))

  if [ "$STATE_AGE" -lt 86400 ]; then
    # Fresh enough -- resume (regenerate snapshot)
    run_bridge snapshot 2>/dev/null || true
  else
    # Stale -- reinitialize
    run_bridge ensure-init --force 2>/dev/null || true
    CREATED="${CREATED}state.json "
  fi
else
  # No state.json -- initialize fresh
  run_bridge ensure-init 2>/dev/null || true
  if [ -f "$STATE_JSON" ]; then
    CREATED="${CREATED}state.json "
  fi
fi

# Step 3f: Check for stale session-end marker (signals MuninnDB cleanup needed)
# The actual MuninnDB cleanup happens in lu-cognition's cleanup_stale_sessions step
# (MCP tools are unavailable in hooks). This marker signals that cleanup is pending.
SESSION_END_MARKER="$PLANNING_DIR/.session-end-marker.json"
STALE_SESSION_MSG=""
if [ -f "$SESSION_END_MARKER" ]; then
  if command -v bun &>/dev/null; then
    STALE_SESSION_MSG=$(HOOK_MARKER="$SESSION_END_MARKER" bun -e "
      try {
        const marker = JSON.parse(await Bun.file(process.env.HOOK_MARKER).text());
        if (marker.cleanup_pending) {
          process.stdout.write('Stale session detected (ended: ' + (marker.ended_at || 'unknown') + '). MuninnDB cleanup will run during cognitive pre-flight.');
        }
      } catch { /* no marker or parse error */ }
    " 2>/dev/null || echo "")
  fi
  # Remove marker after reading (cleanup will be handled by lu-cognition)
  rm -f "$SESSION_END_MARKER"
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
          TRIVIAL: { cognitivePreflight: 'lite', planVerificationIterations: 1, harnessFixIterations: 1, verifyFixIterations: 1, verificationMode: 'quick', recallDepth: 1 },
          SIMPLE: { cognitivePreflight: 'lite', planVerificationIterations: 1, harnessFixIterations: 2, verifyFixIterations: 1, verificationMode: 'quick', recallDepth: 1 },
          MODERATE: { cognitivePreflight: 'full', planVerificationIterations: 1, harnessFixIterations: 2, verifyFixIterations: 1, verificationMode: 'standard', recallDepth: 3 },
          COMPLEX: { cognitivePreflight: 'full', planVerificationIterations: 2, harnessFixIterations: 2, verifyFixIterations: 1, verificationMode: 'full', recallDepth: null },
          CRITICAL: { cognitivePreflight: 'full', planVerificationIterations: 3, harnessFixIterations: 3, verifyFixIterations: 2, verificationMode: 'full+human', recallDepth: null }
        }
      },
      dogfood: {
        enabled: false,
        source: 'src/',
        outputs: ['.claude/', '.cursor/'],
        build_command: runtime === 'bun' ? 'bun run build:all' : 'npm run build:all',
        lock_file: '.claude/.session-lock',
        manifest_file: '.claude/.build-manifest.json'
      },
      muninn: {
        vault: 'default'
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

# Step 6: Write environment variables for the session (if supported)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export LUCA_RUNTIME=$RUNTIME" >> "$CLAUDE_ENV_FILE"
  echo "export LUCA_PLANNING_DIR=$PLANNING_DIR" >> "$CLAUDE_ENV_FILE"
  # Signal to sub-processes (including sub-agents running build:all) that a
  # session is active. build-all.ts checks this to auto-bypass the session lock
  # instead of blocking or requiring --force. See docs/decisions/session-lock-bypass.md.
  echo "export LUCA_SESSION_ACTIVE=1" >> "$CLAUDE_ENV_FILE"
fi

# Step 7b: Check for stale session lock (older than 2 hours = crashed session)
SESSION_LOCK="$PROJECT_DIR/.claude/.session-lock"
if [ -f "$SESSION_LOCK" ]; then
  LOCK_MTIME=$(stat -f "%m" "$SESSION_LOCK" 2>/dev/null || stat -c "%Y" "$SESSION_LOCK" 2>/dev/null || echo "0")
  NOW_TS=$(date +%s)
  LOCK_AGE=$((NOW_TS - LOCK_MTIME))
  if [ "$LOCK_AGE" -gt 7200 ]; then
    rm -f "$SESSION_LOCK"
  fi
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

# Step 8b: Check for pending developer notes from previous sessions
NOTES_MSG=""
if [ -d "$PLANNING_DIR/notes" ]; then
  PENDING_NOTES=$(find "$PLANNING_DIR/notes" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$PENDING_NOTES" -gt 0 ]; then
    NOTES_MSG=" $PENDING_NOTES developer note(s) pending."
  fi
fi

# Step 9: Output summary if anything was created
if [ -n "$CREATED" ]; then
  HOOK_CREATED="$CREATED" HOOK_NOTES_MSG="$NOTES_MSG" HOOK_STALE_MSG="$STALE_SESSION_MSG" bun -e "
    const created = process.env.HOOK_CREATED.trim();
    const notesSuffix = process.env.HOOK_NOTES_MSG || '';
    const staleSuffix = process.env.HOOK_STALE_MSG ? ' ' + process.env.HOOK_STALE_MSG : '';
    const files = created.split(' ').filter(Boolean);
    const msg = '[Luca] Initialized .planning/ directory. Created: ' + files.join(', ') + notesSuffix + staleSuffix;
    const isClaude = !!process.env.CLAUDE_PROJECT_DIR;
    const output = isClaude
      ? { systemMessage: msg }
      : { followup_message: msg };
    process.stdout.write(JSON.stringify(output));
  "
elif [ -n "$NOTES_MSG" ] || [ -n "$STALE_SESSION_MSG" ]; then
  HOOK_NOTES_MSG="$NOTES_MSG" HOOK_STALE_MSG="$STALE_SESSION_MSG" bun -e "
    const notesSuffix = process.env.HOOK_NOTES_MSG || '';
    const staleSuffix = process.env.HOOK_STALE_MSG ? ' ' + process.env.HOOK_STALE_MSG : '';
    const msg = '[Luca]' + notesSuffix + staleSuffix;
    const isClaude = !!process.env.CLAUDE_PROJECT_DIR;
    const output = isClaude
      ? { systemMessage: msg }
      : { followup_message: msg };
    process.stdout.write(JSON.stringify(output));
  "
fi

exit 0
