# Phase 154: Context Metrics & Checkpointing - Research

**Researched:** 2026-03-13
**Domain:** Shell hooks, context monitoring, filesystem-based metrics persistence
**Confidence:** HIGH

## Summary

Phase 154 enhances `context-check-throttled.sh` with two capabilities: (1) writing a persistent metrics JSON file (`.planning/.context-metrics.json`) after each throttled check, and (2) triggering a proactive state-machine checkpoint (bridge snapshot) when the context zone transitions from a lower-cost zone to a higher-cost one (e.g., `peak` → `good`, `good` → `degrading`, `degrading` → `stop`).

The hook is already fully understood and working. The zone boundary data in `config.json` (`zone_boundaries.peak_end`, `good_end`, `degrading_end`) are planner cost-model percentages, not transcript byte thresholds — the hook uses its own byte-based thresholds. The metrics file does not yet exist and must be created fresh. Checkpoint writes must be throttled independently from the context check itself to avoid excessive `luca-bridge snapshot` calls.

**Primary recommendation:** Add metrics write (always-on within throttle window) and zone-transition-based checkpoint write (with its own per-project throttle file) to `context-check-throttled.sh`, using `bun -e` for JSON emission per project convention.

## Standard Stack

### Core

| Tool                  | Version          | Purpose                                | Why Standard                         |
| --------------------- | ---------------- | -------------------------------------- | ------------------------------------ |
| bash                  | system           | Hook script language                   | All hooks use bash                   |
| bun                   | project-standard | JSON emit via `bun -e`                 | Project convention (no jq)           |
| `Bun.write()`         | bun built-in     | Write JSON files atomically            | Project preference for Bun file APIs |
| `run_bridge snapshot` | luca-bridge      | Regenerate STATE.md from state machine | Existing pattern in snapshot-sync.sh |

### Supporting

| Tool                    | Version          | Purpose                         | When to Use                       |
| ----------------------- | ---------------- | ------------------------------- | --------------------------------- |
| `/tmp/` timestamp files | OS               | Throttle dedup                  | Every throttle mechanism in hooks |
| `shasum -a 256`         | system           | Per-project hash for temp files | All hooks use this pattern        |
| `guard_dedup`           | `_lib/common.sh` | Double-fire prevention          | Used at top of every hook         |

### Alternatives Considered

| Instead of                       | Could Use                      | Tradeoff                                                       |
| -------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| `bun -e` for JSON write          | `printf` + `cat`               | printf fragile with nested JSON, bun is safer                  |
| `Bun.write()`                    | `echo > file`                  | echo is not atomic; Bun.write is                               |
| Separate throttle for checkpoint | same throttle as context check | Checkpoint should be gated on zone transition, not purely time |

## Architecture Patterns

### Recommended Project Structure (no changes needed)

The metrics file lives in `.planning/` (alongside other runtime state files like `.session-end-marker.json`):

```
.planning/
├── .context-metrics.json   # NEW — written by context-check-throttled.sh
├── .session-end-marker.json
├── STATE.md
└── state.json
```

### Pattern 1: Metrics JSON Write (after zone calculation)

**What:** After the zone/percent calculation block, emit a JSON snapshot of the current context state to `.planning/.context-metrics.json`.

**When to use:** Every time the hook runs past the throttle gate (once per 60 seconds).

**Example:**

```bash
# Write metrics snapshot (always, when hook runs)
HOOK_ZONE="$ZONE" \
HOOK_PERCENT="$USAGE_PERCENT" \
HOOK_FILE_SIZE="${FILE_SIZE:-0}" \
HOOK_PROJECT_DIR="$PROJECT_DIR" \
bun -e "
  const zone = process.env.HOOK_ZONE;
  const percent = parseInt(process.env.HOOK_PERCENT || '0', 10);
  const fileSize = parseInt(process.env.HOOK_FILE_SIZE || '0', 10);
  const projectDir = process.env.HOOK_PROJECT_DIR;
  const metrics = {
    zone,
    usage_percent: percent,
    transcript_bytes: fileSize,
    checked_at: new Date().toISOString(),
    thresholds: {
      warn_bytes: 100000,
      alert_bytes: 200000,
      critical_bytes: 300000,
    },
  };
  await Bun.write(
    projectDir + '/.planning/.context-metrics.json',
    JSON.stringify(metrics, null, 2) + '\n'
  );
" 2>/dev/null || true
```

### Pattern 2: Zone-Transition Checkpoint (proactive bridge snapshot)

