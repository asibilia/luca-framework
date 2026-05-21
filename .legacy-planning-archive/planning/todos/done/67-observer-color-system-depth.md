---
title: "Observer: Redesign color system with surface depth levels"
area: ui
priority: 2
created: 2026-03-06
source: conversation
---

## Context

Current palette is standard Tailwind zinc + blue. Dark mode uses #0a0a0a background with #111 cards — almost no contrast between surfaces. Cards and backgrounds blend together.

## Task

- Create 3-4 distinct surface levels with visible depth: bg-0 (#08090a), bg-1 (#0f1114), bg-2 (#161921), bg-3 (#1e2230) — subtle blue tint for character
- Add subtle gradients to cards: linear-gradient(135deg, bg-2, bg-1) for depth
- Use accent glow selectively: extend the workflow diagram's glow concept to active cards, live indicators
- Introduce a signature warm accent (amber/gold) for "active/executing" states to contrast the cool palette
- Update light mode equivalents for all new surface levels

## Notes

Priority 2 — foundation for all other visual improvements. Must update tailwind/base.css design tokens.
