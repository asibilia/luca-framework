# Phase 22: Distribution & Marketplace - Context

**Gathered:** 2026-02-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Prepare the complete plugin package for marketplace distribution. Generate marketplace manifest, plugin README, consolidate the build pipeline into a single unified script, and extend drift detection to cover all plugin output files. Does NOT include npm distribution, CI/CD automation, or auto-update mechanisms.

</domain>

<decisions>
## Implementation Decisions

### Marketplace manifest

- Minimal metadata only — repository URL, homepage, icon path, marketplace category
- Version sourced from package.json at build time (single source of truth)
- Generated as a build artifact (not hand-maintained) — build script creates marketplace.json from plugin.json + package.json
- Location: Claude's discretion based on Claude Code marketplace spec

### Plugin README

- Developer-concise tone — install command, feature list, quick-start commands (like a good npm package README)
- High-level categories only for "What's Included" — group by capability with counts, no full skill/agent listing
- Generated at build time from source registries — counts and categories auto-update
- Lives at dist/plugin/README.md

### Build pipeline integration

- Consolidate all generation into build-all.ts — move plugin generation logic inline alongside .claude/ and .cursor/ generation
- Remove standalone build-plugin.ts script — one way to build, no separate build:plugin command
- Unified build summary — report stats for all three targets (.claude/, .cursor/, dist/plugin/) including file counts and sizes
- Plugin build runs as a stage after .claude/ and .cursor/ generation

### Drift detection

- Full coverage — track all plugin output files: agents, skills, commands, hooks.json, scripts, plugin.json, marketplace.json, README
- Detect orphaned files — report files in dist/plugin/ that don't correspond to any source
- Extend existing pre-commit-drift-check hook — single check for all outputs (.claude/, .cursor/, dist/plugin/)
- Local only — no CI integration in this phase

### Claude's Discretion

- Exact marketplace.json file location (dist/plugin/ root vs .claude-plugin/ subdirectory)
- README section ordering and exact wording
- Build-all.ts refactoring approach (how to cleanly integrate plugin generation)
- Orphan detection implementation strategy

</decisions>

<specifics>
## Specific Ideas

- Build pipeline restructuring: currently build-all.ts generates .claude/ and .cursor/ inline, then calls build-plugin.ts as a subprocess. Goal is to eliminate the subprocess call and handle all three targets in one script.
- marketplace.json should be lean — the plugin.json already carries the heavy metadata (component lists, keywords, author). marketplace.json adds only what's needed for marketplace discovery.
- README generation should pull from the same registries that build-all.ts uses for compilation — skill count, agent count, command count should be dynamically computed.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 22-distribution_
_Context gathered: 2026-02-12_
