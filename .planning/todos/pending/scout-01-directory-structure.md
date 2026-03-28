---
title: "Scout: Create docs/scouting/ directory structure and templates"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, foundation, phase-1]
---

## Context

Building a technology scouting pipeline (`/scout`) that ingests external articles about agentic development, researches them, assesses framework impact, and produces actionable todos. This is the foundational directory structure.

## Task

Create the canonical directory structure for the scouting workflow:

```
docs/scouting/
├── inbox.md                    # Link drop zone (pending URLs)
├── digests/                    # Completed per-article research (Stages 1-5)
├── integration/                # Cross-cutting integration analyses (Stage 6)
├── deferred/                   # Valid but too costly to integrate now
├── manual-review/              # Low-relevance OR todo conflicts — needs human
├── .scout-state/               # Per-article state machine JSON files
└── INDEX.md                    # Auto-maintained catalog with status tracking
```

## Notes

- `inbox.md` format: `- https://url <!-- pending -->` or `- https://url <!-- processed:YYYY-MM-DD -->`
- `.scout-state/` is hidden (dot-prefix) since it's machine state, not human-readable docs
- INDEX.md will be auto-maintained by the deterministic index update step (Step 9)
- All directory names follow kebab-case convention
