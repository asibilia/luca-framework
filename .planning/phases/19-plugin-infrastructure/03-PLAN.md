---
id: 19-03
title: Plugin Build Script
phase: 19-plugin-infrastructure
wave: 2
delivers: PLUG-02, PLUG-05
depends_on: 19-01, 19-02
tasks: 3
---

# Plan 19-03: Plugin Build Script

## Objective

Create `scripts/build-plugin.ts` that generates a complete Claude Code plugin package under `dist/plugin/`. The script uses the `PluginCompiler` to compile all agents and skills from registries, generates the plugin manifest (`.claude-plugin/plugin.json`), copies hook scripts, and produces the plugin hooks configuration. The output is a self-contained directory ready for `claude --plugin-dir` testing.

## Context

- **build-all.ts precedent:** `scripts/build-all.ts` — iterates registries, instantiates entities, calls compiler
- **Plugin directory structure:** `.claude-plugin/plugin.json` + `skills/` + `agents/` + `commands/` + `hooks/` + `scripts/`
- **PluginCompiler from 19-02:** Compiles agents and skills to Claude-format markdown
- **Plugin manifest from 19-01:** `generatePluginManifest()` creates valid plugin.json
- **Hook scripts:** Copied from `src/hooks/scripts/` (same as build-all.ts pattern)

## Files

### Create

- `scripts/build-plugin.ts` — Plugin build script

### Modify

- `package.json` — Add `build:plugin` script

## Tasks

### Task 1: Create scripts/build-plugin.ts

**Goal:** Build the complete plugin package.

**File:** `scripts/build-plugin.ts` (new)

The script should:

1. Import registries (agentRegistry, skillRegistry, hookRegistry) and Luca-specific entities
2. Import PluginCompiler from `src/compilers/plugin.compiler.ts`
3. Import generatePluginManifest from `src/compilers/plugin.types.ts`
4. Define output base directory: `dist/plugin/`
5. Create plugin directory structure:
   ```
   dist/plugin/
   ├── .claude-plugin/
   │   └── plugin.json
   ├── agents/
   │   ├── code-architect.md
   │   ├── lu-executor.md
   │   └── ... (all agents)
   ├── skills/
   │   ├── git-commit/
   │   │   └── SKILL.md
   │   ├── lu/
   │   │   └── SKILL.md
   │   └── ... (all skills)
   ├── hooks/
   │   └── hooks.json
   └── scripts/
       ├── post-edit-format.sh
       ├── pre-commit-gate.sh
       └── ... (all hook scripts)
   ```
6. Clean stale files before writing (use build-utils)
7. Generate plugin.json by reading version from root package.json
8. Compile all agents from agentRegistry + Luca-specific agents
9. Compile all skills from skillRegistry + Luca-specific skill
10. Copy hook scripts from `src/hooks/scripts/` to `dist/plugin/scripts/`
11. Generate `dist/plugin/hooks/hooks.json` using adapted hook config with `${CLAUDE_PLUGIN_ROOT}` paths
12. Print summary (agent count, skill count, hook count, total files)

**Hook path adaptation:** Hook scripts in the plugin need `${CLAUDE_PLUGIN_ROOT}/scripts/` prefix instead of `.claude/hooks/`. Generate the hooks.json with:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/post-edit-format.sh"
          }
        ]
      }
    ]
  }
}
```

### Task 2: Add build:plugin script to package.json

**Goal:** Wire the build script into the package.json scripts.

**File:** `package.json` (modify)

Add to `scripts`:

```json
{
  "build:plugin": "bun ./scripts/build-plugin.ts"
}
```

### Task 3: Add dist/ to .gitignore

**Goal:** Ensure plugin build output is not committed.

**File:** `.gitignore` (modify)

Add:

```
dist/
```

## Verification

- [ ] `bun run build:plugin` generates complete plugin package in `dist/plugin/`
- [ ] `dist/plugin/.claude-plugin/plugin.json` is valid and contains correct metadata
- [ ] All agents from registry appear in `dist/plugin/agents/`
- [ ] All skills from registry appear in `dist/plugin/skills/`
- [ ] Hook scripts copied to `dist/plugin/scripts/` and are executable
- [ ] `dist/plugin/hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}` paths
- [ ] `dist/` is in .gitignore
