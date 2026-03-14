# Phase 151: Update Hook Schemas - Research

**Researched:** 2026-03-13
**Domain:** Hook type system expansion — Zod enum + platform event maps
**Confidence:** HIGH

## Summary

The hook schema system uses a single `CANONICAL_EVENTS` `as const` array in `src/hooks/__schemas/hook.schemas.ts` as the sole source of truth for the `CanonicalEvent` union type. All three platform event maps (`CLAUDE_EVENT_MAP`, `CURSOR_EVENT_MAP`, `PI_EVENT_MAP`) are typed as `Record<CanonicalEvent, string>`, which means TypeScript will produce a compile error if any map is missing a key after the enum is expanded. This provides automatic completeness enforcement at the type level.

There are **two parallel sets** of event maps: a legacy set inside `src/hooks/__helpers/platform-adapters.ts` (module-private `const` declarations) and a canonical set inside `src/hooks/adapters/claude.adapter.ts`, `cursor.adapter.ts`, and `pi.adapter.ts` (exported `const` declarations). Both sets must be updated. The adapter files are the ones consumed by the adapter registry and config generators going forward; the `__helpers/platform-adapters.ts` maps are private to that module but still exist and must compile.

The `canonicalHookRegistry` in `src/hooks/__helpers/hook-registry.ts` must NOT be modified — it registers concrete hooks, not event types.

**Primary recommendation:** Add 13 events to `CANONICAL_EVENTS` in hook.schemas.ts, then add matching entries to all six maps (three in `__helpers/platform-adapters.ts`, three in `adapters/*.adapter.ts`). TypeScript will refuse to compile if any map is incomplete.

## Standard Stack

No new libraries required. This phase is pure TypeScript type system work — editing existing `as const` arrays and `Record<CanonicalEvent, string>` objects.

## Architecture Patterns

### How CANONICAL_EVENTS Drives the Type System

```
CANONICAL_EVENTS (as const array)
  └── canonicalEventSchema = z.enum(CANONICAL_EVENTS)
        └── CanonicalEvent = z.infer<typeof canonicalEventSchema>
              ├── CanonicalHookSchema.event: canonicalEventSchema
              ├── Record<CanonicalEvent, string>  ← all 6 maps
              └── HookPlatformAdapter.event_map: Record<CanonicalEvent, string>
```

Expanding `CANONICAL_EVENTS` automatically widens `CanonicalEvent`. All `Record<CanonicalEvent, string>` objects then become incomplete and TypeScript reports errors until every map is updated. This is the completeness guarantee.

### Files That Must Change

| File                                       | What Changes                         | Why                                         |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------- |
| `src/hooks/__schemas/hook.schemas.ts`      | Add 13 entries to `CANONICAL_EVENTS` | Expands the enum                            |
| `src/hooks/adapters/claude.adapter.ts`     | Add 13 entries to `CLAUDE_EVENT_MAP` | `Record<CanonicalEvent, string>` — required |
| `src/hooks/adapters/cursor.adapter.ts`     | Add 13 entries to `CURSOR_EVENT_MAP` | `Record<CanonicalEvent, string>` — required |
| `src/hooks/adapters/pi.adapter.ts`         | Add 13 entries to `PI_EVENT_MAP`     | `Record<CanonicalEvent, string>` — required |
| `src/hooks/__helpers/platform-adapters.ts` | Add 13 entries to all 3 private maps | `Record<CanonicalEvent, string>` — required |

### Files That Do NOT Change

| File                                       | Reason                                         |
| ------------------------------------------ | ---------------------------------------------- |
| `src/hooks/__helpers/hook-registry.ts`     | Registers concrete hooks, not event types      |
| `src/hooks/adapters/adapter.schemas.ts`    | Structural interface, not event data           |
| `src/hooks/index.ts`                       | Pure barrel, no event data                     |
| `src/hooks/__helpers/config-generators.ts` | Uses `CanonicalHook` dynamically, no event map |

## Platform Event Mappings for New Events

All 13 new events come directly from Claude Code. Cursor and Pi have no documented equivalents for these events, so the instruction is to use the canonical name as a passthrough value.

