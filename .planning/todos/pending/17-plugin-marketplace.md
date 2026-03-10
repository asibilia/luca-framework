---
title: "Plugin Marketplace with Community Registry"
area: framework/ecosystem
created: 2026-03-01
source: expert-panel-research
tier: 4
complexity: CRITICAL
moat: Strong
priority: P3
milestone: v5.0.0
---

## Context

No competitor has a plugin ecosystem beyond MCP servers. Network effects: each published agent makes Luca more valuable for everyone. Highest long-term upside, highest effort.

## Task

Community-shared agents/skills/rules. `luca publish` packages selected entities with metadata into distributable format. GitHub-based index (JSON file listing published packages) -> graduated npm-like service. Discovery leverages existing tag/keyword systems.

**Implementation:**

- New: `packages/luca-framework/src/commands/publish.ts`
- Extend manifest for registry in `src/compilers/__schemas/compilers.schemas.ts`
- Community install step in `packages/luca-framework/src/commands/init.ts`
- New: registry infrastructure (separate package or hosted service)
- Add published metadata to `src/agents/__schemas/agent.schemas.ts`

## Notes

- Early mover advantage critical — once users invest in publishing Luca-format agents, switching costs increase
- Source agent: Competitive Edge Expert
