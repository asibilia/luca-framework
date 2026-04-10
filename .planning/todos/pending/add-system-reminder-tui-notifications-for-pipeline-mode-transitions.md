---
title: "Add system-reminder TUI notifications for pipeline mode transitions"
area: ui
created: 2026-04-09
priority: medium
source: triage
---

## Task

Add system-reminder TUI notifications for pipeline mode transitions

## Context

When the Luca pipeline transitions between modes (Triage → Research → Architect → Execute → Review → Finalize), the mode switch happens silently — the header color changes and the kickoff text appears as a plain user message. There's no visual "system notification" marking the transition.

## Goal

Wrap the `buildContinuationMessage()` output in `<system-reminder>` XML tags so that MastraTUI renders each mode transition as an amber-bordered `SystemReminderComponent` box — the same styled notification used for AGENTS.md loading and error recovery notices.

## Implementation

**Files changed:**
- `packages/luca-mastracode/src/index.ts` — TUI helpers, mode_changed subscriber update
- `packages/luca-mastracode/src/tools/workflow-state.ts` — Cross-reference comment
- `.gitignore` — Runtime artifact entries
- `.planning/ROADMAP.md` — Restored to full historical version

1. In the `mode_changed` subscriber (line ~790), wrap the kickoff message in `<system-reminder>` tags before passing to `harness.sendMessage()`.
2. Add pipeline progress indicator helpers:
   - `buildPipelineProgressHeader(modeId)` — returns two-line header with mode name, step number, and visual progress
   - `escapeSystemReminderBody(body)` — sanitizes closing-tag injection attempts
   - `wrapInSystemReminder(body)` — wraps content in XML tags for MastraTUI rendering
3. The continuation message content (instructions) is included inside the system-reminder body so the agent receives it in the amber-bordered box.

## Key Finding

MastraTUI's `addUserMessage()` path (chunk-326DREMX.js:10183) matches `<system-reminder>` XML via regex and renders it as a `SystemReminderComponent` with amber border. `harness.sendMessage()` goes through this user message path. No new APIs or dependencies needed.

## Constraints

- Do NOT add any `ask_user` prompts — the pipeline must remain fully autonomous
- Do NOT introduce new TUI libraries — this uses existing MastraTUI rendering
- The notification is purely visual/informational, not interactive
