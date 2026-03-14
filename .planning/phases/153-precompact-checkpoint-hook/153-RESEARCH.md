# Phase 153: PreCompact Checkpoint Hook - Research

**Researched:** 2026-03-14
**Domain:** Claude Code hook system, MuninnDB HTTP API, shell script patterns
**Confidence:** HIGH

---

## Summary

Phase 153 implements a `PreCompact` hook that saves a 5-field checkpoint when Claude Code fires the `PreCompact` event (before any `/compact` or auto-compact operation). The hook writes to two destinations simultaneously: MuninnDB via its REST API and a local filesystem fallback at `.planning/.context-checkpoint.json`.

The design decisions are already locked in `docs/memory-system/decisions.md` (Decision 1 and 2). Research confirms all three implementation pillars: (a) the `PreCompact` event is real, documented, and fires with a `transcript_path` in stdin; (b) MuninnDB exposes a native REST API at `POST /api/engrams` callable with `curl` from shell; (c) the existing hook infrastructure (canonicalHookRegistry, config generators, \_lib/common.sh) provides clear patterns for registration and error handling.

**Primary recommendation:** Create `src/hooks/scripts/pre-compact-checkpoint.sh` using the stdin-parse pattern from `context-monitor.sh`, dual-write to MuninnDB REST (`POST /api/engrams`) and filesystem, register with `event: "pre_compact"` + `async: true` in `canonicalHookRegistry`, and add the `PreCompact` entry to `.claude/settings.json`. No other files need to be created for Phase 153 scope.

---

## Standard Stack

### Core

| Tool | Version | Purpose                 | Why Standard                                        |
| ---- | ------- | ----------------------- | --------------------------------------------------- |
| bash | system  | Hook script runtime     | All existing hooks use bash                         |
| bun  | 1.x     | JSON parsing in hooks   | Project convention — `bun -e "..."` instead of `jq` |
| curl | system  | MuninnDB REST API write | Network call from shell; no SDK in shell scripts    |

### Supporting

| Library                                  | Version | Purpose                                        | When to Use                            |
| ---------------------------------------- | ------- | ---------------------------------------------- | -------------------------------------- |
| `_lib/common.sh`                         | in-repo | `guard_dedup`, `read_session_id`, `run_bridge` | Source at top of every hook script     |
| `canonicalHookRegistry`                  | in-repo | Registration point for all hooks               | Adding new hooks to the build pipeline |
| `generateClaudeHooksConfigFromCanonical` | in-repo | Generates `.claude/settings.json` hook entries | Build step — not called manually       |

### Alternatives Considered

| Instead of              | Could Use     | Tradeoff                                                                            |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------- |
| curl to REST API        | MCP tool call | MCP tools are unavailable in hooks (shell context only); REST is the only option    |
| bun -e for JSON parsing | jq            | Project convention forbids jq; bun is always available                              |
| async: true             | async: false  | PreCompact is explicitly fire-and-forget per docs; async avoids blocking compaction |

---

## Architecture Patterns

### Hook Script Structure

Every hook script in this repo follows an identical header and initialization pattern:

```bash
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
```

### Stdin Parsing Pattern

The established pattern (from `context-monitor.sh` and `session-persist.sh`) for reading stdin JSON in hooks:

```bash
# Read stdin JSON (may be empty on non-Claude platforms)
INPUT=$(cat || true)

if [ -z "$INPUT" ]; then
  INPUT="{}"
fi

# Extract fields using bun -e (NOT jq — project convention)
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | bun -e "
  try {
    const data = JSON.parse(await Bun.stdin.text());
    const tp = data.transcript_path;
    if (tp) process.stdout.write(tp);
  } catch { /* no transcript_path */ }
" 2>/dev/null || true)

TRIGGER=$(printf '%s' "$INPUT" | bun -e "
  try {
    const data = JSON.parse(await Bun.stdin.text());
    process.stdout.write(data.trigger || 'unknown');
  } catch { process.stdout.write('unknown'); }
" 2>/dev/null || echo "unknown")
```

**Note on multi-field extraction:** Each `bun -e` invocation reads stdin once. To extract multiple fields, either run separate `bun -e` calls (passing the same `$INPUT` via `printf '%s'`), or do a single `bun -e` that outputs structured data and parse the output. The existing hooks use the separate-call pattern.

### State Reading Pattern

The hook reads `.planning/STATE.md` and the bridge for the 5 checkpoint fields. This follows the pattern from `context-check-throttled.sh`:

