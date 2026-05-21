---
phase: 162
plan: 1
type: feature
autonomous: false
wave: 1
depends_on: []
---

# Phase 162 Plan 1: Proactive Context Management — Observational Memory

## Objective

Implement Mastra-inspired observational memory for Claude Code sessions: a continuous session observer that writes structured context snapshots to MuninnDB throughout the session, proactive `/clear` suggestion when context degrades, a rich enhanced restore on session start, static compact instructions already present in CLAUDE.md (confirmed sufficient), and three new hook events that feed the observation pipeline.

The system turns context resets from a disruptive, lossy event into a fast, zero-loss operation: MuninnDB always holds recent observations, so `/clear` followed by session start produces a fully-primed context in seconds.

All research questions from the todo are resolved in CONTEXT.md. Implementation targets TypeScript-only hooks (Phase 160 migration completed). Do NOT run `bun run build:all`.

## Context

- @.planning/phases/162-proactive-context-management/162-CONTEXT.md — all decisions
- @src/hooks/impl/context-check-throttled.ts — extend with observation + clear suggestion logic
- @src/hooks/impl/session-start.ts — extend with enhanced restore logic
- @src/hooks/\_\_schemas/hook.schemas.ts — add SessionObservationSchema
- @src/hooks/\_\_helpers/hook-registry.ts — register 3 new hooks
- @src/hooks/scripts/context-check-throttled.sh — shim pattern reference
- @.planning/config.json — add context_management section
- @CLAUDE.md — compact instructions section (already present; verify completeness)

---

## Wave 1: Continuous Session Observer + Compact Instructions

### Task 1.1: Add SessionObservationSchema to hook.schemas.ts

**Type:** auto
**TDD:** false
**Depends on:** (none)

Add a Zod schema `SessionObservationSchema` to `src/hooks/__schemas/hook.schemas.ts` for the observation engrams that the hook layer writes to MuninnDB.

The schema must capture:

- `concept` — MuninnDB concept string (`session:observation-{timestamp}`)
- `timestamp` — ISO 8601 string
- `zone` — context zone at time of observation (`"peak" | "good" | "degrading" | "stop"`)
- `usage_percent` — numeric, 0–100
- `git_branch` — current branch name (or empty string if unavailable)
- `git_diff_summary` — short summary of files changed since last observation (or empty)
- `phase_context` — current phase/plan/status from STATE.md (or empty)
- `source` — `"zone_transition"` (the only trigger in this phase)

Export the type as `SessionObservation`. This schema lives in the `hooks` T3 domain; it must NOT be imported by any T0–T2 domain.

**Files to create/edit:**

- `src/hooks/__schemas/hook.schemas.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes with no new errors
- Schema is exported from the hooks barrel (`src/hooks/index.ts`) or is internal — confirm which is appropriate given T3 domain position (internal is acceptable)

---

### Task 1.2: Extend context-check-throttled.ts with observation logic

**Type:** auto
**TDD:** false
**Depends on:** 1.1

Extend `src/hooks/impl/context-check-throttled.ts` to write a `session:observation-{timestamp}` engram to MuninnDB on every zone transition (i.e., when `currSev > prevSev`). This is the deterministic hook layer of the hybrid observer.

**Observation write logic (insert after the existing proactive checkpoint block):**

1. Read current git branch via `git branch --show-current` (async, best-effort — empty string on failure)
2. Read git diff summary via `git diff --name-only HEAD` truncated to first 10 lines (best-effort)
3. Read phase context from `.planning/STATE.md` — extract the first non-empty `Phase:` and `Plan:` lines (best-effort)
4. Construct a `SessionObservation` payload matching the schema from Task 1.1
5. POST to MuninnDB REST API (fire-and-forget, no await on result):
   - Endpoint pattern: `http://localhost:7474/memory` (or use the existing pattern from pre-compact-checkpoint.ts if it calls MuninnDB differently — match the existing pattern)
   - Vault: read from `.planning/config.json` `muninn.vault` field, fall back to `"luca-framework"`
   - Concept: `session:observation-${Date.now()}`
   - Content: JSON-serialized observation payload

