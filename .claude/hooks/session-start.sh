#!/usr/bin/env bash
# session-start.sh -- Initialize .planning/ directory for Luca
#
# Hook event: SessionStart
# Type: Command hook (synchronous)
# Timeout: 15 seconds
#
# Creates .planning/ directory with BRAIN.md, MEMORY.md, WORKING.md,
# STATE.md, ROADMAP.md, and config.json on first session. Subsequent
# sessions only create missing files (validate & repair mode).
#
# BRAIN.md auto-detects project info from package.json and config files.
# config.json includes runtime detection (bun vs node).
#
# Uses `bun -e` for JSON parsing and file generation (project convention).

set -euo pipefail

# Read stdin JSON (standard hook pattern)
INPUT=$(cat)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
PLANNING_DIR="$PROJECT_DIR/.planning"

# Step 1: Check bun availability
if ! command -v bun &>/dev/null; then
  # Output systemMessage warning -- do not block session start
  printf '{"systemMessage":"[Luca] Bun is not installed. Luca hooks require Bun for JSON parsing and build commands. Install from https://bun.sh"}'
  exit 0
fi

# Step 2: Create .planning/ directory if missing
mkdir -p "$PLANNING_DIR"

CREATED=""

# Step 3a: Create MEMORY.md if missing
if [ ! -f "$PLANNING_DIR/MEMORY.md" ]; then
  cat > "$PLANNING_DIR/MEMORY.md" << 'MEMORY_EOF'
# Luca Memory

> Long-term learning storage. Updated after verified work.

## Patterns

<!-- Validated approaches that work -->

## Decisions

<!-- Past choices with rationale -->

## Pitfalls

<!-- Known issues to avoid -->

## Preferences

<!-- User and project preferences -->

---

*Luca Memory initialized*
MEMORY_EOF
  CREATED="${CREATED}MEMORY.md "
fi

# Step 3b: Create WORKING.md if missing
if [ ! -f "$PLANNING_DIR/WORKING.md" ]; then
  cat > "$PLANNING_DIR/WORKING.md" << 'WORKING_EOF'
# Luca Working Memory

> Active session memory. Cleared after learning extraction.

## Current Context

- **Task:** None
- **Started:** N/A

## Findings

<!-- Immediate discoveries -->

## Hypotheses

<!-- For debugging -->

## Candidate Learnings

<!-- To be verified before committing to MEMORY.md -->

---

*Luca Working Memory initialized*
WORKING_EOF
  CREATED="${CREATED}WORKING.md "
fi

# Step 3c: Create STATE.md if missing
if [ ! -f "$PLANNING_DIR/STATE.md" ]; then
  cat > "$PLANNING_DIR/STATE.md" << 'STATE_EOF'
# Project State

## Current Position

Phase: None
Plan: None
Status: Not started
Last activity: N/A

## Accumulated Context

### Decisions

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: N/A
Stopped at: N/A
STATE_EOF
  CREATED="${CREATED}STATE.md "
fi

# Step 3d: Create ROADMAP.md if missing
if [ ! -f "$PLANNING_DIR/ROADMAP.md" ]; then
  cat > "$PLANNING_DIR/ROADMAP.md" << 'ROADMAP_EOF'
# Roadmap

## Overview

[Project roadmap -- run /lu to begin planning]

## Phases

No phases defined yet.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| -     | -              | -      | -         |
ROADMAP_EOF
  CREATED="${CREATED}ROADMAP.md "
fi

# Step 3e: Initialize state machine (if bridge exists)
STATE_JSON="$PLANNING_DIR/state.json"
STATE_MACHINE_BRIDGE="packages/luca-state/src/bridge.ts"

