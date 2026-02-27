---
id: 69-A
title: "Implement luca-subagents.ts extension"
phase: 69
wave: 1
depends_on: ["68-A"]
---

# Plan 69-A: Implement luca-subagents.ts Extension

## Objective

Create a new Pi extension for background subagent spawning with process isolation, result collection, and integration with the luca-teams dispatch system.

## Design

Based on Pi's reference subagent implementation, adapted for luca conventions:
- No Pi-specific types (ExtensionAPI, Theme, TUI components)
- Uses luca __helpers (response, registry, sanitize)
- Simpler scope: create, list, remove, get-result (no custom rendering)
- Spawns `pi --mode json -p --no-session` subprocesses
- Fire-and-forget: results collected and available via luca_subagent_result

## Tasks

### Task 1: Create src/hooks/pi-extensions/luca-subagents.ts
- 4 tools: luca_subagent_create, luca_subagent_list, luca_subagent_remove, luca_subagent_result
- Process spawning with JSON mode capture
- Result registry with status tracking
- Output truncation (8K chars)
- Abort support via signal propagation

### Task 2: Register in build pipeline
- Add to PI_EXTENSION_FILES in build-shared.ts
- Add to settings.json extensions list

### Task 3: Unit tests
- Tool registration validation
- Response shape validation
- Registry lifecycle tests

## Verification
- TypeScript clean
- All tests pass
- Build succeeds, drift check clean