```bash
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
STATE_MD="$PROJECT_DIR/.planning/STATE.md"
STATE_JSON="$PROJECT_DIR/.planning/state.json"
```

Bridge reads use `run_bridge` from `_lib/common.sh`:

```bash
PHASE=$(run_bridge read-phase 2>/dev/null | bun -e "
  try {
    const r = JSON.parse(await Bun.stdin.text());
    process.stdout.write(r.phase || '');
  } catch { process.stdout.write(''); }
" 2>/dev/null || echo "")
```

### Dual-Write Pattern

The hook writes to two destinations. File write uses `bun -e` with `Bun.write`. MuninnDB write uses `curl`:

```bash
# 1. Filesystem write (fast, reliable fallback)
HOOK_CHECKPOINT="$CHECKPOINT_JSON" HOOK_DIR="$PROJECT_DIR/.planning" bun -e "
  const checkpoint = JSON.parse(process.env.HOOK_CHECKPOINT);
  await Bun.write(process.env.HOOK_DIR + '/.context-checkpoint.json',
    JSON.stringify(checkpoint, null, 2) + '\n');
" 2>/dev/null || true

# 2. MuninnDB REST write (fire-and-forget, best-effort)
MUNINN_URL="${MUNINN_DB_URL:-http://127.0.0.1:8476}"
MUNINN_KEY="${MUNINN_DB_API_KEY:-}"

if [ -n "$MUNINN_KEY" ]; then
  curl -s -o /dev/null --max-time 5 \
    -X POST "${MUNINN_URL}/api/engrams" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${MUNINN_KEY}" \
    -d "$ENGRAM_JSON" \
    2>/dev/null || true
else
  curl -s -o /dev/null --max-time 5 \
    -X POST "${MUNINN_URL}/api/engrams" \
    -H "Content-Type: application/json" \
    -d "$ENGRAM_JSON" \
    2>/dev/null || true
fi
```

### Hook Registration Pattern

New hooks are registered in `src/hooks/__helpers/hook-registry.ts` inside `canonicalHookRegistry`:

```typescript
"pre-compact-checkpoint": () => ({
  event: "pre_compact",
  script: "pre-compact-checkpoint.sh",
  timeout: 15,
  async: true,
  status_message: "Saving context checkpoint...",
}),
```

The `generateClaudeHooksConfigFromCanonical` function then generates the `PreCompact` entry in `.claude/settings.json` automatically during `bun run build:all`. However, because `.claude/settings.json` is a generated file that cannot be edited directly, the build must run. For Phase 153, the planner should include both the source registration AND a manual update to `.claude/settings.json` to avoid requiring `build:all` (which crashes Claude Code — see MEMORY.md).

Manual `.claude/settings.json` entry to add:

```json
"PreCompact": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-compact-checkpoint.sh",
        "timeout": 15,
        "async": true,
        "statusMessage": "Saving context checkpoint..."
      }
    ]
  }
]
```

### Anti-Patterns to Avoid

- **Do not use `jq`** — project convention mandates `bun -e` for JSON parsing
- **Do not block compaction** — `async: true` is required; exit 0 always
- **Do not throw on failure** — all operations are best-effort, wrapped in `|| true`
- **Do not inject shell variables into bun -e strings** — use `HOOK_VAR=value bun -e "process.env.HOOK_VAR"` pattern (SEC pattern from session-persist.sh)
- **Do not write stdout** — `PreCompact` hooks have no stdout decision control per official docs

---

## Don't Hand-Roll

| Problem                  | Don't Build           | Use Instead                                                       | Why                                                                                          |
| ------------------------ | --------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| MuninnDB client in shell | Custom REST wrapper   | `curl -s -o /dev/null` with existing env vars                     | One-liner curl is the established pattern; muninn-http.ts is for TypeScript only             |
| JSON construction        | String interpolation  | `bun -e` with `process.env.*` pattern                             | Avoids shell injection; consistent with hook security pattern (SEC-02 in session-persist.sh) |
| State reading            | Direct file parsing   | `run_bridge read-phase` + STATE.md grep fallback                  | Bridge is the canonical state source                                                         |
| Dedup guard              | Custom timestamp file | `guard_dedup "pre-compact-checkpoint" 10`                         | Already implemented in `_lib/common.sh`                                                      |
| Script path resolution   | Hardcoded paths       | `HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` | Every existing hook does this                                                                |

**Key insight:** The hook is shell + curl + bun, not TypeScript. The `muninn-http.ts` TypeScript client is for the emitter package. Shell hooks call the REST API directly via curl.