6. After the MuninnDB write, inject a `systemMessage` on zone transition (in addition to or replacing the existing degrading/stop message):
   - `peak → good` transition: `"[Session Observer] Context at {X}% (peak→good). Writing zone observation to MuninnDB. Please summarize your current goal and approach via: mcp__muninn__muninn_remember(vault: \"luca-framework\", concept: \"session:observation-work\", content: \"[current goal, approach, recent decisions]\")"`
   - `good → degrading` transition: `"[Session Observer] Context at {X}% (good→degrading). Observation saved. Consider /clear at your next natural stopping point."`
   - Existing `degrading`/`stop` zone warning is preserved for subsequent polls when no new transition occurs.

The observation write must be wrapped in try/catch and must never throw or cause the hook to exit non-zero.

**Files to create/edit:**

- `src/hooks/impl/context-check-throttled.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Logic path: set zone to "good" in a test env, verify the systemMessage contains "[Session Observer]"
- Observation block is guarded by `currSev > prevSev` — no writes on stable zones

---

### Task 1.3: Verify and augment CLAUDE.md compact instructions

**Type:** auto
**TDD:** false
**Depends on:** (none — independent)

Verify the existing "Compact Instructions" section in `CLAUDE.md` matches Decision 5 in CONTEXT.md exactly. The static content is already present; confirm it includes all six bullet points:

1. Current phase, task position, and complexity level
2. Key decisions made this session with rationale
3. The current approach and next planned action
4. Any blockers or open questions
5. File paths recently modified and why
6. The MuninnDB vault name (luca-framework)

If any bullet is missing, add it. If the section is complete, no edit is needed. The dynamic `.planning/.compact-context.md` approach is explicitly deferred per Decision 5.

**Files to create/edit:**

- `CLAUDE.md` (edit only if bullets are missing)

**Verification:**

- Six bullets present under "## Compact Instructions"
- No reference to `.planning/.compact-context.md` added (deferred)

---

### Task 1.4: Add context_management section to .planning/config.json

**Type:** auto
**TDD:** false
**Depends on:** (none — independent)

Add a `context_management` top-level key to `.planning/config.json`:

```json
"context_management": {
  "clear_suggestion_threshold": 42,
  "clear_suggestion_enabled": true,
  "observation_on_zone_transition": true
}
```

This config is read by `context-check-throttled.ts` in Task 1.2 (the clear suggestion threshold) and Task 2.1 (the proactive clear prompting logic). Adding it now ensures the config contract is established before the code that reads it.

**Files to create/edit:**

- `.planning/config.json`

**Verification:**

- `bun -e "const c = require('./.planning/config.json'); console.log(c.context_management.clear_suggestion_threshold)"` prints `42`
- No other existing config keys disturbed

---

## Wave 1 Verification

- `bunx --bun tsc --noEmit` — zero new type errors across all modified files
- `src/hooks/__schemas/hook.schemas.ts` exports `SessionObservationSchema` and `SessionObservation`
- `context-check-throttled.ts` contains observation write logic gated on `currSev > prevSev`
- `CLAUDE.md` has all six compact instruction bullets
- `config.json` has `context_management` section with `clear_suggestion_threshold: 42`

---

## Wave 2: Proactive Clear Prompting + Enhanced Restore

### Task 2.1: Extend context-check-throttled.ts with clear suggestion logic

**Type:** auto
**TDD:** false
**Depends on:** 1.2, 1.4

Extend the zone-transition block in `context-check-throttled.ts` to inject a `/clear` suggestion when `usagePercent` crosses the configured `clear_suggestion_threshold` (default 42 from config).

**Logic:**

1. Read `context_management.clear_suggestion_threshold` from `.planning/config.json` (default 42 if missing or unreadable)
2. Read `context_management.clear_suggestion_enabled` (default true)
3. When `clear_suggestion_enabled` is true AND `usagePercent >= clear_suggestion_threshold` AND zone has transitioned to `degrading` (first crossing):
   - Inject `systemMessage`:
     ```
     [Context Management] Context at {X}%. Session observations are saved to MuninnDB.
     Consider running /clear at your next natural stopping point (after a commit, task completion, or phase boundary). Context will be fully restored on the next session start.
     ```
4. When zone reaches `stop` (≥ second threshold):
   - Inject escalated message:
     ```
     [Context Management] Context at {X}% — degraded zone. Strongly recommend /clear now. All observations saved to MuninnDB. Run /clear then start a new session for full context restore.
     ```

Use a separate throttle file (`/tmp/.luca-clear-suggest-{hash}-ts`) with a 10-minute TTL to prevent suggestion spam across multiple polls at the same zone level.

The clear suggestion systemMessage replaces (not appends to) the existing basic zone warning for the degrading/stop case. The observation systemMessage from Task 1.2 on zone transition is still emitted.

**Files to create/edit:**

- `src/hooks/impl/context-check-throttled.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Suggestion logic is gated on both threshold AND zone transition (not on every poll)
- Throttle file prevents duplicate suggestions within 10 minutes