**What:** Read the previous zone from the metrics file (before overwriting it), compare to current zone. If zone has worsened (increased severity), trigger `run_bridge snapshot` to write a STATE.md checkpoint. Gate this with its own throttle file (separate from context check throttle) to cap at one checkpoint per 5 minutes.

**When to use:** When zone transitions from `peak`→`good`, `good`→`degrading`, or `degrading`→`stop`.

**Zone severity order:** `peak` (0) < `good` (1) < `degrading` (2) < `stop` (3).

**Example:**

```bash
# Zone severity map (inline — no jq dependency)
zone_severity() {
  case "$1" in
    peak)     echo 0 ;;
    good)     echo 1 ;;
    degrading) echo 2 ;;
    stop)     echo 3 ;;
    *)        echo 0 ;;
  esac
}

# Read previous zone from metrics file
PREV_ZONE="peak"
METRICS_FILE="$PROJECT_DIR/.planning/.context-metrics.json"
if [ -f "$METRICS_FILE" ]; then
  PREV_ZONE=$(HOOK_METRICS="$METRICS_FILE" bun -e "
    try {
      const m = JSON.parse(await Bun.file(process.env.HOOK_METRICS).text());
      process.stdout.write(m.zone || 'peak');
    } catch { process.stdout.write('peak'); }
  " 2>/dev/null || echo "peak")
fi

# Checkpoint throttle (5 minutes, separate from context check throttle)
CHECKPOINT_THROTTLE_FILE="/tmp/.luca-ctx-checkpoint-${PROJECT_HASH}-ts"
CHECKPOINT_THROTTLE_SECONDS=300

PREV_SEV=$(zone_severity "$PREV_ZONE")
CURR_SEV=$(zone_severity "$ZONE")

if [ "$CURR_SEV" -gt "$PREV_SEV" ]; then
  # Zone worsened — consider checkpoint
  SHOULD_CHECKPOINT=true
  if [ -f "$CHECKPOINT_THROTTLE_FILE" ]; then
    LAST_CP=$(cat "$CHECKPOINT_THROTTLE_FILE" 2>/dev/null || echo "0")
    NOW_CP=$(date +%s)
    if [ $((NOW_CP - LAST_CP)) -lt "$CHECKPOINT_THROTTLE_SECONDS" ]; then
      SHOULD_CHECKPOINT=false
    fi
  fi

  if [ "$SHOULD_CHECKPOINT" = "true" ]; then
    date +%s > "$CHECKPOINT_THROTTLE_FILE"
    run_bridge snapshot 2>/dev/null || true
  fi
fi
```

### Pattern 3: Execution Order Within the Hook

The correct insertion order for new code blocks:

```
[existing] guard_dedup
[existing] throttle check (60s) → exit if too recent
[existing] update throttle timestamp
[existing] urgent notes check → exit if found
[existing] TRANSCRIPT_PATH discovery
[existing] FILE_SIZE + zone/percent calculation

[NEW]      read PREV_ZONE from .context-metrics.json
[NEW]      write .context-metrics.json (current snapshot)
[NEW]      zone-transition checkpoint (if worsened + checkpoint throttle ok)

[existing] output systemMessage if zone is degrading/stop
[existing] exit 0
```

### Anti-Patterns to Avoid

- **Don't use `echo >` for JSON files:** Not atomic; prefer `Bun.write()`.
- **Don't share checkpoint throttle with context check throttle:** They serve different purposes. Context check throttle (60s) controls message frequency; checkpoint throttle (300s) controls bridge write frequency.
- **Don't run `run_bridge snapshot` on every zone check:** Even at 60s intervals, this is too frequent. Only on zone worsening + 5-minute throttle.
- **Don't parse stdin in context-check-throttled.sh:** The existing contract explicitly states stdin is NOT consumed. Adding stdin parsing would break the `async: true` model.
- **Don't call `bun -e` with shell variable interpolation inside the JS string:** Always use `process.env.VAR` pattern (see `read_session_id()` in `_lib/common.sh`).

## Don't Hand-Roll

| Problem            | Don't Build           | Use Instead                         | Why                                               |
| ------------------ | --------------------- | ----------------------------------- | ------------------------------------------------- |
| JSON file write    | `echo '{...}' > file` | `Bun.write()` in `bun -e`           | Atomic, handles escaping                          |
| Previous zone read | Manual grep/awk       | `bun -e` JSON parse                 | Consistent with project convention                |
| Bridge invocation  | Direct `luca-bridge`  | `run_bridge` from `_lib/common.sh`  | Cascading fallback (installed vs source)          |
| Throttle mechanism | Custom logic          | Pattern from existing hooks         | All hooks use identical `/tmp/` timestamp pattern |
| Dedup guard        | Custom logic          | `guard_dedup` from `_lib/common.sh` | Already handles double-fire prevention            |

