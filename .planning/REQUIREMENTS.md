# Requirements — v5.3.0 Dogfood via Global Install

## Overview

Invert the build flow so templates are the canonical intermediate format. Compile `src/` directly to `templates/` with EJS branding placeholders, then dogfood via `bun link` + `luca init` to deploy templates to `.claude/`. Single code path for both dogfood and user consumption.

## Requirements

### REQ-1: Compiler Template Output

**Priority:** P0 — Foundation for all other requirements

The compilation pipeline (`src/compilers/`) must output files with EJS branding placeholders directly, instead of hardcoded `lu-` prefix values.

**Acceptance Criteria:**

- [ ] `compileAgent()` outputs `<%= branding.commandPrefix %>-{name}` in YAML name fields
- [ ] `compileSkill()` outputs `<%= branding.commandSlash %>` for slash commands
- [ ] `compileRule()` outputs `<%= branding.frameworkName %>` for brand references
- [ ] Shell wrapper generator outputs `<%= branding.commandPrefix %>` in script paths
- [ ] All compiled output uses EJS placeholders for: commandPrefix, commandSlash, frameworkName, nameLowercase
- [ ] Non-branded content (code logic, markdown body) remains unchanged

### REQ-2: Build Pipeline Split

**Priority:** P0 — Core architecture change

Split `build:all` into two distinct stages: `build:compile` (src/ → templates/) and `build:deploy` (templates/ → .claude/).

**Acceptance Criteria:**

- [ ] `bun run build:compile` compiles src/ → `packages/luca-framework/templates/harness/claude/` with EJS placeholders
- [ ] `bun run build:deploy` resolves EJS templates using local branding config and writes to `.claude/`
- [ ] `bun run build:all` chains both stages (backward-compatible)
- [ ] `build:compile` has no dependency on luca CLI or init command
- [ ] `build:deploy` uses the same template resolution code path as `luca init`
- [ ] Build manifest (`.claude/.build-manifest.json`) still generated after deploy

### REQ-3: Dogfood via luca init

**Priority:** P1 — The core dogfood goal

The `build:deploy` step must use `luca init` (or its core template-resolution logic) to deploy templates to `.claude/`, ensuring the same code path is exercised for both developer dogfood and end-user installation.

**Acceptance Criteria:**

- [ ] `bun link` registers the local package globally
- [ ] `luca init` (or programmatic equivalent) resolves EJS templates with branding from `.planning/config.json`
- [ ] Deployed `.claude/` output is byte-identical to what `build:all` produces today (except for whitespace/formatting)
- [ ] Template resolution handles: filename branding (`__branding.commandPrefix__-` → `lu-`), directory branding, content branding
- [ ] Chicken-and-egg resolved: compilation step requires no CLI; only deploy step uses it

### REQ-4: Remove Branding Transform

**Priority:** P1 — Cleanup after REQ-1/REQ-2

The reverse-engineering branding transform in `copy-harness-templates.ts` must be eliminated since compilers now output templates directly.

**Acceptance Criteria:**

- [ ] `transformBrandingContent()` removed or reduced to a no-op pass-through
- [ ] `transformBrandingFilename()` removed
- [ ] `transformBrandingDirname()` removed
- [ ] `copy-harness-templates.ts` becomes a simple copy (or is deleted entirely)
- [ ] No regex-based branding substitution remains in the build pipeline

### REQ-5: Drift Check Compatibility

**Priority:** P1 — CI/CD safety

The existing `bun run check:drift` command must continue to work, verifying that generated `.claude/` output matches the compiled source.

**Acceptance Criteria:**

- [ ] `check:drift` compares `.claude/` against the output of `build:compile` + `build:deploy`
- [ ] CI pipeline (GitHub Actions) passes with the new build flow
- [ ] No false positives from EJS template artifacts in the drift check

### REQ-6: Session Lock & Manifest Compatibility

**Priority:** P2 — Operational safety

Session lock guard and build manifest must work with the new two-stage pipeline.

**Acceptance Criteria:**

- [ ] Session lock check runs before `build:deploy` (not `build:compile`)
- [ ] Build manifest records artifact counts from the deploy stage
- [ ] Existing `.claude/.session-lock` behavior preserved

## Out of Scope

- Changing the `luca init` wizard UX (this milestone only ensures it works for dogfood)
- Multi-platform support (Cursor/Pi removed in v4.5.0)
- Template format migration (EJS is the established format)
- npm publish workflow changes (handled in v5.2.0)

## Dependencies

- v5.2.0 must be shipped (current state: complete on main)
- `packages/luca-framework/` template resolution logic must be importable programmatically

## Risk Assessment

| Risk                                              | Likelihood | Impact | Mitigation                                         |
| ------------------------------------------------- | ---------- | ------ | -------------------------------------------------- |
| EJS output differs from current hardcoded output  | Medium     | High   | Byte-comparison tests between old and new pipeline |
| luca init has side effects beyond template deploy | Low        | Medium | Use programmatic API, not full CLI wizard          |
| build:all backward compat breaks                  | Medium     | High   | Chain compile + deploy, verify with check:drift    |
| Shell wrapper paths break in dogfood mode         | Medium     | Medium | Test both global and local install paths           |
