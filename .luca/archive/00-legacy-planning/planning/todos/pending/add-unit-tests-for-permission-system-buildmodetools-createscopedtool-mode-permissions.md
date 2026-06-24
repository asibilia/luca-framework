---
title: "Add unit tests for permission system (buildModeTools, createScopedTool, MODE_PERMISSIONS)"
area: testing
created: 2026-04-10
priority: high
source: research
---

## Task

Add unit tests for permission system (buildModeTools, createScopedTool, MODE_PERMISSIONS)

## Context

Zero test files exist in `packages/luca-mastracode/`. The permission system (`buildModeTools()`, `createScopedTool()`, `MODE_PERMISSIONS`) has no automated test coverage. A typo in a tool key silently throws at runtime (not caught at build time). Any permission change is currently unverified except by manual testing and typecheck.

Key test cases needed:
- `buildModeTools()` throws on unknown tool keys
- `createScopedTool()` correctly narrows action enums
- Each mode gets exactly the tools declared in MODE_PERMISSIONS
- Action scoping is enforced (disallowed actions not visible in schema)

## MuninnDB Recall

For full research context, search MuninnDB vault `luca-framework` for `research:tool-registration-pipeline` or `research:createScopedTool-zod-enum-narrowing`.
