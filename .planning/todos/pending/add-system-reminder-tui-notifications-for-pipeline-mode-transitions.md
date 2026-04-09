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

**Single file change:** `packages/luca-mastracode/src/index.ts`

1. In the `mode_changed` subscriber (around line 740-745), wrap the kickoff message in `<system-reminder>` tags before passing to `harness.sendMessage()`.
2. Include a pipeline progress indicator in the notification body:
   - Current mode name and step number (e.g., "ARCHITECT MODE · Step 3 of 6")
   - Visual progress line: `✓ Triage  ✓ Research  → Architect  ○ Execute  ○ Review  ○ Finalize`
   - Intent summary from workflow state
3. The existing continuation message content (instructions for the agent) should still be included inside the system-reminder body so the agent receives it.

## Key Finding

MastraTUI's `addUserMessage()` path (chunk-326DREMX.js:10183) matches `<system-reminder>` XML via regex and renders it as a `SystemReminderComponent` with amber border. `harness.sendMessage()` goes through this user message path. No new APIs or dependencies needed.

## Constraints

- Do NOT add any `ask_user` prompts — the pipeline must remain fully autonomous
- Do NOT introduce new TUI libraries — this uses existing MastraTUI rendering
- The notification is purely visual/informational, not interactive