---

### Task 2.2: Extend session-start.ts with enhanced restore

**Type:** auto
**TDD:** false
**Depends on:** 1.1

Extend `src/hooks/impl/session-start.ts` to detect post-clear sessions and inject a rich working context restore message.

**Detection logic (insert after the existing stale session marker check, Step 3f):**

Check for recent MuninnDB observations by querying the MuninnDB REST API for `session:observation-*` engrams from the past 30 minutes. Use a simple HTTP GET to the recall endpoint with a time-bounded query. If the API call fails or returns no results, fall back gracefully (no restore message — cold start behavior is unchanged).

**Restore message construction:**

When recent observations are found (1 or more within 30 minutes):

1. Extract from the most recent observation: zone at clear time, usage_percent, git_branch, git_diff_summary, phase_context
2. Query MuninnDB for any `session:observation-work` engrams (written by the LLM prompt layer from Task 1.2) from the past 30 minutes
3. Query MuninnDB for relevant `pattern:*` and `pitfall:*` engrams using the phase_context as the recall query (best-effort; skip if recall fails)
4. Assemble restore message targeting 3–5KB:

```
[Context Restored] Fresh session — previous context cleared at {usage_percent}%.

## Working Context (from MuninnDB observations)

- Branch: {git_branch}
- Phase context: {phase_context}
- Files in progress: {git_diff_summary}
- Zone at clear: {zone}

## Recent Session Observations

{observation content from session:observation-work if available, else "(LLM observation not recorded — see git diff for recent changes)"}

## Recalled Patterns & Pitfalls

{top 2-3 pattern/pitfall items relevant to phase_context, or "(none recalled)"}

MuninnDB vault: luca-framework | Run /context-restore for deeper semantic recall.
```

5. Emit via `emitResult({ systemMessage: restoreMessage })` — this replaces (not appends) the existing stale-session message for post-clear sessions.

6. All HTTP calls must be fire-and-forget style with explicit try/catch. If any step fails, fall back to the existing cold-start behavior (no restore message emitted).

**Files to create/edit:**

- `src/hooks/impl/session-start.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Enhancement is fully gated in try/catch — if MuninnDB is unavailable, session-start exits cleanly with no error
- Restore logic does NOT delete or interfere with the existing stale session marker cleanup or lock file creation

---

## Wave 2 Verification

- `bunx --bun tsc --noEmit` — zero new type errors
- `context-check-throttled.ts` emits `/clear` suggestion at 42% threshold (degrading zone transition)
- `session-start.ts` enhanced restore block is correctly gated behind recent-observation detection
- All new HTTP calls to MuninnDB are wrapped in try/catch with graceful fallback
- No regressions to existing session-start behaviors (bun check, directory creation, state machine init, lock file, stale session detection)

---

## Wave 3: New Hook Events

### Task 3.1: Create user-prompt-submit.ts hook

**Type:** auto
**TDD:** false
**Depends on:** (none — independent of waves 1-2)

Create `src/hooks/impl/user-prompt-submit.ts`. This hook fires on `UserPromptSubmit` — before each user message is processed.

**Purpose:** Flush the latest file-system observation to MuninnDB on every user prompt (not just zone transitions). This ensures MuninnDB has a snapshot at the start of every work unit.

**Logic:**

1. Drain stdin (standard pattern via `drainStdin()`)
2. Apply a per-project throttle: only fire once per 5 minutes (throttle file: `/tmp/.luca-prompt-submit-{hash}-ts`). If throttle is active, exit 0 silently.
3. Read current context metrics from `.planning/.context-metrics.json` (best-effort)
4. Read git branch (best-effort)
5. POST a lightweight `session:observation-prompt-{timestamp}` engram to MuninnDB with:
   - `zone`, `usage_percent` from metrics
   - `git_branch`
   - `source: "user_prompt_submit"`
6. Always exit 0. The hook must complete in under 5 seconds (async: true in registry).

**Files to create/edit:**

- `src/hooks/impl/user-prompt-submit.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File follows the same structural pattern as `context-check-throttled.ts` (imports from `_lib/hook-io.ts`, `_lib/bridge.ts`; uses `guardDedup`, `exitSuccess`, `projectDir`, `projectHash`)

