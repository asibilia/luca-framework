---
title: "Global Claude Code Installation & Plugin Marketplace"
area: framework/ecosystem
created: 2026-03-01
updated: 2026-03-10
source: expert-panel-research
tier: 4
complexity: CRITICAL
moat: Strong
priority: P1
milestone: v5.0.0
---

## Context

No competitor has a plugin ecosystem beyond MCP servers. Network effects: each published agent makes Luca more valuable for everyone. Highest long-term upside, highest effort.

**New short-term objective (2026-03-10):** Before pursuing community marketplace, package Luca for global installation into user-level Claude Code config. This enables using all Luca skills/agents/hooks in any repository on the machine — a prerequisite for real-world adoption and the marketplace story.

## Short-Term: Global Claude Code Installation

Package the framework so it installs into `~/.claude/` (user-level) and works in any repo.

**What needs to happen:**

1. **Global binary (`luca-bridge`)** — Install via `bun link` or `bun add -g` so bridge CLI is on PATH. Hooks already cascade: installed binary → monorepo source → skip.

2. **Global Claude Code artifacts** — Deploy to `~/.claude/`:
   - `~/.claude/agents/` (38 agents)
   - `~/.claude/skills/` (53 skills)
   - `~/.claude/hooks/` (9 scripts + `_lib/`)
   - `~/.claude/rules/` (universal subset — ~10 of 21, excluding framework-specific rules like module-boundary, domain-architecture, dogfood hooks)

3. **Global `~/.claude/settings.json`** — Register hooks (session-start, pre-commit-gate, context-monitor, etc.) at user level. Must handle merge with project-level settings (avoid double-firing).

4. **Generic `.planning/config.json` template** — Session-start hook creates `.planning/` on first run, but current default config is tuned for this repo. Need a minimal generic template for arbitrary projects (auto-detect stack, sensible harness defaults).

5. **MuninnDB vault selection** — Env var `LUCA_MUNINN_VAULT` (or per-project `.env`) so different repos use different vaults. Currently hardcoded to `"default"` in global CLAUDE.md.

6. **CLAUDE.md split** — Separate universal instructions (bun preference, memory, conventions) from framework-specific instructions (dogfood, module boundaries, build pipeline).

**Key challenges:**

- Hook double-firing when project also has `.claude/settings.json`
- Dogfood hooks (`pre-commit-drift-check.sh`, `check:drift`) only apply to luca-framework repo
- Skills referencing monorepo paths (`src/complexity/__helpers/model-routing.ts`)
- Config harness checks differ per project (not all use TypeScript, bun test, etc.)
- Symlinks vs copies tradeoff (auto-update vs stability)

**Already portable (no changes needed):**

- Hook scripts use `$CLAUDE_PROJECT_DIR` (project-agnostic)
- `run_bridge()` cascading lookup (binary → monorepo → skip)
- MuninnDB is vault-based (supports multi-vault)
- Claude Code natively merges user + project settings
- `luca-bridge` binary already declared in package.json

## Long-Term: Plugin Marketplace with Community Registry

Community-shared agents/skills/rules. `luca publish` packages selected entities with metadata into distributable format. GitHub-based index (JSON file listing published packages) → graduated npm-like service. Discovery leverages existing tag/keyword systems.

**Implementation:**

- New: `packages/luca-framework/src/commands/publish.ts`
- Extend manifest for registry in `src/compilers/__schemas/compilers.schemas.ts`
- Community install step in `packages/luca-framework/src/commands/init.ts`
- New: registry infrastructure (separate package or hosted service)
- Add published metadata to `src/agents/__schemas/agent.schemas.ts`

## Notes

- Early mover advantage critical — once users invest in publishing Luca-format agents, switching costs increase
- Source agent: Competitive Edge Expert
- Global installation is the prerequisite — marketplace makes no sense if users can't install Luca outside the monorepo
