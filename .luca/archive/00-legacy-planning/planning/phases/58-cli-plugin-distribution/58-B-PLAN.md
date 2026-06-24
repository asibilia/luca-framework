# Plan 58-B: Structure dist/ for --plugin-dir Compatibility

## Objective

Ensure the dist/ directory contains compiled rules, skills, hooks, and settings so `claude --plugin-dir dist/` works correctly.

## Tasks

### 1. Update build pipeline

The existing `bun run build:all` already generates compiled outputs to `.claude/` and `.cursor/`. For plugin distribution, the dist/ needs to include these. Update the build process to also copy compiled assets to `packages/luca-framework/dist/plugin/`.

### 2. Add plugin output directory

Create a build step that copies the compiled `.claude/` assets (rules, skills, agents, hooks, settings) into `dist/plugin/` so `--plugin-dir` can find them.

## Verification

- dist/plugin/ contains compiled assets after build
- File structure matches what `--plugin-dir` expects
