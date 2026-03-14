#!/usr/bin/env bash
# pre-compact-checkpoint.sh -- Save context checkpoint before compaction
#
# Canonical event: pre_compact
# Platform events: Claude=PreCompact, Cursor=pre_compact, Pi=pre_compact
# Type: Command hook (asynchronous, does not block compaction)
# Timeout: 15 seconds
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code: {
#   "session_id": "abc123",
#   "transcript_path": "/path/to/transcript.jsonl",
#   "cwd": "/path/to/project",
#   "permission_mode": "default",
#   "hook_event_name": "PreCompact",
#   "trigger": "manual" | "auto",
#   "custom_instructions": ""
# }
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# No stdout output (PreCompact hooks are side-effect only)
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = always (async hook, non-blocking)
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_SCRIPT_DIR}/_lib/common.sh"

guard_dedup "pre-compact-checkpoint" 10

# --- Read stdin JSON ---
INPUT=$(cat || true)
if [ -z "$INPUT" ]; then
  INPUT="{}"
fi

# Extract trigger field (manual vs auto)
TRIGGER=$(printf '%s' "$INPUT" | bun -e "
  try {
    const data = JSON.parse(await Bun.stdin.text());
    process.stdout.write(data.trigger || 'unknown');
  } catch { process.stdout.write('unknown'); }
" 2>/dev/null || echo "unknown")

# --- Read state ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Phase info from bridge (with fallback)
PHASE_INFO=$(run_bridge read-phase 2>/dev/null || echo '{}')
PHASE=$(printf '%s' "$PHASE_INFO" | bun -e "
  try {
    const r = JSON.parse(await Bun.stdin.text());
    process.stdout.write(String(r.phase || ''));
  } catch { process.stdout.write(''); }
" 2>/dev/null || echo "")

# Status from bridge
STATUS_INFO=$(run_bridge read-status 2>/dev/null || echo '{}')
COMPLEXITY=$(printf '%s' "$STATUS_INFO" | bun -e "
  try {
    const r = JSON.parse(await Bun.stdin.text());
    process.stdout.write(r.complexity || 'MODERATE');
  } catch { process.stdout.write('MODERATE'); }
" 2>/dev/null || echo "MODERATE")

# Read milestone, branch, issue, and status from STATE.md
STATE_MD="$PROJECT_DIR/.planning/STATE.md"
MILESTONE=""
BRANCH=""
GITHUB_ISSUE=""
STATUS=""
if [ -f "$STATE_MD" ]; then
  MILESTONE=$(grep "Current Milestone:" "$STATE_MD" 2>/dev/null | head -1 | sed 's/.*Milestone://' | xargs || echo "")
  BRANCH=$(grep "Branch:" "$STATE_MD" 2>/dev/null | head -1 | sed 's/.*Branch://' | xargs || echo "")
  GITHUB_ISSUE=$(grep "GitHub Issue:" "$STATE_MD" 2>/dev/null | head -1 | sed 's/.*Issue://' | xargs || echo "")
  STATUS=$(grep "Status:" "$STATE_MD" 2>/dev/null | head -1 | sed 's/.*Status://' | xargs || echo "")
fi

# Recent git activity
GIT_LOG=$(cd "$PROJECT_DIR" && git log --oneline -5 2>/dev/null || echo "no git history")

# Recent files changed (last 3 commits)
RECENT_FILES=$(cd "$PROJECT_DIR" && git diff --name-only HEAD~3 HEAD 2>/dev/null | head -10 | tr '\n' ',' | sed 's/,$//' || echo "")

# Context usage at compaction time
CTX_ZONE=""
CTX_PERCENT=""
CTX_METRICS_FILE="$PROJECT_DIR/.planning/.context-metrics.json"
if [ -f "$CTX_METRICS_FILE" ]; then
  CTX_ZONE=$(HOOK_METRICS="$CTX_METRICS_FILE" bun -e "
    try {
      const m = JSON.parse(await Bun.file(process.env.HOOK_METRICS).text());
      process.stdout.write(m.zone || '');
    } catch { /* empty */ }
  " 2>/dev/null || echo "")
  CTX_PERCENT=$(HOOK_METRICS="$CTX_METRICS_FILE" bun -e "
    try {
      const m = JSON.parse(await Bun.file(process.env.HOOK_METRICS).text());
      process.stdout.write(String(m.usage_percent ?? ''));
    } catch { /* empty */ }
  " 2>/dev/null || echo "")
fi

# --- Build checkpoint JSON and write filesystem fallback ---
HOOK_PHASE="$PHASE" \
HOOK_COMPLEXITY="$COMPLEXITY" \
HOOK_MILESTONE="$MILESTONE" \
HOOK_BRANCH="$BRANCH" \
HOOK_GITHUB_ISSUE="$GITHUB_ISSUE" \
HOOK_STATUS="$STATUS" \
HOOK_TRIGGER="$TRIGGER" \
HOOK_GIT_LOG="$GIT_LOG" \
HOOK_RECENT_FILES="$RECENT_FILES" \
HOOK_CTX_ZONE="$CTX_ZONE" \
HOOK_CTX_PERCENT="$CTX_PERCENT" \
HOOK_PROJECT_DIR="$PROJECT_DIR" \
bun -e "
  const phase = process.env.HOOK_PHASE || 'unknown';
  const complexity = process.env.HOOK_COMPLEXITY || 'MODERATE';
  const milestone = process.env.HOOK_MILESTONE || 'unknown';
  const branch = process.env.HOOK_BRANCH || '';
  const githubIssue = process.env.HOOK_GITHUB_ISSUE || '';
  const status = process.env.HOOK_STATUS || '';
  const trigger = process.env.HOOK_TRIGGER || 'unknown';
  const gitLog = process.env.HOOK_GIT_LOG || '';
  const recentFiles = (process.env.HOOK_RECENT_FILES || '').split(',').filter(Boolean);
  const ctxZone = process.env.HOOK_CTX_ZONE || '';
  const ctxPercent = process.env.HOOK_CTX_PERCENT || '';
  const projectDir = process.env.HOOK_PROJECT_DIR || '.';

  const checkpoint = {
    position: {
      phase,
      complexity,
      milestone,
    },
    current_work: {
      milestone,
      branch: branch || undefined,
      github_issue: githubIssue || undefined,
      status: status || undefined,
    },
    recent_files: recentFiles.length > 0 ? recentFiles : undefined,
    context_at_compaction: ctxZone ? { zone: ctxZone, usage_percent: parseInt(ctxPercent || '0', 10) } : undefined,
    completed_summary: gitLog,
    trigger,
    saved_at: new Date().toISOString(),
    vault: 'luca-framework',
  };

  // Write filesystem fallback
  await Bun.write(
    projectDir + '/.planning/.context-checkpoint.json',
    JSON.stringify(checkpoint, null, 2) + '\n'
  );
" 2>/dev/null || true

# --- Write to MuninnDB REST API (fire-and-forget) ---
ENGRAM_JSON=$(HOOK_PHASE="$PHASE" \
HOOK_COMPLEXITY="$COMPLEXITY" \
HOOK_MILESTONE="$MILESTONE" \
HOOK_BRANCH="$BRANCH" \
HOOK_GITHUB_ISSUE="$GITHUB_ISSUE" \
HOOK_STATUS="$STATUS" \
HOOK_TRIGGER="$TRIGGER" \
HOOK_GIT_LOG="$GIT_LOG" \
HOOK_RECENT_FILES="$RECENT_FILES" \
HOOK_CTX_ZONE="$CTX_ZONE" \
HOOK_CTX_PERCENT="$CTX_PERCENT" \
bun -e "
  const recentFiles = (process.env.HOOK_RECENT_FILES || '').split(',').filter(Boolean);
  const ctxZone = process.env.HOOK_CTX_ZONE || '';
  const ctxPercent = process.env.HOOK_CTX_PERCENT || '';
  const checkpoint = {
    position: { phase: process.env.HOOK_PHASE || '', complexity: process.env.HOOK_COMPLEXITY || '', milestone: process.env.HOOK_MILESTONE || '' },
    current_work: {
      branch: process.env.HOOK_BRANCH || undefined,
      github_issue: process.env.HOOK_GITHUB_ISSUE || undefined,
      status: process.env.HOOK_STATUS || undefined,
    },
    recent_files: recentFiles.length > 0 ? recentFiles : undefined,
    context_at_compaction: ctxZone ? { zone: ctxZone, usage_percent: parseInt(ctxPercent || '0', 10) } : undefined,
    completed_summary: process.env.HOOK_GIT_LOG || '',
    trigger: process.env.HOOK_TRIGGER || 'unknown',
    saved_at: new Date().toISOString(),
  };
  const engram = {
    vault: 'luca-framework',
    concept: 'session:checkpoint',
    content: JSON.stringify(checkpoint),
    type: 'observation',
    tags: ['checkpoint', 'context', 'session'],
  };
  process.stdout.write(JSON.stringify(engram));
" 2>/dev/null || echo '{}')

MUNINN_URL="${MUNINN_DB_URL:-http://127.0.0.1:8476}"
MUNINN_KEY="${MUNINN_DB_API_KEY:-}"

curl -s -o /dev/null --max-time 5 \
  -X POST "${MUNINN_URL}/api/engrams" \
  -H "Content-Type: application/json" \
  ${MUNINN_KEY:+-H "Authorization: Bearer ${MUNINN_KEY}"} \
  -d "$ENGRAM_JSON" \
  2>/dev/null || true

exit 0
