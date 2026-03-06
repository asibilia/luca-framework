# Luca Memory

> Long-term learning storage. Updated after verified work.

## Patterns

<!-- Validated approaches that work -->

### Use Bun for all runtime operations

**Tags:** [typescript, runtime, tooling]
**Confidence:** High
**Agent:** lu-codebase-mapper

Bun provides significantly faster performance than Node.js for this codebase. Use:
- `bun <file>` instead of `node <file>`
- `bun test` instead of `jest` or `vitest`
- `bun install` instead of `npm install`

### Use path aliases with tilde notation

**Tags:** [typescript, imports, architecture]
**Confidence:** High
**Agent:** code-architect

Always use `~/*` path aliases for imports from src/ directory. This provides:
- Consistent import paths regardless of file depth
- Easier refactoring when moving files
- Better IDE support with tsconfig.json paths

## Decisions

<!-- Past choices that were made -->

### Decision: Mono-repo structure with workspaces

**Tags:** [architecture, packages]
**Confidence:** Medium
**Agent:** lu-repo-architect

Choosing a mono-repo structure allows:
- Shared dependencies across packages
- Consistent versioning
- Easier cross-package development

## Pitfalls

<!-- Known issues to avoid -->

### Don't use tsconfig-paths at runtime

**Tags:** [typescript, bun, gotcha]
**Confidence:** High
**Agent:** lu-debugger

tsconfig-paths is not needed with Bun - it natively resolves paths. Only use it for test context if required.

## Preferences

<!-- User and project preferences -->

### Prefer functional programming patterns

**Tags:** [typescript, style]
**Confidence:** Medium

- Use pure functions where possible
- Avoid mutable state
- Prefer composition over inheritance

---

*Luca Memory initialized*

