---
title: "Dogfood via global install: use luca init instead of build:all for .claude/"
area: build
created: 2026-03-17
source: conversation
---

## Context

The current build pipeline is backwards: `build:all` compiles `src/` directly to `.claude/` (hardcoded `lu-` prefix), then `copy-harness-templates.ts` reverse-engineers branding placeholders for the npm distribution templates. This caused repeated issues where `build:all` overwrote manually branded template files.

## Task

Invert the build flow so templates are the canonical intermediate format:

1. **Compile** `src/agents/*.agent.ts` → `templates/harness/claude/agents/__branding.commandPrefix__-*.md` (with EJS placeholders, not resolved values)
2. **Dogfood** via `bun link` + `luca init` to deploy templates → `.claude/` (resolving branding through the same code path users use)
3. **Remove** the branding transform logic from `copy-harness-templates.ts` (no longer needed — compiler outputs templates directly)

### Benefits

- Single code path for both dogfood and user consumption
- Branding correct by construction (no reverse-engineering)
- True dogfooding — catches init bugs before users hit them
- `copy-harness-templates.ts` becomes a simple copy (or goes away entirely)

### Chicken-and-egg resolution

The compilation step (`src/` → `templates/`) runs first and doesn't need the CLI. Only the dogfood step (`templates/` → `.claude/`) uses `luca init`. So:

```
bun run build:compile   # src/ → templates/ (compiler, no CLI needed)
bun link                # symlink package globally
luca init --preset=full # deploy templates → .claude/ (same as users)
```

## Notes

- The current `copy-harness-templates.ts` branding transform (added in v5.2.0) is a workaround, not a permanent solution
- This todo affects `scripts/build-all.ts`, `scripts/build-shared.ts`, `scripts/copy-harness-templates.ts`, and potentially the compiler output logic in `src/compilers/`
- Consider whether `build:all` should be split into `build:compile` (templates) + `build:deploy` (dogfood via init)
