---
title: "Agent collaboration UI: active agent sidebar, file ownership indicators, inter-agent note visualization"
area: ui
created: 2026-03-24
source: conversation
---

## Context

User envisions a richer IDE experience where multiple concurrent agents are visible and their work is transparent. This is the **visual/UI side** of the agent collaboration feature — the behavioral side is tracked separately in `agent-cross-talk-protocol.md`.

## Task

Design and build IDE panel UI for multi-agent awareness:

1. **Sidebar: Active Agents List**
   - Show all currently running agents with status (working, idle, waiting)
   - Click an agent to see what it's currently working on (file, task, progress)
   - Visual grouping by task/area of expertise

2. **File Ownership Indicators**
   - Visual indicator in the editor/file tree showing which agent is editing which file
   - Color-coded or icon-based per agent
   - Handle conflicts (multiple agents touching same file)

3. **Inter-Agent Note Visualization**
   - Special visual treatment when an agent leaves a note for another agent
   - Priority-based styling (urgent, normal, FYI)
   - Notification badge on target agent in sidebar
   - Expandable note preview without leaving current context

## Notes

- This is the UI counterpart to the behavioral protocol in `agent-cross-talk-protocol.md`
- Needs to work across supported IDE adapters (Claude Code, Cursor, Windsurf, VS Code)
- Consider whether this is a standalone panel or integrates into existing dev server views (runtime-d05 agent browser view may be relevant)
- The dev server already has agent browser view planned (runtime-d05) — this could extend it with real-time collaboration awareness
