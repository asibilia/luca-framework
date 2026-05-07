---
title: "Add shared mode instruction prefix mechanism (mirror SUBAGENT_SHARED_PREFIX)"
area: architecture
created: 2026-05-07
priority: medium
source: research
---

## Task

Add shared mode instruction prefix mechanism (mirror SUBAGENT_SHARED_PREFIX)

## Context

Subagents have `SUBAGENT_SHARED_PREFIX` prepended in `launch.ts:222`. Mode agents have NO equivalent — cross-cutting blocks (Artifact paths note, caveman-active, hard constraints, luca-reminder obedience) are copy-pasted across all 10 mode instruction .md files. Architectural debt D2.

Adding new cross-mode directives (e.g., "consult projectPreferences before X" in Phase B/C) currently requires editing 10 files manually.

## Scope

- Define `MODE_SHARED_PREFIX` (or similar) string in `src/modes/shared-prefix.ts`
- Update each `buildXxxInstructions()` in `src/modes/<mode>.ts` to prepend it
- Remove duplicated blocks from individual `instructions/<mode>.md` files
- Verify no semantic drift from manual divergence in current copies

## MuninnDB Recall

Search MuninnDB for 'research:luca-no-shared-mode-instruction-prefix'.
