# Phase 20: Skills & Agents Packaging - Context

**Gathered:** 2026-02-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Compile all skills, agents, and commands for the plugin. Convert critical rules to skills. The build pipeline (Phase 19) already generates skills and agents to `dist/plugin/`. Phase 20 focuses on: slash commands, /lu skill chaining fix, rules-as-skills conversion, and description optimization.

</domain>

<decisions>
## Implementation Decisions

### Slash Command Selection

- All **non-internal** user-facing skills become slash commands (~25-30 commands)
- Internal orchestrator skills (lu-cognition, lu-learner, lu-router) are **excluded** from commands — they remain as auto-discoverable skills only
- Commands live in plugin `commands/` directory as markdown files
- Plugin namespace prefix: `luca:` (e.g., `/luca:commit`, `/luca:plan-phase`, `/luca:execute-phase`)

### /lu Skill Chaining Fix (PACK-03 scope)

- **Root issue**: The `/lu` orchestrator skill currently inlines sub-skill behavior instead of actually invoking them as separate skill calls. Users miss visual skill headers, complexity gating prompts, and structured discussion flow.
- **Decision**: `/lu` should **auto-invoke** sub-skills programmatically so they run with full skill context (headers, gating, etc.)
- **This is in scope for Phase 20** under PACK-03, not deferred
- Investigation needed: understand why /lu isn't chaining skills currently and what the plugin system supports for skill-to-skill invocation

### Rules-as-Skills Conversion

- **Framework rules only** — convert the 4 core Luca workflow rules:
  1. `lu-workflow` — Cognitive memory system (BRAIN.md, MEMORY.md, WORKING.md)
  2. `complexity-gating` — 5 complexity levels with task gating matrix
  3. `harness-verification` — Hooks vs harness verification boundaries
  4. `hook-skill-boundary` — When to use hooks vs skills
  5. (5th rule: Claude's choice — likely `file-naming` for broad applicability)
- General coding standards (no-classes, api-snake-case, etc.) are **not** converted — they're project-specific, not framework-essential
- **Tiered content approach**: Short description for lazy loading discovery + full content in the skill body

### Description Optimization

- **Token-conscious but complete**: Rewrite descriptions to 1-2 sentences that enable accurate Tool Search discovery
- Full skill content remains in the body for when Claude loads the skill
- **Scope: all 41 skills** — consistent quality across the entire plugin
- Optimization target: descriptions concise enough for lazy loading, specific enough for discovery

### Claude's Discretion

- Exact wording of optimized skill descriptions
- Choice of 5th rule to convert (recommendation: `file-naming`)
- Command file format details (frontmatter structure, description field)
- Implementation approach for /lu skill chaining (after investigation)

</decisions>

<specifics>
## Specific Ideas

- The `/lu` command should produce the same visual experience as invoking sub-skills directly — users should see the skill headers like `━━━ Luca > DISCUSS PHASE 20 ━━━` and get complexity gating prompts
- Skill descriptions should help Claude distinguish between similar skills (e.g., `lu-plan-phase` vs `lu-plan-session` vs `lu-plan-milestone-gaps`)
- Rules converted to skills should feel like native skills, not bolted-on rule text

</specifics>

<deferred>
## Deferred Ideas

- Converting all 16 rules to skills — only 5 framework rules for now
- MCP server bundling in the plugin — out of scope per v1.3.0 requirements
- Plugin auto-update mechanism — handled by Claude Code's marketplace infrastructure

</deferred>

---

_Phase: 20-skills-agents-packaging_
_Context gathered: 2026-02-12_
