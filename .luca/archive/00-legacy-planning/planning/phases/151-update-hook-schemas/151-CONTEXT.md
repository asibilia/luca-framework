# Phase 151 Context — Update Hook Schemas

## Gray Area 1: Canonical Event Naming for 13 New Events [researched]

**Decision:** Follow existing snake_case pattern from `CANONICAL_EVENTS`. Map Claude Code PascalCase names to snake_case:

| Claude Code Event  | Canonical Name        |
| ------------------ | --------------------- |
| PreCompact         | pre_compact           |
| UserPromptSubmit   | user_prompt_submit    |
| SubagentStop       | subagent_stop         |
| SubagentStart      | subagent_start        |
| Notification       | notification          |
| PostToolUseFailure | post_tool_use_failure |
| InstructionsLoaded | instructions_loaded   |
| PermissionRequest  | permission_request    |
| TeammateIdle       | teammate_idle         |
| TaskCompleted      | task_completed        |
| ConfigChange       | config_change         |
| WorktreeCreate     | worktree_create       |
| WorktreeRemove     | worktree_remove       |

**Rationale:** Consistent with existing `post_tool_use`, `pre_tool_use`, `session_start`, `session_end`, `stop` pattern.

## Gray Area 2: Platform Mapping for Unmapped Events [researched]

**Decision:** Add all 18 events to `CANONICAL_EVENTS` and `CLAUDE_EVENT_MAP`. For `CURSOR_EVENT_MAP` and `PI_EVENT_MAP`, map only events that have clear platform equivalents. Use a passthrough (same as canonical name) for events without a known platform mapping — the adapter will produce the canonical name, and platform config generators can skip events they don't support.

**Rationale:** The canonical schema should enumerate all possible events for type safety. Platform adapters handle the "does this event exist on this platform" question. Hooks are only registered for events Luca actually uses.

## Gray Area 3: Registry Impact [researched]

**Decision:** Only update the schema and event maps. Do NOT register new hooks in `canonicalHookRegistry` — that's the job of downstream phases (153, 154, 155). This phase purely expands the type system.

**Rationale:** Separation of concerns. Schema expansion is prerequisite work; hook registration is implementation work.

## Scope

- Update `CANONICAL_EVENTS` array (5 → 18 events)
- Update `CLAUDE_EVENT_MAP` (5 → 18 entries)
- Update `CURSOR_EVENT_MAP` and `PI_EVENT_MAP` (best-effort mapping for new events)
- Type-check passes with `bunx --bun tsc --noEmit`
- No new hooks registered
- No new shell scripts created