---

### Task 3.2: Create subagent-stop.ts hook

**Type:** auto
**TDD:** false
**Depends on:** (none — independent)

Create `src/hooks/impl/subagent-stop.ts`. This hook fires on `SubagentStop` — after a subagent completes.

**Purpose:** Capture a summary of what the subagent did as a session observation.

**Logic:**

1. Drain stdin and parse the stop event payload (best-effort JSON parse). The payload may contain: `subagent_id`, `output`, `summary`, `tool_calls_count`
2. If payload is parseable and contains a `summary` or `output` field (non-empty), POST to MuninnDB:
   - Concept: `session:observation-subagent-{timestamp}`
   - Content: `"Subagent completed. Summary: {summary_or_output_truncated_to_500_chars}. Tools used: {tool_calls_count | 'unknown'}"`
   - Source: `"subagent_stop"`
3. If payload is empty or unparseable, exit 0 silently (no write).
4. Always exits 0. No dedup guard needed (each subagent stop is distinct).

**Files to create/edit:**

- `src/hooks/impl/subagent-stop.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Follows the structural pattern of existing hooks
- Gracefully handles empty or malformed stdin

---

### Task 3.3: Create post-tool-use-failure.ts hook

**Type:** auto
**TDD:** false
**Depends on:** (none — independent)

Create `src/hooks/impl/post-tool-use-failure.ts`. This hook fires on `PostToolUseFailure` — after a tool call fails.

**Purpose:** Record error patterns as MuninnDB pitfall candidates for lu-learner to promote in the next learning capture cycle.

**Logic:**

1. Drain stdin and parse the failure payload (best-effort). Expected fields: `tool_name`, `error_message`, `command` (for Bash failures)
2. If payload is parseable:
   - Construct a pitfall candidate string: `"Tool {tool_name} failed: {error_message_truncated_to_300_chars}. Command: {command_truncated_to_200_chars | 'N/A'}"`
   - POST to MuninnDB:
     - Concept: `session:tool-failure-{timestamp}`
     - Content: pitfall candidate string
     - Source: `"post_tool_use_failure"`
3. Apply a per-tool-name throttle: only record the same `tool_name + error_message` pattern once per 5 minutes to avoid flooding on repeated failures. Use a simple in-memory Map keyed on `hash(tool_name + error_message)` — this is acceptable since the hook is a short-lived process.
4. Always exits 0.

**Files to create/edit:**

- `src/hooks/impl/post-tool-use-failure.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Follows structural hook pattern
- Gracefully handles empty stdin

---

### Task 3.4: Create shell shims for 3 new hooks

**Type:** auto
**TDD:** false
**Depends on:** 3.1, 3.2, 3.3

Create three thin shell shims in `src/hooks/scripts/` following the exact pattern of existing shims:

```bash
#!/bin/bash
# Thin shim — all logic in TypeScript
exec bun "$(dirname "$0")/../../impl/{hook-name}.ts" "$@" <&0
```

Files to create:

- `src/hooks/scripts/user-prompt-submit.sh`
- `src/hooks/scripts/subagent-stop.sh`
- `src/hooks/scripts/post-tool-use-failure.sh`

Permissions: each file must be executable (`chmod +x` is not necessary if the build pipeline handles it, but confirm that existing shims have no special permission setup in the build — match whatever pattern exists).

**Files to create/edit:**

- `src/hooks/scripts/user-prompt-submit.sh`
- `src/hooks/scripts/subagent-stop.sh`
- `src/hooks/scripts/post-tool-use-failure.sh`

**Verification:**

- All three shims have the correct `exec bun` line pointing to the correct `impl/` path
- Paths are relative using `$(dirname "$0")/../../impl/` — not absolute

---

### Task 3.5: Register 3 new hooks in hook-registry.ts

**Type:** auto
**TDD:** false
**Depends on:** 3.4

Add three new entries to `canonicalHookRegistry` in `src/hooks/__helpers/hook-registry.ts`:

