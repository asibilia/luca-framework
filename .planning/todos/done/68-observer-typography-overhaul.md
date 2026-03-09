---
title: "Observer: Typography overhaul with distinctive fonts & hierarchy"
area: ui
priority: 3
created: 2026-03-06
source: conversation
---

## Context

Inter + JetBrains Mono is the most common AI-generated font pairing. Every component uses `font-mono text-xs` — the entire app looks like a terminal dump. No typographic hierarchy, no breathing room, no personality.

## Task

- Replace Inter with a distinctive sans-serif: Instrument Sans, Satoshi, General Sans, or Manrope
- Replace JetBrains Mono with a distinctive mono: Berkeley Mono, Commit Mono, or Geist Mono (use for data values ONLY, not labels)
- Create a real type scale: page titles (24px semibold), section headers (14px medium, letterspaced), card labels (11px uppercase tracking-wide), data values (18-20px tabular-nums)
- Remove `font-mono` from navigation, labels, and UI chrome — reserve for data values and code
- Update tailwind/base.css @theme font definitions

## Notes

Priority 3 — professional feel. Paired with color system for full design system foundation.
