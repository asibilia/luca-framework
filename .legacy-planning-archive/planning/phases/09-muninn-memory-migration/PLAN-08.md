---
phase: 09
plan: 08
type: improvement
autonomous: true
wave: 4
depends_on: ["PLAN-07"]
---

# Phase 09 Plan 08: Update Documentation for MuninnDB Migration

## Objective

Update all documentation files that reference the old file-based memory system (BRAIN.md, MEMORY.md, WORKING.md, memory bridge) to reflect MuninnDB as the memory backend. There are 166 occurrences across 13 documentation files.

This plan runs after PLAN-07 (which rebuilds generated outputs and verifies source code is clean) to ensure documentation matches the final state of the codebase.

## Context

@docs/architecture-overview.md
@docs/getting-started.md
@docs/generation-system.md
@docs/agent-framework/luca/end-to-end-workflow.md
@docs/agent-framework/luca/diagrams.md
@docs/agent-framework/luca/README.md
@docs/agent-framework/luca/framework-diagram.md
@docs/agent-framework/luca/architecture-plan.md
@docs/agent-framework/README.md
@docs/diagrams/cognition-flow.md
@docs/diagrams/workflow-overview.md
@docs/style-guide/coding-standards.md
@.planning/phases/09-muninn-memory-migration/CONTEXT.md

## Tasks

### 1. Update architecture and getting-started docs

**Type:** auto
**TDD:** false
**Depends on:** none

Update the top-level documentation files:

**docs/architecture-overview.md (33 occurrences):**

- Replace all references to "BRAIN.md" with "MuninnDB brain tree (`brain:project-identity`)"
- Replace all references to "MEMORY.md" with "MuninnDB engrams (`pattern:*`, `decision:*`, `pitfall:*`, `preference:*`)"
- Replace all references to "WORKING.md" with "MuninnDB session engrams (`session:*`)"
- Update memory architecture diagrams/descriptions from file-based to MuninnDB
- Replace "memory bridge" references with "MuninnDB MCP tools"

**docs/getting-started.md (3 occurrences):**

- Update setup instructions: remove "creates BRAIN.md, MEMORY.md, WORKING.md"
- Reference MuninnDB MCP setup instead of memory files
- Update first-run guidance

**docs/generation-system.md:**

- Remove BRAIN.md, MEMORY.md, WORKING.md from directory listings
- Update any memory domain references in the generation pipeline docs

**Files to create/edit:**

- `docs/architecture-overview.md`
- `docs/getting-started.md`
- `docs/generation-system.md`

**Verification:**

- Zero references to BRAIN.md/MEMORY.md/WORKING.md as operational files in these docs
- MuninnDB documented as the memory backend

### 2. Update agent framework documentation

**Type:** auto
**TDD:** false
**Depends on:** none

Update the agent framework documentation suite:

**docs/agent-framework/luca/end-to-end-workflow.md (38 occurrences):**

- Update cognitive pre-flight steps from file-based to MuninnDB
- Replace memory bridge commands with MuninnDB MCP tool names
- Update workflow diagrams

**docs/agent-framework/luca/framework-diagram.md (21 occurrences):**

- Update memory system boxes/arrows from files to MuninnDB
- Update data flow descriptions

**docs/agent-framework/luca/diagrams.md (17 occurrences):**

- Update all memory-related diagrams

**docs/agent-framework/luca/architecture-plan.md (14 occurrences):**

- Update architecture descriptions

**docs/agent-framework/luca/README.md (13 occurrences):**

- Update overview descriptions

**docs/agent-framework/README.md (4 occurrences):**

- Update top-level agent framework overview

**Files to create/edit:**

- `docs/agent-framework/luca/end-to-end-workflow.md`
- `docs/agent-framework/luca/framework-diagram.md`
- `docs/agent-framework/luca/diagrams.md`
- `docs/agent-framework/luca/architecture-plan.md`
- `docs/agent-framework/luca/README.md`
- `docs/agent-framework/README.md`

**Verification:**

- Zero references to BRAIN.md/MEMORY.md/WORKING.md as operational files
- MuninnDB terminology used consistently
- Diagrams reflect MuninnDB architecture

### 3. Update diagrams and style guide

**Type:** auto
**TDD:** false
**Depends on:** none

**docs/diagrams/cognition-flow.md (14 occurrences):**

- Update cognition flow from file reads to MuninnDB recalls
- Replace "Load BRAIN.md" with "Recall brain tree from MuninnDB"
- Replace "Recall from MEMORY.md" with "Semantic recall from MuninnDB"
- Replace "Initialize WORKING.md" with "Initialize MuninnDB session"

**docs/diagrams/workflow-overview.md (3 occurrences):**

- Update workflow overview diagram memory references

**docs/style-guide/coding-standards.md (3 occurrences):**

- Update memory-related coding standards

**docs/skill-description-audit.md (1 occurrence):**

- Update if referencing memory skills

**docs/observer-architecture.md (2 occurrences):**

- Update if referencing memory domain

**Files to create/edit:**

- `docs/diagrams/cognition-flow.md`
- `docs/diagrams/workflow-overview.md`
- `docs/style-guide/coding-standards.md`
- `docs/skill-description-audit.md`
- `docs/observer-architecture.md`

**Verification:**

- Zero references to file-based memory system in diagram and style docs
- Cognition flow accurately reflects MuninnDB-based pre-flight

### 4. Final documentation verification sweep

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Run a comprehensive grep across all docs to verify no operational memory file references remain:

```bash
# Check for remaining references
grep -rn "BRAIN\.md\|MEMORY\.md\|WORKING\.md\|bridge\.ts\|memory bridge" docs/ --include="*.md"

# Verify MuninnDB is mentioned where memory used to be
grep -rn "MuninnDB\|muninn" docs/ --include="*.md" | wc -l
```

**Verification:**

- Zero operational references to BRAIN.md/MEMORY.md/WORKING.md in docs/
- MuninnDB referenced in key documentation files
- Historical/changelog references (if any) are acceptable — only operational references must be updated

## Verification

1. Zero references to BRAIN.md/MEMORY.md/WORKING.md as operational files across all 13+ docs files
2. MuninnDB documented as memory backend in architecture, workflow, and diagram docs
3. Cognition flow diagrams reflect MuninnDB-based pre-flight
4. Getting-started guide references MuninnDB setup
5. Agent framework docs describe MuninnDB integration pattern

## Success Criteria

- All 166 occurrences across 13 documentation files addressed
- Documentation accurately describes MuninnDB as the memory system
- No reader would be confused about where memory lives after reading docs
- Historical references preserved where appropriate (changelogs, migration notes)

## Output Specification

**Files modified:**

- `docs/architecture-overview.md`
- `docs/getting-started.md`
- `docs/generation-system.md`
- `docs/agent-framework/luca/end-to-end-workflow.md`
- `docs/agent-framework/luca/framework-diagram.md`
- `docs/agent-framework/luca/diagrams.md`
- `docs/agent-framework/luca/architecture-plan.md`
- `docs/agent-framework/luca/README.md`
- `docs/agent-framework/README.md`
- `docs/diagrams/cognition-flow.md`
- `docs/diagrams/workflow-overview.md`
- `docs/style-guide/coding-standards.md`
- `docs/skill-description-audit.md`
- `docs/observer-architecture.md`