## Common Pitfalls

### Pitfall 1: Bun -e receives $ZONE as shell variable in JS string

**What goes wrong:** Writing `bun -e "const zone = '$ZONE';"` allows shell injection if ZONE contains special characters.

**Why it happens:** Copy-paste from shell scripts that don't follow the project convention.

**How to avoid:** Always pass values via `HOOK_VAR="$VAR" bun -e "process.env.HOOK_VAR"`. See `_lib/common.sh` `read_session_id()` for the canonical pattern.

**Warning signs:** Any `bun -e` string containing `$VARIABLE` inside the JS template (not `process.env.`).

### Pitfall 2: FILE_SIZE unset when transcript not found

**What goes wrong:** If `TRANSCRIPT_PATH` is empty (no session dir or transcript not found), `FILE_SIZE` is never set. Writing metrics with an undefined `FILE_SIZE` fails.

**Why it happens:** `FILE_SIZE` is only set inside the `if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]` block.

**How to avoid:** Use `${FILE_SIZE:-0}` when passing to `bun -e`, and initialize `FILE_SIZE=0` before the transcript block (same as `USAGE_PERCENT=0` is already initialized).

**Warning signs:** `HOOK_FILE_SIZE=""` causing `parseInt('', 10)` → `NaN` in JS.

### Pitfall 3: Checkpoint throttle file uses same key as context throttle

**What goes wrong:** If both throttles use the same temp file name, resetting one resets the other, creating unpredictable behavior.

**Why it happens:** Copy-paste from the existing throttle block without changing the suffix.

**How to avoid:** Use a distinct suffix: `-ctx-checkpoint-` vs `-context-check-`.

**Warning signs:** Checkpoint fires on every zone check regardless of timing.

### Pitfall 4: Metrics file write happens before zone calculation

**What goes wrong:** PREV_ZONE read and metrics write must bracket the zone calculation correctly. Writing before reading PREV_ZONE means always seeing the current zone as "previous".

**Why it happens:** Ordering the new blocks incorrectly.

**How to avoid:** Read PREV_ZONE → calculate current zone → write metrics → compare for checkpoint.

### Pitfall 5: `run_bridge snapshot` fails silently in non-initialized projects

**What goes wrong:** If `.planning/state.json` doesn't exist, `run_bridge snapshot` exits non-zero. Without `|| true`, the hook fails.

**Why it happens:** `set -euo pipefail` is active.

**How to avoid:** Always `run_bridge snapshot 2>/dev/null || true` (same pattern as `snapshot-sync.sh` line 67).

## Code Examples

### Full PostToolUse stdin schema (Claude Code)

```json
// Claude Code PostToolUse (no matcher — fires for all tools)
{
  "tool_input": {
    // varies by tool:
    // Bash: { "command": "..." }
    // Edit/Write: { "file_path": "/abs/path" }
    // Read: { "file_path": "/abs/path" }
  }
}
// Note: context-check-throttled.sh does NOT parse stdin (per existing contract)
```

### Throttle mechanism (established pattern)

```bash
# Project hash makes temp file per-project (not shared across repos)
PROJECT_HASH=$(printf '%s' "${CLAUDE_PROJECT_DIR:-.}" | shasum -a 256 | cut -c1-8)
THROTTLE_FILE="/tmp/.luca-context-check-${PROJECT_HASH}-ts"
THROTTLE_SECONDS=60

if [ -f "$THROTTLE_FILE" ]; then
  LAST_CHECK=$(cat "$THROTTLE_FILE" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_CHECK))
  if [ "$ELAPSED" -lt "$THROTTLE_SECONDS" ]; then
    exit 0  # Skip — too recent
  fi
fi
date +%s > "$THROTTLE_FILE"
```

### Metrics JSON structure (proposed)

```json
{
  "zone": "good",
  "usage_percent": 45,
  "transcript_bytes": 128450,
  "checked_at": "2026-03-13T12:34:56.789Z",
  "thresholds": {
    "warn_bytes": 100000,
    "alert_bytes": 200000,
    "critical_bytes": 300000
  }
}
```

Fields:

