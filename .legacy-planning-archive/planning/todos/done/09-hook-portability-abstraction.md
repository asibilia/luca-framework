---
title: "Hook Portability Abstraction Layer"
area: framework/hooks
created: 2026-03-01
source: expert-panel-research
tier: 2
complexity: COMPLEX
moat: Medium
---

## Context

Current hook definitions are platform-specific. Adding Pi hooks required duplicating Claude/Cursor hook logic with different event names and JSON formats. Phase 74 of v2.3.0 roadmap.

## Task

Refactor HookDefinitionSchema to canonical form with `platform_overrides` record. Introduce HookPlatformAdapter functional contract. Register adapters in hookAdapterRegistry. Canonical hooks use platform-agnostic event names (post-edit, pre-commit, session-end) that each adapter maps to platform-specific names.

**Implementation:**

- Refactor `src/hooks/__schemas/hook.schemas.ts` to canonical form
- Extract `src/hooks/__helpers/config-generators.ts` into adapter files
- New directory: `src/hooks/adapters/` — claude.adapter.ts, cursor.adapter.ts, pi.adapter.ts
- Update `src/hooks/__helpers/hook-registry.ts` to canonical form
- Re-export adapter registry from `src/hooks/index.ts`

## Notes

- Solves Phase 74 properly — adding new platforms = one adapter file
- Source agent: Architecture Expert
