---
title: "Observer: Add entrance animations & data update highlights"
area: ui
priority: 6
created: 2026-03-06
source: conversation
---

## Context

Only animations are animate-pulse on skeletons and transition-colors on hovers. No page transitions, card entrance animations, or data update animations. For a real-time dashboard, motion is essential for communicating liveness.

## Task

- Page transitions: fade+slide content when navigating between routes
- Card entrance: stagger cards on page load with subtle scale+fade (each card 50ms delayed)
- Data updates: when a value changes (event count increments, state transitions), briefly flash with highlight color
- Live feed: new events slide in from top with subtle animation
- Connection status: green dot pulses gently when connected
- Consider adding framer-motion or the lighter motion library
- Empty state transitions: fade in gracefully

## Notes

Priority 6 — polish and delight. Makes the dashboard feel alive and responsive to real-time data.
