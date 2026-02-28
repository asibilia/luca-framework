---
title: Pi Integration — Deferred Layers (E2E Validation + Background Subagents)
area: framework
created: 2026-02-27
source: v2.1.0 milestone audit + pi-library-integration.md deferred scope
scope: two work streams — runtime validation and background subagent spawning
complexity: COMPLEX
---

## Context

v2.1.0 delivered 12 Pi extensions (39 tools, 3,347 lines) with full unit test coverage (2,106 tests). However, two significant gaps remain:

1. **No end-to-end validation against a live Pi runtime** — All tests validate compiler output format and extension code structure in isolation. The extensions have never been loaded and tested in an actual Pi session.
2. **Background subagent spawning** — Intentionally scoped out of v2.1.0 (see v2.1.0-MILESTONE-AUDIT.md). This is the fire-and-forget async pattern from Pi's subagent-widget reference implementation.

## Work Stream 1: E2E Pi Runtime Validation

### Problem

The v2.1.0 extensions register tools via `pi.registerTool()` and hooks via `pi.on()`, but we've never confirmed:

- Pi can actually load all 12 extensions without errors
- Tool registrations resolve correctly at runtime
- Event hooks fire in the expected order
- Extensions interact correctly with Pi's permission model
- The `__helpers/` shared module imports resolve in Pi's extension loader
- Tools return responses in the format Pi's LLM expects

### Deliverables

- Smoke test: `pi --extensions .pi/extensions/luca-state.ts` loads without crash
- Integration test: Each extension's tools are callable and return valid responses
- Event hook test: session_start, tool_call, tool_execution_end fire correctly
- Cross-extension test: Extensions that depend on shared state (e.g., complexity → harness) work together
- Fix any runtime issues discovered during validation
- Document any Pi API gaps or version requirements

### Extensions to Validate (12)

| Extension | Tools | Priority |
|-----------|-------|----------|
| luca-state.ts | luca_read_state, luca_set_field, luca_read_field | HIGH — foundation for all others |
| luca-memory.ts | luca_read_brain, luca_read_memory, luca_read_working, luca_append_working | HIGH — session startup |
| luca-harness.ts | luca_verify | HIGH — verification loop |
| luca-complexity.ts | luca_read_complexity, luca_set_complexity, luca_gate_check | HIGH — gates other features |
| luca-roles.ts | luca_activate_role, luca_deactivate_role, luca_active_role, luca_list_roles | MEDIUM |
| luca-teams.ts | luca_dispatch_team, luca_define_team, luca_list_teams | MEDIUM |
| luca-chain.ts | luca_define_chain, luca_chain_next, luca_chain_status | MEDIUM |
| luca-tilldone.ts | luca_tilldone, luca_loop_status, luca_loop_reset | MEDIUM |
| luca-query-experts.ts | luca_define_experts, luca_query_expert, luca_synthesize_research, luca_research_status | MEDIUM |
| luca-safety-rules.ts | luca_register_safety_rule, luca_safety_check, luca_list_safety_rules, luca_set_safety_mode, luca_safety_audit | MEDIUM |
| luca-purpose-gating.ts | luca_register_purpose, luca_check_purpose, luca_eligible_agents, luca_defer_task, luca_trigger_deferred, luca_deferred_status | LOW |
| luca-hooks.ts | (lifecycle hooks only, no tools) | LOW |

## Work Stream 2: Background Subagent Spawning

### Problem

Pi supports a powerful background subagent pattern (fire-and-forget async workers with live progress widgets). This was documented in the original Pi integration research but scoped out of v2.1.0.

### Reference Pattern (from pi-vs-claude-code/subagent-widget)

```
Primary Agent (full tools + subagent_create/continue/remove/list)
    │
    ├── Subagent #1 (background, tools: read, bash, grep, find, ls)
    │   └── Streams progress → widget dashboard
    │
    ├── Subagent #2 (background, concurrent)
    │   └── On completion → pi.sendMessage({ triggerTurn: true })
    │       → result delivered as follow-up to primary agent
    │
    └── Primary continues working while subagents run
```

### Key Design Decisions

- **Process isolation**: Each subagent is a separate OS process via `spawn("pi", [...])`
- **Fire-and-forget async**: Subagents run in background, results injected via `pi.sendMessage({ triggerTurn: true })`
- **Session persistence**: Each subagent gets a session file, `/subcont` continues existing conversation
- **Widget dashboard**: Live progress display using `ctx.ui.setWidget()`

### Deliverables

- New extension: `luca-subagents.ts` with tools: `subagent_create`, `subagent_continue`, `subagent_remove`, `subagent_list`
- Process spawning with `--mode json` for structured event streaming
- Result truncation (8K chars) to prevent context overflow
- Session file management (create on first dispatch, continue with `-c` flag, wipe on new parent session)
- Widget integration for live progress tracking
- Integration with existing luca-teams.ts (teams can dispatch via subagents)

## References

- v2.1.0 Milestone Audit: `.planning/milestones/v2.1.0-AUDIT.md`
- Original research: `.planning/todos/done/pi-library-integration.md` (Pattern 6: Background Subagents)
- Pi extensions docs: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- Reference implementation: https://github.com/disler/pi-vs-claude-code (subagent-widget extension)
