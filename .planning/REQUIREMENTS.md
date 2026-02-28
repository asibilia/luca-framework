# Requirements — v2.3.0 Distribution & Model Routing

## Overview

Publish `@alecsibilia/luca-framework` as an installable npm package with multi-harness scaffolding, and replace complexity gating with per-agent model routing for consistent workflows.

## Source

- Todo: `.planning/todos/pending/distribution-strategy-alecsibilia-luca-framework.md`
- Todo: `.planning/todos/pending/replace-complexity-gating-with-model-routing.md`
- Backlog: v2.3.0 "Multi-Language Profiles" deferred to v2.4.0

## Requirements

### R1: NPM Scope & Package Identity

**Priority:** HIGH | **Source:** Distribution Strategy todo, Phase 1

- R1.1: npm scope renamed from `@asibilia` to `@alecsibilia` in package.json and all templates
- R1.2: `HarnessId` type (`"claude" | "cursor" | "pi"`) exported from `src/types.ts`
- R1.3: `harnesses` field added to `LucaConfig` and `LucaManifest` types
- R1.4: `runBridgeCli()` exported from `src/state/bridge.ts` (extracted from `import.meta.main`)
- R1.5: `bin/luca-bridge.js` bin entry exists and is functional
- R1.6: `package.json` bin entries and version updated

### R2: Wizard & Harness Selection

**Priority:** HIGH | **Source:** Distribution Strategy todo, Phase 2

- R2.1: Wizard includes harness multi-select step (after stack, before tracker)
- R2.2: `createConfigFromArgs()` and `loadConfigFromFile()` support `--harness` argument
- R2.3: `init.ts` accepts `--harness` CLI argument
- R2.4: `files.ts` conditionally scaffolds per harness (`scaffoldClaude()`, `scaffoldCursor()`, `scaffoldPi()`)

### R3: Template Infrastructure

**Priority:** HIGH | **Source:** Distribution Strategy todo, Phase 3

- R3.1: `scripts/copy-harness-templates.ts` copies compiled outputs to `templates/harness/`
- R3.2: Template structure: `templates/harness/{claude,cursor,pi}/{agents,rules,skills,...}`
- R3.3: `templates/harness/` added to `.gitignore`
- R3.4: Build pipeline chains: `build:all` -> `build:templates` -> `build`

### R4: Hook Script Portability

**Priority:** MEDIUM | **Source:** Distribution Strategy todo, Phase 4

- R4.1: All hook scripts export `PATH` with `node_modules/.bin`
- R4.2: Bridge resolution uses cascading lookup (`luca-bridge` bin -> monorepo source -> empty)
- R4.3: All template references updated from `@asibilia` to `@alecsibilia`

### R5: Update Command & Doctor

**Priority:** MEDIUM | **Source:** Distribution Strategy todo, Phase 5

- R5.1: `update.ts` handles harness-specific files based on `manifest.harnesses`
- R5.2: `doctor.ts` performs per-harness verification (Claude/Cursor/Pi checks)
- R5.3: `init.ts` success output lists harness-specific directories

### R6: Distribution Testing

**Priority:** HIGH | **Source:** Distribution Strategy todo, Phase 6

- R6.1: `wizard.test.ts` tests harness multi-select and `createConfigFromArgs` with `--harness`
- R6.2: `files.test.ts` tests conditional generation (claude-only, cursor-only, pi-only, all)
- R6.3: `bridge.test.ts` tests `runBridgeCli()` dispatch
- R6.4: `manifest.test.ts` tests backward compat (missing `harnesses` defaults to `['claude', 'cursor']`)
- R6.5: Integration test: `luca init --quick --harness=claude,pi` in temp dir

### R7: Model Routing Architecture

**Priority:** HIGH | **Source:** Replace Complexity Gating todo

- R7.1: Consistent workflow — every task goes through the same phases/steps regardless of complexity
- R7.2: Per-agent model routing table replaces complexity skip/run matrix
- R7.3: Agent definitions include `modelTier` field (`"fast" | "balanced" | "capable"`)
- R7.4: Complexity levels retained for effort estimation but no longer gate workflow steps
- R7.5: All complexity-gated skip logic removed from skills, hooks, and agents

---

_Requirements created: 2026-02-28_
