---
title: Package Luca as a Claude Code plugin
area: distribution
created: 2026-02-10
source: research (Claude Code ecosystem)
---

## Context

Luca currently targets Cursor IDE with `.cursor/` artifacts. Claude Code has introduced a plugin system that bundles skills, hooks, subagents, and MCP servers into distributable, namespaced units installable via `/plugin`. The framework is already built around skills and agents — packaging as a Claude Code plugin is a natural fit and would dramatically expand the addressable market.

The existing `packages/luca-framework` and `packages/create-luca` already handle distribution for Cursor. A Claude Code plugin would be a parallel distribution channel using the same core skill/agent definitions.

## Task

1. **Audit Claude Code plugin spec** — Understand the plugin manifest format, namespacing, lifecycle hooks, and distribution mechanism
2. **Map Luca artifacts to plugin structure** — Skills → plugin skills, agents → plugin subagents, rules → CLAUDE.md, hooks → plugin hooks
3. **Design dual-target compilation** — The existing compiler system (cursor.compiler.ts, claude.compiler.ts) already supports multiple targets; add a plugin target
4. **Implement plugin manifest** — Create the plugin configuration that bundles all Luca capabilities
5. **Handle the `.planning/` runtime** — Plugin needs to initialize and manage the planning directory, BRAIN/MEMORY/WORKING files
6. **Test cross-platform** — Ensure the same workflow works in both Cursor and Claude Code

## Notes

- The compiler system already compiles to Cursor and Claude formats — adding a plugin target is architecturally natural
- Claude Code plugins are namespaced (e.g., `luca:lu-execute-phase`) to avoid conflicts
- Plugins support hooks — this pairs with the hooks todo for deterministic quality gates
- The Claude Code model supports `sonnet`, `opus`, `haiku` model selection per task — more granular than Cursor's current "fast" or "inherit"
- This could make Luca the first comprehensive workflow plugin in the Claude Code ecosystem
- Distribution: npm registry + plugin marketplace
