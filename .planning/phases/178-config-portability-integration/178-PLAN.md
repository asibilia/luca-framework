---
phase: 178
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: [176, 177]
---

# Phase 178 Plan 1: Config Portability & Integration

## Objective

Close the final gaps in the v5.0.0 global npm package by delivering stack-aware harness config templates, ensuring all hooks have dedup guards for global+project double-registration, verifying the full install flow end-to-end, and completing the global installation documentation to reflect the new CLI-driven workflow.

This is the capstone phase. Prior phases built the CLI surface (172), MuninnDB binary management (173), path portability (174), settings merge and artifact deployment (175), vault setup (176), and doctor/update/reinit (177). Phase 178 ties them together with config portability for diverse project stacks and end-to-end integration verification.

## Context

@packages/luca-framework/templates/base/.planning/config.json -- base config template (missing harness section)
@packages/luca-framework/src/utils/detect.ts -- project context detection (stack auto-detect)
@packages/luca-framework/src/utils/wizard.ts -- wizard flow that selects stack
@packages/luca-framework/src/utils/files.ts -- file generation (uses config template)
@packages/luca-framework/src/commands/init.ts -- 5-step global init orchestrator
@packages/luca-framework/src/commands/vault-init.ts -- per-project init with wizard
@packages/luca-framework/src/utils/settings-merger.ts -- three-tier settings merge
@src/hooks/**helpers/hook-io.ts -- guardDedup implementation
@src/hooks/**helpers/hook-registry.ts -- 14 canonical hooks
@src/hooks/scripts/post-tool-use-failure.ts -- missing guardDedup
@src/hooks/scripts/user-prompt-submit.ts -- missing guardDedup
@.planning/config.json -- current harness config shape (reference for template)
@docs/global-installation.md -- existing docs (monorepo-centric, needs update for npm)

## Tasks

### 1. Stack-aware harness config template

**Type:** auto
**TDD:** false
**Depends on:** none

The base config template (`templates/base/.planning/config.json`) is missing the `harness` section entirely. When `luca vault:init` generates a project's config, the harness checks default to nothing -- users have to manually configure test/typecheck/lint/build commands.

Create a harness config template factory that generates appropriate harness checks based on the detected project stack:

**Create `packages/luca-framework/src/utils/harness-templates.ts`** with a `getHarnessTemplate(stack: string)` function that returns the harness config object for a detected stack. Stack mappings:

| Stack                  | test command          | typecheck command                    | lint command                                   | build command              |
| ---------------------- | --------------------- | ------------------------------------ | ---------------------------------------------- | -------------------------- |
| `react-ts` / `node-ts` | `bun test`            | `bunx --bun tsc --noEmit`            | `bunx --bun eslint . --format json` (disabled) | `bun run build` (disabled) |
| `react` / `node`       | `bun test`            | none (disabled)                      | `bunx --bun eslint . --format json` (disabled) | `bun run build` (disabled) |
| `unknown` / fallback   | `bun test` (disabled) | `bunx --bun tsc --noEmit` (disabled) | none (disabled)                                | none (disabled)            |

The function should return the full `harness` object shape matching the existing `.planning/config.json` structure (enabled, maxFixIterations, failFast, checks array).

Use a Zod schema (`HarnessTemplateSchema`) for the return type. Export both the schema and the factory function.

**Update `packages/luca-framework/templates/base/.planning/config.json`** to include the harness section with EJS template tags that reference the stack-derived config, OR update the file generation logic in `files.ts` to merge the harness template into the generated config after template rendering.

The simpler approach: update `files.ts` to call `getHarnessTemplate(config.stack)` and merge the result into the generated config object after the EJS template is rendered.

**Files to create/edit:**

- `packages/luca-framework/src/utils/harness-templates.ts` (new)
- `packages/luca-framework/src/utils/files.ts` (merge harness config post-render)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Running `luca vault:init` in a TypeScript project generates config.json with harness checks that include `bun test` and `bunx --bun tsc --noEmit` as enabled checks

### 2. Add guardDedup to remaining hooks

**Type:** auto
**TDD:** false
**Depends on:** none

Two hooks currently lack the `guardDedup()` call that prevents double-firing when a hook is registered at both the global (`~/.claude/settings.json`) and project (`.claude/settings.json`) levels:

- `src/hooks/scripts/post-tool-use-failure.ts` -- no guardDedup
- `src/hooks/scripts/user-prompt-submit.ts` -- no guardDedup

The `subagent-stop.ts` code comment (line 23-25) explains these two intentionally use a per-project throttle instead of guardDedup. However, the throttle mechanism does NOT prevent the double-firing problem -- it prevents repeated firing within a time window, which is a different concern. A hook can both:

1. Use `guardDedup()` to prevent global+project double-fire (5s window, same hook name)
2. Use `checkThrottle()`/`recordThrottle()` for broader rate-limiting (minutes, different key)

Add `guardDedup("post-tool-use-failure")` at the top of `post-tool-use-failure.ts` and `guardDedup("user-prompt-submit")` at the top of `user-prompt-submit.ts`, before any throttle checks. This ensures all 14 hooks are protected against double-firing.

**Files to edit:**

- `src/hooks/scripts/post-tool-use-failure.ts` (add guardDedup import + call)
- `src/hooks/scripts/user-prompt-submit.ts` (add guardDedup import + call)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Both files import `guardDedup` from `../helpers/hook-io` and call it before any other logic

### 3. Update global installation documentation

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `docs/global-installation.md` to reflect the new CLI-driven workflow introduced in phases 172-177. The current docs describe the monorepo-centric `bun run deploy` flow. The v5 flow is:

1. `npm install -g @alecsibilia/luca-framework` (or `bun add -g`)
2. `luca init` (guided 5-step setup)
3. `cd <project> && luca vault:init` (per-project wizard)

Document:

- **Prerequisites**: Bun, Claude Code
- **Installation**: `npm install -g @alecsibilia/luca-framework` + `luca init`
- **Per-project setup**: `luca vault:init` with stack detection and harness config
- **Commands reference**: `luca init`, `luca vault:init`, `luca doctor`, `luca update`, `luca reinit`, `luca version`
- **Updating**: `npm update -g @alecsibilia/luca-framework && luca update --global`
- **Uninstalling**: `npm uninstall -g @alecsibilia/luca-framework && luca reinit --force` (or manual cleanup)
- **Troubleshooting**: Keep existing sections (bridge not found, hooks firing twice, symlinks broken) and add new ones for common npm global install issues
- **How it works**: Settings merge, hook dedup, deploy manifest, MuninnDB binary management
- **Dev mode**: Retain monorepo dev instructions for contributors

Keep the document concise. Focus on the user journey, not internal implementation details.

**Files to edit:**

- `docs/global-installation.md` (rewrite)

**Verification:**

- Document covers the full install journey from `npm install -g` through `luca vault:init`
- All CLI commands mentioned have accurate flags and descriptions
- Troubleshooting section covers common failure modes

### 4. End-to-end install flow verification script

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Create a verification script that exercises the full install flow programmatically, without requiring interactive prompts. This validates that all the pieces from phases 172-178 work together.

Create `scripts/verify-install-flow.ts` that:

1. **Prerequisites check**: Calls `checkPrerequisites()` and verifies Bun detection
2. **Runtime context**: Calls `detectRuntimeContext()` and verifies dev mode detection
3. **Project detection**: Calls `detectProjectContext()` in the monorepo root and verifies stack detection
4. **Harness template**: Calls `getHarnessTemplate("node-ts")` and verifies the output has 4 checks with correct commands
5. **Settings merger dry-run**: Creates a mock existing settings object, generates proposed hooks, runs `computeMergeActions()`, and verifies no unexpected conflicts
6. **Config template**: Verifies the base config template renders valid JSON with harness section
7. **Hook dedup coverage**: Reads all hook scripts in `src/hooks/scripts/` and verifies each imports `guardDedup` (or has a documented exemption)
8. **Doctor check registry**: Imports the doctor check list and verifies all expected scopes are present

The script should output pass/fail for each check with clear error messages. Exit 0 if all pass, exit 1 if any fail.

**Files to create:**

- `scripts/verify-install-flow.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `bun scripts/verify-install-flow.ts` exits 0 with all checks passing

## Verification

1. **Type check**: `bunx --bun tsc --noEmit` passes with zero errors
2. **Harness template**: `luca vault:init --quick` in a TypeScript project generates config with harness checks
3. **Hook dedup**: All 14 hooks in `src/hooks/scripts/` either call `guardDedup()` or have a documented exemption
4. **Documentation**: `docs/global-installation.md` covers the full npm-based install journey
5. **Integration**: `bun scripts/verify-install-flow.ts` exits 0

## Success Criteria

- Config templates are portable: a new TypeScript project gets appropriate `bun test` + `tsc --noEmit` harness checks without manual configuration
- All hooks are protected against double-firing when registered globally and per-project
- Documentation accurately describes the v5.0.0 installation flow for end users
- A single verification script proves all integration points work together
- Phase is minimal and focused: no scope creep beyond config portability, dedup, docs, and E2E verification

## Output Specification

- 1 new utility: `packages/luca-framework/src/utils/harness-templates.ts`
- 1 new script: `scripts/verify-install-flow.ts`
- 2 modified hooks: `post-tool-use-failure.ts`, `user-prompt-submit.ts`
- 1 modified utility: `packages/luca-framework/src/utils/files.ts`
- 1 rewritten doc: `docs/global-installation.md`