---

## Common Pitfalls

### Pitfall 1: Calling MCP Tools from Shell Hooks

**What goes wrong:** Hook tries to call `mcp__muninn__muninn_remember` — this is a Claude Code MCP tool, not available in shell context.

**Why it happens:** MCP tools appear in Claude's tool list but are only accessible within LLM conversations, not shell scripts.

**How to avoid:** Use `curl` to the MuninnDB REST API (`POST /api/engrams`). The REST API runs at `http://127.0.0.1:8476` (env var `MUNINN_DB_URL`). Auth via `MUNINN_DB_API_KEY` env var.

**Warning signs:** Any mention of `mcp__muninn__*` in a shell script is wrong.

### Pitfall 2: MuninnDB URL vs MCP URL Confusion

**What goes wrong:** Using port `8750` (the MCP transport URL from `claude_desktop_config.json`) instead of port `8476` (the native REST API).

**Why it happens:** MuninnDB exposes two interfaces: a JSON-RPC MCP transport at `:8750/mcp` and a native REST API at `:8476`. The MCP transport is for Claude Code tool calls; the REST API is for direct HTTP clients.

**How to avoid:** Use `MUNINN_DB_URL` env var (defaults to `http://127.0.0.1:8476`). The `muninn-config.ts` file confirms this: `const MUNINN_BASE_URL = process.env.MUNINN_DB_URL ?? "http://127.0.0.1:8476"`.

**Warning signs:** Hardcoding `8750` or `/mcp` path in curl commands.

### Pitfall 3: Shell Injection via Checkpoint Content

**What goes wrong:** Building JSON strings with shell variable interpolation allows injection of arbitrary JSON.

**Why it happens:** Temptation to do `BODY='{"content":"'"$VAR"'"}'`.

**How to avoid:** Use the `HOOK_VAR=value bun -e "process.env.HOOK_VAR"` pattern to build JSON safely. The existing `session-persist.sh` SEC-02 comment documents this pattern.

**Warning signs:** Single-quoted JSON strings with double-quote expansions.

### Pitfall 4: Stdout Output Blocking Review

**What goes wrong:** Hook prints anything to stdout, which Claude Code interprets as a hook decision.

**Why it happens:** Debugging `echo` statements left in the script.

**How to avoid:** Per official docs, `PreCompact` hooks have no decision control — but any stdout output may still be displayed to the user. Keep all stdout suppressed with `2>/dev/null || true`. Use `/dev/null` redirects.

**Warning signs:** Unguarded `echo` or `printf` statements.

### Pitfall 5: Running build:all During Claude Code Session

**What goes wrong:** `bun run build:all` crashes the Claude Code process (documented in MEMORY.md).

**Why it happens:** The build pipeline has a session lock interaction with Claude Code's process model.

**How to avoid:** Register the hook in BOTH `canonicalHookRegistry` (source) AND manually update `.claude/settings.json` (generated). The planner must include both tasks. Do not instruct the executor to run `bun run build:all`.

**Warning signs:** Any task that says "run build:all to deploy."

---

## Code Examples

### PreCompact Stdin JSON (HIGH confidence)

Source: Official Claude Code docs at `https://code.claude.com/docs/en/hooks`

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "PreCompact",
  "trigger": "manual",
  "custom_instructions": ""
}
```

`trigger` values: `"manual"` (user ran `/compact`) or `"auto"` (Claude Code auto-compacted).

### MuninnDB REST API Write (HIGH confidence)

Source: `packages/luca-framework/src/emitter/__helpers/muninn-http.ts` and `packages/luca-observer/lib/muninn-config.ts`

```bash
# Curl pattern for writing an engram to MuninnDB REST API
MUNINN_URL="${MUNINN_DB_URL:-http://127.0.0.1:8476}"
MUNINN_KEY="${MUNINN_DB_API_KEY:-}"