### Claude Code Event Map (PascalCase)

These are the authoritative Claude Code event names from the phase brief:

| Canonical Name          | Claude Code (PascalCase) |
| ----------------------- | ------------------------ |
| `pre_compact`           | `PreCompact`             |
| `user_prompt_submit`    | `UserPromptSubmit`       |
| `subagent_stop`         | `SubagentStop`           |
| `subagent_start`        | `SubagentStart`          |
| `notification`          | `Notification`           |
| `post_tool_use_failure` | `PostToolUseFailure`     |
| `instructions_loaded`   | `InstructionsLoaded`     |
| `permission_request`    | `PermissionRequest`      |
| `teammate_idle`         | `TeammateIdle`           |
| `task_completed`        | `TaskCompleted`          |
| `config_change`         | `ConfigChange`           |
| `worktree_create`       | `WorktreeCreate`         |
| `worktree_remove`       | `WorktreeRemove`         |

### Cursor Event Map (camelCase passthrough)

Cursor has no documented equivalents for these 13 events. Use the canonical name as-is (passthrough):

| Canonical Name          | Cursor Value            |
| ----------------------- | ----------------------- |
| `pre_compact`           | `pre_compact`           |
| `user_prompt_submit`    | `user_prompt_submit`    |
| `subagent_stop`         | `subagent_stop`         |
| `subagent_start`        | `subagent_start`        |
| `notification`          | `notification`          |
| `post_tool_use_failure` | `post_tool_use_failure` |
| `instructions_loaded`   | `instructions_loaded`   |
| `permission_request`    | `permission_request`    |
| `teammate_idle`         | `teammate_idle`         |
| `task_completed`        | `task_completed`        |
| `config_change`         | `config_change`         |
| `worktree_create`       | `worktree_create`       |
| `worktree_remove`       | `worktree_remove`       |

### Pi Event Map (snake_case passthrough)

Pi has no documented equivalents. Same passthrough pattern:

| Canonical Name          | Pi Value                |
| ----------------------- | ----------------------- |
| `pre_compact`           | `pre_compact`           |
| `user_prompt_submit`    | `user_prompt_submit`    |
| `subagent_stop`         | `subagent_stop`         |
| `subagent_start`        | `subagent_start`        |
| `notification`          | `notification`          |
| `post_tool_use_failure` | `post_tool_use_failure` |
| `instructions_loaded`   | `instructions_loaded`   |
| `permission_request`    | `permission_request`    |
| `teammate_idle`         | `teammate_idle`         |
| `task_completed`        | `task_completed`        |
| `config_change`         | `config_change`         |
| `worktree_create`       | `worktree_create`       |
| `worktree_remove`       | `worktree_remove`       |

## Don't Hand-Roll

| Problem            | Don't Build             | Use Instead                                      | Why                                                           |
| ------------------ | ----------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Completeness check | Runtime validation loop | `Record<CanonicalEvent, string>` typing          | TypeScript enforces this at compile time automatically        |
| New Zod schema     | New z.literal union     | Extend `CANONICAL_EVENTS` array, re-run `z.enum` | Already the pattern; adding to the array is all that's needed |

## Common Pitfalls

### Pitfall 1: Updating Adapter Files But Not the Legacy Maps

**What goes wrong:** `src/hooks/__helpers/platform-adapters.ts` contains three private `Record<CanonicalEvent, string>` maps (`CLAUDE_EVENT_MAP`, `CURSOR_EVENT_MAP`, `PI_EVENT_MAP`) that are distinct from the exported maps in `src/hooks/adapters/*.adapter.ts`. Updating only one set leaves the other set with compile errors.

**How to avoid:** Both files have maps typed as `Record<CanonicalEvent, string>`. TypeScript will catch any incomplete map. Update both sets in the same edit pass.

**Warning signs:** Type error saying `Property 'X' is missing in type ... but required in type 'Record<CanonicalEvent, string>'`.

### Pitfall 2: Adding Events to the Array Without Updating All Maps