```typescript
"user-prompt-submit": () => ({
  event: "user_prompt_submit",
  script: "user-prompt-submit.sh",
  timeout: 5,
  async: true,
  status_message: "Saving prompt observation...",
}),
"subagent-stop": () => ({
  event: "subagent_stop",
  script: "subagent-stop.sh",
  timeout: 5,
  async: true,
  status_message: "Capturing subagent summary...",
}),
"post-tool-use-failure": () => ({
  event: "post_tool_use_failure",
  script: "post-tool-use-failure.sh",
  timeout: 5,
  async: true,
  status_message: "Recording failure pattern...",
}),
```

All three events are already present in `CANONICAL_EVENTS` in `hook.schemas.ts` — confirm before adding (no schema change needed for this task).

**Files to create/edit:**

- `src/hooks/__helpers/hook-registry.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `Object.keys(canonicalHookRegistry).length` increases by 3 (from 12 to 15)
- All three event names (`user_prompt_submit`, `subagent_stop`, `post_tool_use_failure`) are valid members of `CANONICAL_EVENTS`

---

## Wave 3 Verification

- `bunx --bun tsc --noEmit` — zero new type errors across all new and modified files
- Three new `.ts` hook implementations exist under `src/hooks/impl/`
- Three new `.sh` shims exist under `src/hooks/scripts/`
- `canonicalHookRegistry` has 15 entries (was 12)
- All three implementations follow the structural pattern of existing hooks (imports from `_lib/hook-io.ts`, try/catch on all external calls, always exit 0)

---

## Verification (Overall Phase)

1. **Type check:** `bunx --bun tsc --noEmit` — zero errors across the entire repo
2. **Schema integrity:** `SessionObservationSchema` exported from `src/hooks/__schemas/hook.schemas.ts`; all fields match Decision 2 in CONTEXT.md
3. **Observer coverage:** `context-check-throttled.ts` writes to MuninnDB on zone transition; prompt-layer systemMessage asks LLM to record `session:observation-work`
4. **Clear suggestion:** At ≥42% context usage on degrading zone transition, systemMessage contains "[Context Management]" and mentions `/clear`
5. **Enhanced restore:** `session-start.ts` queries MuninnDB for recent `session:observation-*` engrams; if found, builds and emits rich restore message
6. **Compact instructions:** CLAUDE.md has all six bullets under "## Compact Instructions"
7. **Config:** `.planning/config.json` has `context_management` section with `clear_suggestion_threshold: 42`
8. **New hooks:** `user-prompt-submit.ts`, `subagent-stop.ts`, `post-tool-use-failure.ts` all pass typecheck; shims exist; registry updated
9. **No regressions:** All existing hook behaviors preserved (dedup guards, throttle files, bridge calls, stale-session detection remain intact)
10. **No build:all:** Do NOT run `bun run build:all` — this crashes Claude Code. The generated `.claude/` directory is NOT updated in this phase.

## Success Criteria

- MuninnDB receives `session:observation-*` engrams on zone transitions (3-5 per typical session)
- At 42% context usage, user sees a clear, actionable `/clear` suggestion in the systemMessage
- After `/clear` + new session start, if MuninnDB has observations from the last 30 minutes, the restore message contains branch, phase context, and recent work summary
- `CLAUDE.md` compact instructions guide the LLM to preserve the 6 critical context items if auto-compaction occurs
- Three new hook events (`user_prompt_submit`, `subagent_stop`, `post_tool_use_failure`) are wired and feeding MuninnDB
- All of the above survives `bunx --bun tsc --noEmit` with zero errors

## Output Specification

**New files:**

- `src/hooks/impl/user-prompt-submit.ts`
- `src/hooks/impl/subagent-stop.ts`
- `src/hooks/impl/post-tool-use-failure.ts`
- `src/hooks/scripts/user-prompt-submit.sh`
- `src/hooks/scripts/subagent-stop.sh`
- `src/hooks/scripts/post-tool-use-failure.sh`

**Modified files:**

- `src/hooks/__schemas/hook.schemas.ts` — `SessionObservationSchema` + `SessionObservation` type
- `src/hooks/impl/context-check-throttled.ts` — observation logic + clear suggestion
- `src/hooks/impl/session-start.ts` — enhanced restore logic
- `src/hooks/__helpers/hook-registry.ts` — 3 new entries in `canonicalHookRegistry`
- `.planning/config.json` — `context_management` section
- `CLAUDE.md` — verify/augment compact instructions (may require no edit if already complete)
