# Requirements — v2.2.0 Pi Platform Maturity

## Overview

Complete Pi extension quality hardening, validate all 12 extensions against a live Pi runtime, and add background subagent spawning as a new capability.

## Source

- v2.1.0 Milestone Audit: `.planning/milestones/v2.1.0-AUDIT.md` (DRY/simplification findings)
- Deferred todo: `.planning/todos/pending/pi-integration-deferred-layers.md`
- Phase 67 partial completion (67-A done, 67-B/C/D remain)

## Requirements

### R1: DRY Cleanup — Shared Helper Adoption

**Priority:** HIGH | **Source:** v2.1.0 audit (3 CRITICAL duplication patterns)

- R1.1: All 11 Pi extensions use `createTextResponse()` / `createJsonResponse()` from shared helpers (replaces 38+ inline wrappers)
- R1.2: YAML frontmatter parsing uses shared `parseFrontmatter()` helper (3 extensions)
- R1.3: Command execution uses shared `runShellCommand()` helper (2 extensions)
- R1.4: Map-based registries use shared `createRegistry()` factory (6 extensions)

### R2: Build Config Unification

**Priority:** HIGH | **Source:** v2.1.0 audit (MEDIUM architecture finding)

- R2.1: Single source of truth for Pi extension file list (eliminates drift between `generatePiSettings()` and `generatePiOutputs()`)
- R2.2: `__helpers/` directory copied to `.pi/extensions/__helpers/` during build
- R2.3: Deployed extensions can resolve `__helpers/` imports at runtime

### R3: Documentation

**Priority:** MEDIUM | **Source:** v2.1.0 audit (16 LOW/MEDIUM documentation gaps)

- R3.1: All Pi extension default export functions have JSDoc with `@param`, `@returns`
- R3.2: All undocumented helper functions have JSDoc

### R4: E2E Pi Runtime Validation

**Priority:** HIGH | **Source:** Deferred todo, Work Stream 1

- R4.1: All 12 Pi extensions load without errors in a live Pi session
- R4.2: All 39 registered tools are callable and return valid responses
- R4.3: Event hooks (session_start, tool_call, tool_execution_end) fire correctly
- R4.4: Cross-extension state sharing works (complexity → harness, roles → teams)
- R4.5: `__helpers/` shared module imports resolve in Pi's extension loader
- R4.6: Runtime issues discovered are fixed and tested

### R5: Background Subagent Spawning

**Priority:** MEDIUM | **Source:** Deferred todo, Work Stream 2

- R5.1: New extension `luca-subagents.ts` with tools: `subagent_create`, `subagent_continue`, `subagent_remove`, `subagent_list`
- R5.2: Process isolation via `spawn("pi", [...])` with `--mode json`
- R5.3: Fire-and-forget async with `pi.sendMessage({ triggerTurn: true })` result delivery
- R5.4: Session file management (create, continue with `-c`, wipe on new parent session)
- R5.5: Widget dashboard for live progress tracking via `ctx.ui.setWidget()`
- R5.6: Result truncation (8K chars) to prevent context overflow
- R5.7: Integration with existing `luca-teams.ts` for team dispatch via subagents

## Acceptance Criteria

1. All 2106+ existing tests continue to pass
2. `bun run build:all` succeeds with no drift
3. `bunx --bun tsc --noEmit` passes
4. All 12 Pi extensions load in a live Pi session
5. New subagent extension has unit tests covering all 4 tools
6. Zero CRITICAL duplication patterns remaining in Pi extensions

---

_Created: 2026-02-27_
