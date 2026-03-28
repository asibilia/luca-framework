---
title: "Scout: Create lu-scout-ingest agent"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, agents, phase-2]
---

## Context

Step 1 of the per-article pipeline. Fetches an article URL, extracts the meaningful content, and produces a structured digest document.

## Task

Create `src/agents/general/lu-scout-ingest.agent.ts`:

1. **Tools**: WebFetch, Read, Write, Bash
2. **Cognition tier**: T0 (no memory needed for ingestion)
3. **Input**: Article URL
4. **Process**:
   - WebFetch the URL to get article content
   - Extract: title, author, publication date, main content
   - Handle common formats: blog posts, documentation pages, announcements
   - Produce a structured digest following the digest template
5. **Output**: Writes `docs/scouting/digests/{date}-{slug}.md` with populated Summary, Key Concepts, and Techniques & Patterns sections
6. **Import shared sections**: `RESEARCHER_PHILOSOPHY` and `RESEARCHER_VERIFICATION_PROTOCOL` from `researcher-shared-sections.ts`

## Notes

- The agent should handle various content types gracefully (HTML blog posts, markdown pages, etc.)
- If WebFetch fails (paywall, 404, etc.), write a stub digest with status `fetch-failed` and let the orchestrator route to manual-review
- Slug is derived from article title: lowercase, kebab-case, truncated to ~50 chars
- Related Work and Technique Deep-Dive sections are left empty — filled by Stage 3
