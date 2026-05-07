---
title: "Register projectPreferences for `plan` mode in tool-manifest.ts"
area: permissions
created: 2026-05-07
priority: medium
source: research
---

## Task

Register projectPreferences for `plan` mode in tool-manifest.ts

## Context

`tool-manifest.ts:237-254` registers `project_preferences` for every pipeline mode + build/fast/discuss but NOT for `plan`. `plan` is a registered stock mode (`mode-ids.ts:66`). When `pr-title-format.md` is rewritten in Phase C to call `projectPreferences.consult-section`, the rule (alwaysApply:true) will fire in `plan` mode and hit a tool-not-available runtime error every turn.

## MuninnDB Recall

Search MuninnDB for `research:plan-mode-missing-projectpreferences-tool-manifest`.

## Action

One-line addition to tool-manifest.ts: `[MODES.plan]: ['consult', 'consult-section']` (or `'plan': ['consult', 'consult-section']` since plan uses bare key). Phase C may bundle this fix.