**What goes wrong:** Adding events to `CANONICAL_EVENTS` immediately makes all six maps incomplete. If editing is interrupted after the schema file, the intermediate state will not typecheck.

**How to avoid:** Plan to edit all five files in a single wave. The schema file change is always first (it defines the type); the five map files follow.

### Pitfall 3: Confusing the Two CLAUDE_EVENT_MAP Locations

**What goes wrong:** There are two variables both named `CLAUDE_EVENT_MAP` — one private in `__helpers/platform-adapters.ts` and one exported from `adapters/claude.adapter.ts`. They are independent and both must be updated.

**How to avoid:** Note file paths explicitly. The `__helpers/` version is module-private; the `adapters/` version is exported and consumed by `claudeAdapter.event_map`.

## Code Examples

### Extending CANONICAL_EVENTS

```typescript
// Source: src/hooks/__schemas/hook.schemas.ts
export const CANONICAL_EVENTS = [
  "post_tool_use",
  "pre_tool_use",
  "stop",
  "session_end",
  "session_start",
  // NEW — Claude Code lifecycle events
  "pre_compact",
  "user_prompt_submit",
  "subagent_stop",
  "subagent_start",
  "notification",
  "post_tool_use_failure",
  "instructions_loaded",
  "permission_request",
  "teammate_idle",
  "task_completed",
  "config_change",
  "worktree_create",
  "worktree_remove",
] as const;
```

### Extending CLAUDE_EVENT_MAP (adapter file pattern)

```typescript
// Source: src/hooks/adapters/claude.adapter.ts
export const CLAUDE_EVENT_MAP: Record<CanonicalEvent, string> = {
  // existing 5 entries ...
  pre_compact: "PreCompact",
  user_prompt_submit: "UserPromptSubmit",
  subagent_stop: "SubagentStop",
  subagent_start: "SubagentStart",
  notification: "Notification",
  post_tool_use_failure: "PostToolUseFailure",
  instructions_loaded: "InstructionsLoaded",
  permission_request: "PermissionRequest",
  teammate_idle: "TeammateIdle",
  task_completed: "TaskCompleted",
  config_change: "ConfigChange",
  worktree_create: "WorktreeCreate",
  worktree_remove: "WorktreeRemove",
};
```

### Verification Command

```bash
bunx --bun tsc --noEmit
```

A clean typecheck with zero errors confirms all six maps are complete and the schema change is self-consistent.

## Open Questions

None. The task is fully specified and all source files are understood.

## Sources

### Primary (HIGH confidence)

- Direct file read: `src/hooks/__schemas/hook.schemas.ts` — current 5-event `CANONICAL_EVENTS` array and schema structure
- Direct file read: `src/hooks/adapters/claude.adapter.ts` — exported `CLAUDE_EVENT_MAP`, `adaptForClaude`, `claudeAdapter`
- Direct file read: `src/hooks/adapters/cursor.adapter.ts` — exported `CURSOR_EVENT_MAP`, `adaptForCursor`, `cursorAdapter`
- Direct file read: `src/hooks/adapters/pi.adapter.ts` — exported `PI_EVENT_MAP`, `adaptForPi`, `piAdapter`
- Direct file read: `src/hooks/__helpers/platform-adapters.ts` — private `CLAUDE_EVENT_MAP`, `CURSOR_EVENT_MAP`, `PI_EVENT_MAP`
- Direct file read: `src/hooks/__helpers/hook-registry.ts` — `canonicalHookRegistry` (confirmed: must not change)
- Direct file read: `src/hooks/adapters/adapter.schemas.ts` — `HookPlatformAdapter.event_map: Record<CanonicalEvent, string>`
- Phase brief (151-CONTEXT.md) — authoritative list of 13 new events and their Claude Code names

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependencies
- Architecture: HIGH — read directly from source files
- Pitfalls: HIGH — identified from direct inspection of duplicated map pattern
- Platform mappings: HIGH for Claude Code (from phase brief), HIGH for Cursor/Pi passthrough (explicitly specified in phase brief)

**Research date:** 2026-03-13
**Valid until:** Stable — pure type system, changes only when new events are added