if [ -f "$STATE_MACHINE_BRIDGE" ]; then
  if [ -f "$STATE_JSON" ]; then
    # State exists -- check age to decide resume vs reinit
    # macOS stat -f "%m", Linux stat -c "%Y"
    STATE_MTIME=$(stat -f "%m" "$STATE_JSON" 2>/dev/null || stat -c "%Y" "$STATE_JSON" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    STATE_AGE=$((NOW - STATE_MTIME))

    if [ "$STATE_AGE" -lt 86400 ]; then
      # Fresh enough -- resume (regenerate snapshot)
      bun run "$STATE_MACHINE_BRIDGE" snapshot 2>/dev/null || true
    else
      # Stale -- reinitialize
      bun run "$STATE_MACHINE_BRIDGE" ensure-init --force 2>/dev/null || true
      CREATED="${CREATED}state.json "
    fi
  else
    # No state.json -- initialize fresh
    bun run "$STATE_MACHINE_BRIDGE" ensure-init 2>/dev/null || true
    CREATED="${CREATED}state.json "
  fi
fi

# Step 4: Detect runtime
if command -v bun &>/dev/null; then
  RUNTIME="bun"
else
  RUNTIME="node"
fi

# Step 5: Create or update config.json
if [ ! -f "$PLANNING_DIR/config.json" ]; then
  # Create full config with runtime field
  HOOK_PLANNING_DIR="$PLANNING_DIR" HOOK_RUNTIME="$RUNTIME" bun -e "
    const planningDir = process.env.HOOK_PLANNING_DIR;
    const runtime = process.env.HOOK_RUNTIME;
    const config = {
      mode: 'interactive',
      depth: 'standard',
      model_profile: 'balanced',
      runtime: runtime,
      cognitive: {
        enabled: true,
        memory_recall: true,
        working_memory: true,
        intuition_check: true,
        routing: 'auto'
      },
      workflow: {
        research: true,
        plan_check: true,
        verifier: true,
        code_review: true,
        uat_required: true,
        always_verify: true,
        capture_learnings: true
      },
      planning: {
        commit_docs: true,
        search_gitignored: false
      },
      parallelization: {
        enabled: true,
        plan_level: true,
        task_level: false,
        skip_checkpoints: true,
        max_concurrent_agents: 3,
        min_plans_for_parallel: 2
      },
      gates: {
        confirm_project: true,
        confirm_phases: true,
        confirm_roadmap: true,
        confirm_breakdown: true,
        confirm_plan: true,
        execute_next_plan: true,
        issues_review: true,
        confirm_transition: true
      },
      safety: {
        always_confirm_destructive: true,
        always_confirm_external_services: true
      },
      hooks: {
        enabled: true,
        formatter: runtime === 'bun' ? 'bunx --bun prettier --write' : 'npx prettier --write',
        formatterExtensions: ['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.md', '.yaml', '.yml', '.html'],
        typeChecker: runtime === 'bun' ? 'bunx --bun tsc --noEmit' : 'npx tsc --noEmit',
        typeCheckExtensions: ['.ts', '.tsx'],
        preCommitChecks: runtime === 'bun'
          ? ['bun test', 'bunx --bun tsc --noEmit']
          : ['npm test', 'npx tsc --noEmit'],
        commitPatterns: ['git commit', 'git merge', 'bun run commit'],
        contextThresholds: { warn: 100000, alert: 200000, critical: 300000 }
      },
      harness: {
        enabled: true,
        maxFixIterations: 3,
        failFast: false,
        checks: [
          { name: 'test', command: runtime === 'bun' ? 'bun test' : 'npm test', enabled: true, timeout: 120, parser: 'bun-test' },
          { name: 'typecheck', command: runtime === 'bun' ? 'bunx --bun tsc --noEmit' : 'npx tsc --noEmit', enabled: true, timeout: 60, parser: 'tsc' },
          { name: 'lint', command: runtime === 'bun' ? 'bunx --bun eslint . --format json' : 'npx eslint . --format json', enabled: false, timeout: 60, parser: 'eslint' },
          { name: 'build', command: runtime === 'bun' ? 'bun run check:drift' : 'npm run check:drift', enabled: false, timeout: 120, parser: 'generic' }
        ]
      },
      complexity: {
        defaultLevel: 'auto',
        matrix: {
          TRIVIAL: { cognitivePreflight: 'lite', research: 'skip', discussion: 'skip', planVerificationIterations: 0, harnessFixIterations: 1, verificationMode: 'quick', codeReviewAgents: [], uat: 'skip', learningCapture: 'skip' },
          SIMPLE: { cognitivePreflight: 'lite', research: 'skip', discussion: 'skip', planVerificationIterations: 0, harnessFixIterations: 2, verificationMode: 'quick', codeReviewAgents: [], uat: 'skip', learningCapture: 'brief' },
          MODERATE: { cognitivePreflight: 'full', research: 'optional', discussion: 'optional', planVerificationIterations: 1, harnessFixIterations: 3, verificationMode: 'standard', codeReviewAgents: ['dx-advocate', 'code-simplifier'], uat: 'optional', learningCapture: 'standard' },
          COMPLEX: { cognitivePreflight: 'full', research: 'required', discussion: 'run', planVerificationIterations: 2, harnessFixIterations: 3, verificationMode: 'full', codeReviewAgents: ['dx-advocate', 'code-simplifier', 'code-architect', 'tailwind-auditor'], uat: 'required', learningCapture: 'full' },
          CRITICAL: { cognitivePreflight: 'full', research: 'required', discussion: 'required', planVerificationIterations: 3, harnessFixIterations: 5, verificationMode: 'full+human', codeReviewAgents: ['dx-advocate', 'code-simplifier', 'code-architect', 'tailwind-auditor', 'security-auditor'], uat: 'required+thorough', learningCapture: 'full+debrief' }
        }
      },
      dogfood: {
        enabled: false,
        source: 'src/',
        outputs: ['.claude/', '.cursor/'],
        build_command: runtime === 'bun' ? 'bun run build:all' : 'npm run build:all',
        lock_file: '.claude/.session-lock',
        manifest_file: '.claude/.build-manifest.json'
      }
    };
    await Bun.write(
      planningDir + '/config.json',
      JSON.stringify(config, null, 2) + '\n'
    );
  "
  CREATED="${CREATED}config.json "
else
  # config.json exists -- update runtime field only
  HOOK_CONFIG="$PLANNING_DIR/config.json" HOOK_RUNTIME="$RUNTIME" bun -e "
    const cfg = JSON.parse(await Bun.file(process.env.HOOK_CONFIG).text());
    cfg.runtime = process.env.HOOK_RUNTIME;
    await Bun.write(process.env.HOOK_CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  "
fi

# Step 6: Create BRAIN.md if missing (with auto-detection)
if [ ! -f "$PLANNING_DIR/BRAIN.md" ]; then
  HOOK_PLANNING_DIR="$PLANNING_DIR" HOOK_PROJECT_DIR="$PROJECT_DIR" bun -e "
    const path = require('path');
    const planningDir = process.env.HOOK_PLANNING_DIR;
    const projectDir = process.env.HOOK_PROJECT_DIR;

    // Defaults
    let name = 'Project';
    let description = '[What this project does -- customize this]';
    let language = '[Primary language]';
    let framework = '[Framework]';
    let testing = '[Test framework]';
    let buildTool = '[Build tool]';
    let styling = '[Styling approach]';

    try {
      const pkgFile = Bun.file(path.join(projectDir, 'package.json'));
      if (await pkgFile.exists()) {
        const pkg = JSON.parse(await pkgFile.text());
        if (pkg.name) name = pkg.name;
        if (pkg.description) description = pkg.description;

        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Language detection
        const hasTsConfig = await Bun.file(path.join(projectDir, 'tsconfig.json')).exists();
        if (deps.typescript || hasTsConfig) language = 'TypeScript';
        else language = 'JavaScript';

        // Framework detection
        if (deps.next) framework = 'Next.js';
        else if (deps.react) framework = 'React';
        else if (deps.vue) framework = 'Vue';
        else if (deps['@angular/core']) framework = 'Angular';
        else if (deps.svelte) framework = 'Svelte';
        else if (deps.hono) framework = 'Hono';
        else if (deps.express) framework = 'Express';
        else if (deps.fastify) framework = 'Fastify';
        else framework = 'Node.js';

        // Test framework detection
        if (deps.vitest) testing = 'Vitest';
        else if (deps.jest) testing = 'Jest';
        else if (deps['@testing-library/react'] || deps['@testing-library/vue']) testing = 'Testing Library';
        else if (deps['bun-types']) testing = 'bun:test';
        else testing = 'bun:test';

        // Build tool detection
        if (deps.vite) buildTool = 'Vite';
        else if (deps.webpack) buildTool = 'Webpack';
        else if (deps.esbuild) buildTool = 'esbuild';
        else if (deps.turbo || deps.turbopack) buildTool = 'Turbopack';
        else {
          const hasBunfig = await Bun.file(path.join(projectDir, 'bunfig.toml')).exists();
          buildTool = hasBunfig ? 'Bun' : '[Build tool]';
        }

        // Styling detection
        if (deps.tailwindcss) styling = 'Tailwind CSS';
        else if (deps['styled-components']) styling = 'styled-components';
        else if (deps['@emotion/react'] || deps['@emotion/styled']) styling = 'Emotion';
        else if (deps.sass || deps['node-sass']) styling = 'Sass/SCSS';
        else styling = '[Styling approach]';
      }
    } catch {
      // No package.json or parse error -- use defaults
    }

    const content = '# Luca Brain\n' +
      '\n' +
      '> Project identity and conventions. Loaded at session start.\n' +
      '\n' +
      '## Project Identity\n' +
      '\n' +
      '- **Name:** ' + name + '\n' +
      '- **Domain:** ' + description + '\n' +
      '- **Purpose:** [Why it exists -- customize this]\n' +
      '\n' +
      '## Stack\n' +
      '\n' +
      '- **Language:** ' + language + '\n' +
      '- **Framework:** ' + framework + '\n' +
      '- **Build:** ' + buildTool + '\n' +
      '- **Testing:** ' + testing + '\n' +
      '- **Styling:** ' + styling + '\n' +
      '\n' +
      '## Architecture Patterns\n' +
      '\n' +
      '[Describe key architectural decisions -- customize this]\n' +
      '\n' +
      '## Code Conventions\n' +
      '\n' +
      '[Add your code style preferences -- customize this]\n' +
      '\n' +
      '## Development Preferences\n' +
      '\n' +
      '- **Command Prefix:** /lu\n' +
      '- **Workflow:** Luca spec-driven development\n' +
      '\n' +
      '---\n' +
      '\n' +
      '*Luca Brain initialized (auto-detected from project files)*\n';

    await Bun.write(path.join(planningDir, 'BRAIN.md'), content);
  "
  CREATED="${CREATED}BRAIN.md "
fi

# Step 7: Write environment variables for the session (if supported)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export LUCA_RUNTIME=$RUNTIME" >> "$CLAUDE_ENV_FILE"
  echo "export LUCA_PLANNING_DIR=$PLANNING_DIR" >> "$CLAUDE_ENV_FILE"
fi

# Step 8: Create session lock file (with build manifest snapshot)
HOOK_PROJECT_DIR_LOCK="$PROJECT_DIR" bun -e "
  const path = require('path');
  const projectDir = process.env.HOOK_PROJECT_DIR_LOCK;
  const lockPath = path.join(projectDir, '.claude', '.session-lock');
  const manifestPath = path.join(projectDir, '.claude', '.build-manifest.json');

  let buildManifestAt = null;
  try {
    const manifestFile = Bun.file(manifestPath);
    if (await manifestFile.exists()) {
      const manifest = JSON.parse(await manifestFile.text());
      buildManifestAt = manifest.built_at ?? null;
    }
  } catch {
    // No manifest or parse error — leave as null
  }

  const payload = {
    created_at: new Date().toISOString(),
    pid: process.pid,
    build_manifest_at: buildManifestAt
  };
  await Bun.write(lockPath, JSON.stringify(payload, null, 2) + '\n');
"

# Step 9: Output summary if anything was created
if [ -n "$CREATED" ]; then
  HOOK_CREATED="$CREATED" bun -e "
    const created = process.env.HOOK_CREATED.trim();
    const files = created.split(' ').filter(Boolean);
    const msg = '[Luca] Initialized .planning/ directory. Created: ' + files.join(', ');
    const isClaude = !!process.env.CLAUDE_PROJECT_DIR;
    const output = isClaude
      ? { systemMessage: msg }
      : { followup_message: msg };
    process.stdout.write(JSON.stringify(output));
  "
fi

exit 0