- `zone`: one of `"peak"`, `"good"`, `"degrading"`, `"stop"`
- `usage_percent`: 0-100 integer (computed as `file_size * 70 / 300000`)
- `transcript_bytes`: raw file size from `wc -c`; `0` if transcript not found
- `checked_at`: ISO 8601 timestamp
- `thresholds`: byte thresholds used for this check (for consumer reference)

### guard_dedup behavior (from `_lib/common.sh`)

```bash
guard_dedup "context-check-throttled"
# Creates/checks /tmp/.luca-dedup-context-check-throttled-{hash}
# TTL=5 seconds (default)
# Exits 0 immediately if called again within 5s (double-fire prevention)
# Note: this is separate from the 60s content throttle below it
```

## State of the Art

| Old Approach                              | Current Approach                      | When Changed            | Impact                             |
| ----------------------------------------- | ------------------------------------- | ----------------------- | ---------------------------------- |
| `src/memory/context-monitor.ts` TS module | Direct transcript heuristics in shell | Recent (removed)        | Simpler, no build dependency       |
| WORKING.md for context signals            | Transcript file size only             | Recent                  | MuninnDB handles memory            |
| jq for JSON parsing                       | `bun -e`                              | Project-wide convention | Consistent, no external dependency |

**Deprecated/outdated:**

- `src/memory/context-monitor.ts`: Removed. Referenced in line 87 comment of `context-check-throttled.sh` as "old module".
- WORKING.md fallback signal: Removed. `context-monitor.sh` comments (line 32) confirm memory is MuninnDB now.

## Open Questions

1. **Should `zone_boundaries` from `config.json` be used instead of hardcoded byte thresholds?**
   - What we know: `config.json` has `planner.zone_boundaries` (`peak_end: 30`, `good_end: 50`, `degrading_end: 70`) as percentages. The hook uses byte thresholds (`CONTEXT_WARN=100000`, `CONTEXT_ALERT=200000`, `CONTEXT_CRITICAL=300000`). The percentage calculation in the hook (`file_size * 70 / 300000`) already maps bytes to the 70% degrading boundary.
   - What's unclear: Whether the intent is for these to stay in sync or remain independent.
   - Recommendation: Keep byte thresholds as-is for Phase 154. The config `zone_boundaries` are planner cost-model values, not hook thresholds. Document in code comment that `CONTEXT_CRITICAL=300000` aligns with `degrading_end=70%`.

2. **Should `.context-metrics.json` be gitignored?**
   - What we know: `.planning/.session-end-marker.json` is a runtime artifact. `.planning/` is tracked in git but runtime JSON files like this are transient.
   - What's unclear: Project convention for `.planning/` runtime files vs tracked files.
   - Recommendation: Check `.gitignore` before planning. Add to `.gitignore` if not already excluded.

3. **What consumers will read `.context-metrics.json`?**
   - What we know: Not defined yet. The metrics file is new infrastructure.
   - What's unclear: Whether agents, the planner, or Muninn recall should read it.
   - Recommendation: Write it now; consumers can be wired in later phases. Structure should be stable/forward-compatible.

## Sources

### Primary (HIGH confidence)

- Direct file read: `src/hooks/scripts/context-check-throttled.sh` — complete logic analysis
- Direct file read: `src/hooks/scripts/context-monitor.sh` — zone calculation reference implementation
- Direct file read: `.planning/config.json` — zone_boundaries, thresholds confirmed
- Direct file read: `.claude/settings.json` — PostToolUse hook registration, async: true confirmed
- Direct file read: `src/hooks/scripts/_lib/common.sh` — guard_dedup, run_bridge, read_session_id patterns
- Direct file read: `src/hooks/scripts/snapshot-sync.sh` — established checkpoint throttle pattern
- Direct file read: `src/hooks/scripts/session-persist.sh` — Bun.write() JSON file pattern
- Bash verification: `.planning/.context-metrics.json` does not exist (must be created)

### Secondary (MEDIUM confidence)

- Codebase grep: PostToolUse stdin schema confirmed from `post-edit-format.sh` line 10-14; consistent across all hooks
- Codebase grep: `run_bridge snapshot` pattern from `snapshot-sync.sh` line 67

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all tools verified from codebase
- Architecture: HIGH — patterns derived from existing hooks in same file set
- Pitfalls: HIGH — derived from reading actual code and project conventions
- Stdin schema: HIGH — confirmed from multiple hook file headers

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable domain — hook infrastructure changes rarely)
