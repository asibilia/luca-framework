# Plan 73-A: Template Infrastructure

## Objective

Create a script that copies compiled harness outputs (.claude/, .cursor/, .pi/) into `templates/harness/` for npm distribution, add it to the build pipeline, and gitignore the generated directory.

## Tasks

### T1: Create scripts/copy-harness-templates.ts

- Copy .claude/ -> templates/harness/claude/ (agents, rules, skills, hooks, settings.json)
- Copy .cursor/ -> templates/harness/cursor/ (agents, rules, skills, hooks)
- Copy .pi/ -> templates/harness/pi/ (agents, skills, hooks, extensions, settings.json)
- Follow copy-plugin.ts pattern

### T2: Add build:templates script to root package.json

- Chain: build:all now runs build-all.ts then build:templates

### T3: Add templates/harness/ to .gitignore

### T4: Update packages/luca-framework/package.json files array

- Ensure templates/harness/ is included in npm distribution

## Verification

- `bun run build:all` produces templates/harness/{claude,cursor,pi}/
- `bunx --bun tsc --noEmit` passes
- `bun test` passes
- `templates/harness/` is gitignored

## Requirements Addressed

R3.1, R3.2, R3.3, R3.4
