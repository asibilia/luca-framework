---
title: "Revisit permissions: triage step cannot access todos programmatically — manageTodos not allowed but triage should have read-only access to todos"
area: admin
created: 2026-04-10
priority: high
source: triage
---

## Task

Revisit permissions: triage step cannot access todos programmatically — manageTodos not allowed but triage should have read-only access to todos

## Problem

The triage step currently cannot get todos programmatically because `manageTodos` is not in its allowed toolset. This means triage can't check existing backlog items for context when classifying new work.

## Expected Behavior

Triage should have **read-only** access to the todo system — specifically the `list` and `read` actions — so it can see what's already in the backlog without being able to add, move, or remove items.

## Investigation Areas

1. Check the triage mode's tool permissions / allowed tools list
2. Determine if `manageTodos` can be scoped to read-only actions at the permission level, or if a separate read-only tool is needed
3. Consider whether other pipeline steps also need adjusted todo access levels