ENGRAM_JSON=$(HOOK_VAULT="luca-framework" HOOK_CONCEPT="session:checkpoint" HOOK_CONTENT="..." bun -e "
  const payload = {
    vault: process.env.HOOK_VAULT,
    concept: process.env.HOOK_CONCEPT,
    content: process.env.HOOK_CONTENT,
    type: 'observation',
  };
  process.stdout.write(JSON.stringify(payload));
")

curl -s -o /dev/null --max-time 5 \
  -X POST "${MUNINN_URL}/api/engrams" \
  -H "Content-Type: application/json" \
  ${MUNINN_KEY:+-H "Authorization: Bearer ${MUNINN_KEY}"} \
  -d "$ENGRAM_JSON" \
  2>/dev/null || true
```

Response on success: `{ "id": "<ULID>" }` — discarded since we use `-o /dev/null`.

### 5-Field Checkpoint JSON Structure (HIGH confidence)

Source: `docs/memory-system/decisions.md` Decision 2

```json
{
  "vault": "luca-framework",
  "concept": "session:checkpoint",
  "type": "observation",
  "content": "## Context Checkpoint\n\n### Position\n- Phase: {phase_id}-{phase_name}\n- Task: {current} of {total}\n- Complexity: {level}\n\n### Current Work\n- Goal: {what we're trying to achieve}\n- Approach: {how we're doing it}\n- Next Step: {specific action to take next}\n\n### Key Decisions\n- {decision}: {rationale}\n\n### Completed Summary\n- {brief list of what's done this session}",
  "tags": ["checkpoint", "context", "session"]
}
```

**5 fields (from STATE.md + bridge):**

| Field               | Source                                          | How to Extract                                                        |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| `task_position`     | bridge `read-phase` + STATE.md                  | `run_bridge read-phase` → `phase` field; grep STATE.md for task count |
| `next_action`       | STATE.md `Stopped at:` or `## Current Position` | grep "Stopped at\|Next:\|Plan:" from STATE.md                         |
| `decisions`         | STATE.md `## Decisions` section                 | Extract last 3 bullet items from `## Decisions` section               |
| `approach`          | STATE.md `## Current Position`                  | Extract current plan/task description                                 |
| `completed_summary` | STATE.md or git log                             | `git log --oneline -5` for recent commits                             |

### Filesystem Checkpoint File (HIGH confidence)

Source: `docs/memory-system/decisions.md` Decision 1 + session-persist.sh pattern

```bash
# Write checkpoint to .planning/.context-checkpoint.json
HOOK_PAYLOAD="$CHECKPOINT_JSON" HOOK_PROJECT_DIR="$PROJECT_DIR" bun -e "
  const checkpoint = JSON.parse(process.env.HOOK_PAYLOAD);
  checkpoint.saved_at = new Date().toISOString();
  await Bun.write(
    process.env.HOOK_PROJECT_DIR + '/.planning/.context-checkpoint.json',
    JSON.stringify(checkpoint, null, 2) + '\n'
  );
" 2>/dev/null || true
```

### canonicalHookRegistry Registration (HIGH confidence)

Source: `src/hooks/__helpers/hook-registry.ts` lines 27-99

```typescript
"pre-compact-checkpoint": () => ({
  event: "pre_compact",           // canonical event — maps to "PreCompact" in Claude Code
  script: "pre-compact-checkpoint.sh",
  timeout: 15,
  async: true,                    // fire-and-forget; compaction must not be blocked
  status_message: "Saving context checkpoint...",
}),
```

### Claude settings.json Manual Entry (HIGH confidence)

Source: `.claude/settings.json` + `generateClaudeHooksConfigFromCanonical` output format

```json
"PreCompact": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-compact-checkpoint.sh",
        "timeout": 15,
        "async": true,
        "statusMessage": "Saving context checkpoint..."
      }
    ]
  }
]
```

---

## State of the Art

| Old Approach                  | Current Approach                    | When Changed                             | Impact                                                  |
| ----------------------------- | ----------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| No PreCompact hook existed    | PreCompact event in Claude Code     | Discovered 2026-03-13 (see decisions.md) | Enables deterministic checkpointing                     |
| jq for JSON parsing in hooks  | `bun -e` for JSON parsing           | Project convention                       | All hooks updated; no jq dependency                     |
| MuninnDB via MCP tools only   | MuninnDB REST API at `/api/engrams` | Already implemented in muninn-http.ts    | Enables direct HTTP writes from shell                   |
| WORKING.md for session memory | MuninnDB + filesystem               | Migration complete                       | session-persist.sh and session-start.sh already updated |

**Deprecated/outdated:**

- `WORKING.md` files: Removed, memory now in MuninnDB MCP
- `jq` in hooks: Replaced with `bun -e` pattern

---

## Open Questions

1. **checkpoint content extraction accuracy**
   - What we know: STATE.md has `## Current Position`, `## Decisions`, `## Session Continuity` sections
   - What's unclear: The exact grep patterns to reliably extract "next action" and "decisions" vary by STATE.md shape (it's not always consistent)
   - Recommendation: Use best-effort grep with fallback to empty string; content quality degrades gracefully

