# Working Memory

## Session Info

- **Started**: 2026-02-04
- **Workflow**: /lu-plan-phase
- **Phase**: 1 — Core CLI & Foundation

## Memory Recall

### Patterns
- **Codebase mapping with parallel agents**: Proven effective for comprehensive analysis
- **Questioning before planning**: Used in discuss-phase, surfaced wizard flow, output, defaults, and file structure decisions

### Decisions
- CLI installer over npm (better UX for setup wizard)
- Branded skin over rebrand (Cursor file name limitations, enables upgradability)
- React+TS template only v1 (ship one excellent template, prove pattern)
- UnJS ecosystem for CLI (citty, @clack/prompts, consola, unbuild)
- Luca/User separation (.cursor/luca/ for framework, .cursor/agents/ + .cursor/rules/ for user)

### Pitfalls
- **Hardcoded paths**: 10+ locations with PT-/ENG- prefixes need abstraction
- Framework file structure already exists — need to reorganize, not create from scratch

## Intuition Flags

- OPPORTUNITY: Strong patterns exist from research (UnJS ecosystem, @clack/prompts, origin/user separation)
- CAUTION: File restructuring may break existing installations
- CAUTION: Branding replacement scope may be larger than expected

## Planning Notes

<!-- Log planning decisions as they're made -->

---

*Session started: 2026-02-04*
