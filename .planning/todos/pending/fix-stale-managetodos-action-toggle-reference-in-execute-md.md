---
title: 'Fix stale manageTodos(action: "toggle") reference in execute.md'
area: instructions
created: 2026-04-10
priority: medium
source: research
---

## Task

Fix stale manageTodos(action: "toggle") reference in execute.md

## Context

`execute.md:435` references `manageTodos(action: "toggle")` which does not exist in the tool schema. The `manage_todos` tool supports actions: `["list", "add", "move", "read", "remove", "assign-batch"]`. The correct action should be `move` with `targetStatus: "done"`.

## MuninnDB Recall

For full research context, search MuninnDB vault `luca-framework` for `research:mode-permission-matrix-audit` or recall tag `research`.
