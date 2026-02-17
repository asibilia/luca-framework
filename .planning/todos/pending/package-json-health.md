---
title: "Fix package.json and tsconfig health issues across workspace"
area: config
priority: medium
created: 2026-02-16
source: repo-audit
---

## Context

Multiple package configuration issues found across the monorepo workspace packages.

## Task

1. **Add `main` field to all 3 package.json files** for CommonJS fallback:
   - `packages/create-luca/package.json` — add `"main": "./dist/index.cjs"`
   - `packages/luca-framework/package.json` — add `"main": "./dist/index.cjs"`
   - `packages/luca-state/package.json` — add `"main": "./dist/index.cjs"`

2. **Add typescript devDep to `packages/luca-framework/package.json`**:
   - Has @types packages but no typescript in devDependencies

3. **Create tsconfig.json in packages missing them**:
   - `packages/luca-framework/tsconfig.json` — extend root config
   - `packages/create-luca/tsconfig.json` — extend root config
   - (luca-state already has one)

4. **Remove unused tsconfig path alias**:
   - `tsconfig.json` defines `"~/*": ["./src/*"]` but it's never used anywhere
   - Either start using it or remove it

5. **Consider updating hardcoded `0.0.1` versions** in package.json files if semantic versioning is needed for publish

## Notes

- Version management may be intentional for pre-publish development
- Path alias removal is low risk — nothing uses it