2. **MuninnDB availability at PreCompact time**
   - What we know: MuninnDB runs as a local server; the hook is async
   - What's unclear: Whether MuninnDB is guaranteed to be running when `PreCompact` fires (e.g., if auto-compact happens before session-start has completed)
   - Recommendation: `curl --max-time 5 ... || true` — all MuninnDB writes are best-effort; filesystem is the reliable fallback

3. **op_id idempotency for MuninnDB engram**
   - What we know: `mcp__muninn__muninn_remember` supports `op_id` for idempotency
   - What's unclear: Whether the REST API `POST /api/engrams` also supports `op_id` (the TypeScript client in `muninn-http.ts` does not include it, suggesting it may not be supported at the REST layer)
   - Recommendation: Skip `op_id` in Phase 153; if duplicate checkpoints accumulate, address in a follow-up phase

---

## Files to Create vs Modify

### Create (new files)

| File                                          | Type         | Notes                              |
| --------------------------------------------- | ------------ | ---------------------------------- |
| `src/hooks/scripts/pre-compact-checkpoint.sh` | Shell script | The PreCompact hook implementation |

### Modify (existing files)

| File                                      | Change                                                          | Why                                                           |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/hooks/__helpers/hook-registry.ts`    | Add `"pre-compact-checkpoint"` entry to `canonicalHookRegistry` | Registers hook in build pipeline                              |
| `.claude/settings.json`                   | Add `"PreCompact"` event block                                  | Activates hook in Claude Code immediately (without build:all) |
| `.claude/hooks/pre-compact-checkpoint.sh` | Copy/symlink of the script                                      | Generated file — must exist for Claude Code to find it        |

**Note on generated files:** `.claude/hooks/` is generated from `src/hooks/scripts/` via `bun run build:all`. Since `build:all` cannot run during a Claude Code session, the executor must manually copy the script to `.claude/hooks/pre-compact-checkpoint.sh` as well (identical content to the source). This is a one-time exception; the next `bun run build:all` will keep it in sync.

---

## Sources

### Primary (HIGH confidence)

- Official Claude Code hooks docs at `https://code.claude.com/docs/en/hooks` — PreCompact stdin schema, async hook behavior, no stdout for PreCompact
- `src/hooks/__helpers/hook-registry.ts` — canonicalHookRegistry structure and pattern
- `src/hooks/scripts/context-monitor.sh` — stdin parsing pattern with `bun -e`, security patterns SEC-01 and SEC-02
- `src/hooks/scripts/session-persist.sh` — filesystem write pattern with `Bun.write`, SEC-02 env var injection
- `src/hooks/scripts/_lib/common.sh` — `guard_dedup`, `run_bridge`, `read_session_id` helpers
- `.claude/settings.json` — generated output format for hook registration
- `packages/luca-framework/src/emitter/__helpers/muninn-http.ts` — REST endpoint `POST /api/engrams`
- `packages/luca-observer/lib/muninn-config.ts` — `MUNINN_DB_URL` env var, port `8476`, full endpoint list
- `docs/memory-system/decisions.md` Decision 1 and 2 — checkpoint design, 5-field format, dual-write strategy

### Secondary (MEDIUM confidence)

- `src/hooks/__schemas/hook.schemas.ts` — confirms `pre_compact` is in `CANONICAL_EVENTS`
- `src/hooks/__helpers/platform-adapters.ts` — confirms `pre_compact` maps to `"PreCompact"` in Claude Code
- `.planning/config.json` `planner.zone_boundaries` — `peak_end: 30`, `good_end: 50`, `degrading_end: 70` (relevant for proactive checkpoint extension)

### Tertiary (LOW confidence)

- MuninnDB REST API `op_id` support — not verified at REST layer; only confirmed for MCP tool layer

---

## Metadata

**Confidence breakdown:**

- Standard stack (bash/bun/curl): HIGH — all existing hooks use this exact combination
- Architecture (hook registration, stdin parsing): HIGH — copied from verified existing patterns
- MuninnDB REST endpoint: HIGH — confirmed in two TypeScript client files in-repo
- PreCompact stdin format: HIGH — confirmed in official docs
- Pitfalls (curl port, MCP unavailability): HIGH — derived from code reading, not assumption
- Checkpoint content extraction from STATE.md: MEDIUM — grep patterns need validation against real STATE.md shapes

**Research date:** 2026-03-14
**Valid until:** 2026-04-13 (30 days — Claude Code hook schema is stable; MuninnDB REST API is stable)
