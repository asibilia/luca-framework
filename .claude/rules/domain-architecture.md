# Domain architecture: archetypes, dependency tiers, and structural invariants

## rule

# Domain Architecture

## Three Domain Archetypes

Every `src/` domain is classified into one of three archetypes:

### Archetype A — Entity Domains

Domains that define named instances registered in a global registry.

| Domain | Registry | Entity dirs |
|--------|----------|-------------|
| agents | agentRegistry | general/, luca/ |
| skills | skillRegistry | general/, luca/ |
| rules | ruleRegistry | general/, profiles/ |

**Structure:**

```
src/{domain}/
├── __schemas/     # Zod schemas and inferred types
├── __helpers/     # Factory functions and internal utilities
├── {entity-dir}/  # Named entity files ({name}.{type-singular}.ts)
└── index.ts       # Barrel: re-exports schemas + helpers + registry
```

### Archetype B — Core Domains

Internal logic modules consumed by entities and other core modules.

| Domain | Purpose |
|--------|---------|
| memory | Working memory, compression, recall, bridge |
| planner | Cost model, scheduler, scoring, todo parsing |
| iteration | Budget, checkpoint, classifier, convergence |
| context | Context tier resolution, assembler, envelope |
| shared | Cross-cutting utilities (format, validation, CLI) |

**Structure:**

```
src/{domain}/
├── __schemas/     # Zod schemas and inferred types
├── __helpers/     # Pure functions and utilities
└── index.ts       # Barrel: re-exports schemas + helpers
```

### Archetype C — Infrastructure Domains

Build-time, verification, or orchestration modules.

| Domain | Purpose |
|--------|---------|
| compilers | Compile TS definitions to Claude/Cursor/Plugin markdown |
| complexity | Complexity gating matrix and classifications |
| harness | Verification runner (test/typecheck/lint/build) |
| hooks | Hook registry and config generators |

**Structure:**

```
src/{domain}/
├── __schemas/     # Zod schemas and inferred types
├── __helpers/     # Implementation functions
├── {subdir}/      # Optional: parsers/, scripts/ (domain-specific)
└── index.ts       # Barrel: re-exports schemas + helpers
```

## Four Dependency Tiers

Import direction flows downward only. Tier N may import from tiers 0..N-1, never from N+1..3.

| Tier | Domains | Role |
|------|---------|------|
| T0 Foundation | shared, complexity | Imported by many, imports nothing from src/ |
| T1 Core | context, planner, harness, iteration, memory | Import T0 only |
| T2 Entity | agents, skills, rules | Import T0-T1; parallel, never cross-import |
| T3 Build | compilers, hooks | Terminal; imported by nothing in src/ |

See `.claude/rules/module-boundary.md` for detailed import rules.

## Structural Invariants

### index.ts Is Only a Barrel

Every domain's `index.ts` MUST contain only re-export statements. No logic, no schemas, no registries, no constants — only `export { ... } from` and `export type { ... } from`.

### No Flat Files in Domain Root

The only `.ts` file allowed at the domain root is `index.ts`. All other code lives in `__schemas/`, `__helpers/`, entity dirs, or named subdirs.

### File Naming Conventions

- **Schema files**: `{domain}.schemas.ts` inside `__schemas/`
- **Helper files**: kebab-case inside `__helpers/` (e.g., `cost-model.ts`, `quality-scorer.ts`)
- **Entity files**: `{name}.{type-singular}.ts` inside entity dirs (e.g., `lu-router.agent.ts`, `git-commit.skill.ts`)
- **Barrel files**: `index.ts` at domain root

## Adding a New Domain

1. **Classify**: Determine archetype (A/B/C) and tier (T0-T3)
2. **Create structure**: `mkdir -p src/{domain}/__schemas src/{domain}/__helpers`
3. **Add schemas**: Create `{domain}.schemas.ts` with Zod definitions
4. **Add helpers**: Create kebab-case helper files
5. **Create barrel**: Write `index.ts` with re-exports only
6. **Register** (Entity domains only): Add to the appropriate registry in `src/{domain}/index.ts`
7. **Update docs**: Add to `docs/generation-system.md` directory tree
8. **Verify**: Run `bun run scripts/check-domain-boundaries.ts` to confirm tier compliance