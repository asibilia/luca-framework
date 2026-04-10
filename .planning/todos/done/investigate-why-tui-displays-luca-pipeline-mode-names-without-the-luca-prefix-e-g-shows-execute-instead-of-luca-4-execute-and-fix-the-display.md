---
title: 'Investigate why TUI displays Luca pipeline mode names without the "luca:" prefix (e.g. shows "execute" instead of "luca:4-execute") and fix the display'
area: ui
created: 2026-04-10
priority: medium
source: triage
---

## Task

Investigate why TUI displays Luca pipeline mode names without the "luca:" prefix (e.g. shows "execute" instead of "luca:4-execute") and fix the display

## Problem

The MastraTUI mode picker/header displays Luca pipeline mode names without their `luca:` namespace prefix. For example, it shows "execute" or "discuss" instead of "luca:4-execute" or "luca:discuss". This was noticed after renaming custom modes to use the `luca:` prefix convention.

## Context

- Mode IDs were refactored to use `luca:` prefix (e.g. `luca:1-triage`, `luca:2-research`, `luca:3-architect`, `luca:4-execute`, `luca:5-review`, `luca:6-finalize`, `luca:discuss`)
- The mode configs in luca-mastracode define these IDs correctly
- MastraTUI appears to strip the prefix or use a different display name field
- Need to investigate whether this is a MastraTUI rendering behavior (using `.name` instead of `.id`), a mode config issue (`.name` field not matching), or intentional TUI behavior that strips prefixes

## Investigation Areas

1. Check mode config `.name` vs `.id` fields in mode definition files (triage.ts, research.ts, architect.ts, execute.ts, review.ts, finalize.ts, discuss.ts)
2. Check how MastraTUI renders mode names in the header/picker (does it use `mode.name` or `mode.id`?)
3. Check if MastraTUI has any prefix-stripping logic for mode display names
4. Determine the correct fix: update `.name` fields in mode configs, or address TUI rendering
