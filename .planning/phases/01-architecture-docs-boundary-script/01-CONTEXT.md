# Phase 1 Context: Architecture Docs + Boundary Script

## Objective

Register three new domains (workflow T1, eval T1, adapters T3) in architecture documentation and the automated boundary check script before any implementation begins.

## Decisions

### Domain Tier Classification (locked)

- `workflow` → T1 Core (DAG engine, step contracts, same tier as planner/iteration)
- `eval` → T1 Core (evaluation framework, same tier as harness/observability)
- `adapters` → T3 Build (IDE-specific compilation, terminal like compilers/hooks)

### Scope (locked)

- X01: Update `.claude/rules/domain-architecture.md` (3 table edits) and `.claude/rules/module-boundary.md` (1 tier map edit + import examples)
- X02: Add 3 entries to `DOMAIN_TIER` map in `scripts/check-domain-boundaries.ts`

### No Gray Areas

Both todos contain exact before/after diffs. No design decisions needed.

## Constraints

- Changes are docs/config only — zero risk of breaking existing functionality
- X02 depends on X01 (boundary script references architecture docs)
- Boundary script will silently skip new domains until directories exist
