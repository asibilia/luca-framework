# Plan 10-02: Update Build Scripts, Clean Stale Files, and Add Tests

## Frontmatter
- **ID**: 10-02
- **Title**: Update Build Scripts, Clean Stale Files, and Add Tests
- **Phase**: 10 (Build Pipeline)
- **Wave**: 2
- **Depends on**: 10-01 (registries must exist before build scripts can import them)
- **Delivers**: BUILD-03, BUILD-04, BUILD-05, BUILD-06

## Objective

Update all three build scripts (`build-cursor.ts`, `build-claude.ts`, `build-all.ts`) to iterate `agentRegistry` and `ruleRegistry` instead of hardcoding entities. Add stale file cleanup so output directories contain only build-generated files. Handle special cases (symlink, taskmaster subdirectory). Add tests to verify registry completeness and build output correctness.

## Context

- `scripts/build-cursor.ts` -- Currently hardcodes 2 agents + 1 skill + 1 rule. Iterates `skillRegistry` for general skills but ignores 23 general agents and 20 general rules.
- `scripts/build-claude.ts` -- Same pattern as build-cursor. Only generates 2 agents, 36 skills (1 luca + 35 general), 1 rule.
- `scripts/build-all.ts` -- Unified version, same hardcoding pattern. Both Cursor and Claude output.
- `src/agents/index.ts` -- Created by Plan 10-01. Exports `agentRegistry` with 23 entries.
- `src/rules/index.ts` -- Created by Plan 10-01. Exports `ruleRegistry` with 20 entries.
- `src/skills/index.ts` -- Existing `skillRegistry` with 35 entries. Already iterated by build scripts.
- `.cursor/agents/` -- Contains 25 files (23 hand-placed + 2 build-generated). After this plan: 25 build-generated.
- `.cursor/rules/` -- Contains 17 files + 1 symlink + 1 subdirectory (16 hand-placed + 1 build-generated). After this plan: 21 build-generated (20 general + 1 luca).
- `.claude/agents/` -- Contains only 2 files. After this plan: 25 build-generated.
- `.claude/rules/` -- Contains only 1 file. After this plan: 21 build-generated.
- `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc` -- Symlink to `../../CLAUDE.md`. Must be replaced with compiled output from `src/rules/general/use-bun-instead-of-node-vite-npm-pnpm.rule.ts`.
- `.cursor/rules/taskmaster/` -- Subdirectory containing `dev_workflow.mdc` and `taskmaster.mdc`. Must be removed; all rules flatten to top-level.
- `__tests__/` -- Existing test directory with infrastructure test and base class tests. No registry or build tests.
- `.planning/phases/10-build-pipeline/RESEARCH.md` -- Full analysis of stale files, special cases, and build output structure.

### Build Output Structure

| Target | Agents | Skills | Rules |
|--------|--------|--------|-------|
| `.cursor/` | `agents/{name}.md` | `skills/{name}/SKILL.md` | `rules/{name}.mdc` |
| `.claude/` | `agents/{name}.md` | `skills/{name}/SKILL.md` | `rules/{name}.md` |

### Expected Output Counts After Build

| Directory | General | Luca-specific | Total |
|-----------|---------|---------------|-------|
| `.cursor/agents/` or `.claude/agents/` | 23 | 2 | 25 |
| `.cursor/skills/` or `.claude/skills/` | 35 | 1 | 36 |
| `.cursor/rules/` or `.claude/rules/` | 20 | 1 | 21 |

## Tasks

### Task 1: Add stale file cleanup utility

**Goal**: Create a shared helper function that build scripts call before writing, to remove all existing files from output directories. This ensures no stale or orphaned files remain after a build.

**File**: Create `scripts/build-utils.ts`

**Details**:

Create a utility module with cleanup functions:

```ts
/**
 * Shared build utilities for stale file cleanup and directory management
 */
import { readdir, unlink, rm, lstat } from 'fs/promises';
import { mkdir } from 'fs/promises';
import path from 'path';

/**
 * Remove all files matching an extension from a directory.
 * Also removes symlinks and subdirectories (to handle special cases).
 * Does NOT remove the directory itself.
 */
export async function cleanDirectory(dir: string, extensions: string[]): Promise<string[]> {
  const removed: string[] = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    // Directory doesn't exist yet -- nothing to clean
    return removed;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = await lstat(fullPath);

    if (stat.isSymbolicLink()) {
      // Remove symlinks (e.g., use-bun-instead-of-node-vite-npm-pnpm.mdc -> ../../CLAUDE.md)
      await unlink(fullPath);
      removed.push(fullPath);
    } else if (stat.isDirectory()) {
      // Remove subdirectories (e.g., .cursor/rules/taskmaster/)
      await rm(fullPath, { recursive: true });
      removed.push(fullPath);
    } else if (extensions.some(ext => entry.endsWith(ext))) {
      await unlink(fullPath);
      removed.push(fullPath);
    }
  }

  return removed;
}

/**
 * Clean all skill subdirectories from a skills output directory.
 * Skills live in subdirectories (e.g., .cursor/skills/code-lint/SKILL.md).
 */
export async function cleanSkillsDirectory(dir: string): Promise<string[]> {
  const removed: string[] = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return removed;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = await lstat(fullPath);
    if (stat.isDirectory()) {
      await rm(fullPath, { recursive: true });
      removed.push(fullPath);
    }
  }

  return removed;
}

/**
 * Ensure a directory exists, creating it if needed.
 */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
```

**Key decisions**:
- `cleanDirectory` handles symlinks, subdirectories, and files -- covering all special cases found in `.cursor/rules/`.
- `cleanSkillsDirectory` is separate because skills use subdirectories (`skills/{name}/SKILL.md`) rather than flat files.
- The cleanup runs BEFORE any write operations, so the build is always fresh.
- Returns removed paths for logging.

**Verification**:
- File compiles without TypeScript errors
- Functions handle nonexistent directories gracefully (no throw)

### Task 2: Update `scripts/build-cursor.ts` to use registries and cleanup

**Goal**: Replace hardcoded agent/rule handling with registry iteration. Add stale file cleanup before writing. Generate all 23 general agents and all 20 general rules alongside the existing luca-specific entities and skills.

**File**: Modify `scripts/build-cursor.ts`

**Details**:

Replace the entire file content. The new structure:

1. **Import registries**: `agentRegistry` from `src/agents/index`, `ruleRegistry` from `src/rules/index`, `skillRegistry` from `src/skills/index`.
2. **Import cleanup utils**: `cleanDirectory`, `cleanSkillsDirectory`, `ensureDir` from `./build-utils`.
3. **Import luca-specific entities**: Keep existing imports for `LuExecutorAgent`, `LuPlannerAgent`, `LuSkill`, `LuWorkflowRule`.
4. **Import types**: `BaseAgent` from agent types, `BaseSkill` from skill types, `BaseRule` from rule types.
5. **Clean output directories** before writing:
   - `cleanDirectory('.cursor/agents', ['.md'])`
   - `cleanSkillsDirectory('.cursor/skills')`
   - `cleanDirectory('.cursor/rules', ['.mdc'])` -- this removes the symlink and taskmaster subdirectory
6. **Iterate agentRegistry** to compile and write all 23 general agents.
7. **Compile luca-specific agents** (`LuExecutorAgent`, `LuPlannerAgent`) -- hardcoded, same as before.
8. **Iterate skillRegistry** to compile and write all 35 general skills (already works).
9. **Compile luca-specific skill** (`LuSkill`) -- hardcoded, same as before.
10. **Iterate ruleRegistry** to compile and write all 20 general rules.
11. **Compile luca-specific rule** (`LuWorkflowRule`) -- hardcoded, same as before.
12. **Log summary** with counts: `X agents, Y skills, Z rules`.

The agent iteration loop:
```ts
import { agentRegistry } from '../src/agents/index';
import type { BaseAgent } from '../src/agents/types/agent.types';

// Compile all general agents from the registry
console.log('Generating Cursor format for all general agents...');
let agentCount = 0;

for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
  try {
    const agentInstance = new (AgentClass as new () => BaseAgent)();
    const cursorAgentContent = compiler.compileAgent(agentInstance, 'CURSOR');

    const agentOutputPath = path.join(agentsDir, `${agentName}.md`);
    await Bun.write(agentOutputPath, cursorAgentContent);

    console.log(`  Generated .cursor/agents/${agentName}.md`);
    agentCount++;
  } catch (error) {
    console.error(`  Failed to generate .cursor/agents/${agentName}.md:`, error);
  }
}

console.log(`Generated Cursor format for ${agentCount} general agents`);
```

The rule iteration loop:
```ts
import { ruleRegistry } from '../src/rules/index';
import type { BaseRule } from '../src/rules/types/rule.types';

// Compile all general rules from the registry
console.log('Generating Cursor format for all general rules...');
let ruleCount = 0;

for (const [ruleName, RuleClass] of Object.entries(ruleRegistry)) {
  try {
    const ruleInstance = new (RuleClass as new () => BaseRule)();
    const cursorRuleContent = compiler.compileRule(ruleInstance, 'CURSOR');

    const ruleOutputPath = path.join(rulesDir, `${ruleName}.mdc`);
    await Bun.write(ruleOutputPath, cursorRuleContent);

    console.log(`  Generated .cursor/rules/${ruleName}.mdc`);
    ruleCount++;
  } catch (error) {
    console.error(`  Failed to generate .cursor/rules/${ruleName}.mdc:`, error);
  }
}

console.log(`Generated Cursor format for ${ruleCount} general rules`);
```

**Key decisions**:
- Cleanup runs before any writes, ensuring no stale files from previous builds or hand-placed files.
- Luca-specific entities remain hardcoded (they are always present and not part of the registries).
- Cursor rules use `.mdc` extension.
- All rules are flat in `.cursor/rules/` (no subdirectories).
- The symlink `use-bun-instead-of-node-vite-npm-pnpm.mdc` is replaced by a properly compiled file.
- The `taskmaster/` subdirectory is removed; its rules (`taskmaster-dev_workflow.mdc`, `taskmaster-taskmaster.mdc`) are generated as flat top-level files.

**Verification**:
- `bun run build:cursor` completes without errors
- `.cursor/agents/` contains exactly 25 `.md` files (23 general + 2 luca)
- `.cursor/skills/` contains exactly 36 subdirectories (35 general + 1 luca)
- `.cursor/rules/` contains exactly 21 `.mdc` files (20 general + 1 luca)
- No symlinks remain in `.cursor/rules/`
- No `taskmaster/` subdirectory remains in `.cursor/rules/`

### Task 3: Update `scripts/build-claude.ts` to use registries and cleanup

**Goal**: Same changes as Task 2, but for the Claude build script. Generate all 23 general agents and all 20 general rules alongside existing entities.

**File**: Modify `scripts/build-claude.ts`

**Details**:

Apply the same pattern as Task 2 with these Claude-specific differences:
- Output directories are `.claude/agents/`, `.claude/skills/`, `.claude/rules/`
- Rule files use `.md` extension (not `.mdc`)
- Claude format uses `compiler.compileAgent(instance, 'CLAUDE')`, etc.

The cleanup calls:
```ts
await cleanDirectory(agentsDir, ['.md']);
await cleanSkillsDirectory(claudeSkillsDir);
await cleanDirectory(claudeRulesDir, ['.md']);
```

The structure is identical to Task 2:
1. Import registries + cleanup utils + luca entities + types
2. Clean output directories
3. Iterate `agentRegistry` -- compile to Claude format, write to `.claude/agents/{name}.md`
4. Compile luca-specific agents
5. Iterate `skillRegistry` -- compile to Claude format
6. Compile luca-specific skill
7. Iterate `ruleRegistry` -- compile to Claude format, write to `.claude/rules/{name}.md`
8. Compile luca-specific rule
9. Log summary

**Verification**:
- `bun run build:claude` completes without errors
- `.claude/agents/` contains exactly 25 `.md` files (23 general + 2 luca)
- `.claude/skills/` contains exactly 36 subdirectories (35 general + 1 luca)
- `.claude/rules/` contains exactly 21 `.md` files (20 general + 1 luca)

### Task 4: Update `scripts/build-all.ts` to use registries and cleanup

**Goal**: Same changes as Tasks 2-3, but for the unified build script that generates both Cursor and Claude output.

**File**: Modify `scripts/build-all.ts`

**Details**:

Apply the same pattern, but build both formats in each loop iteration:

1. Import registries + cleanup utils + luca entities + types + both compilers
2. Clean ALL output directories (both `.cursor/` and `.claude/`)
3. Iterate `agentRegistry` -- compile to both formats, write to both output directories
4. Compile luca-specific agents to both formats
5. Iterate `skillRegistry` -- compile to both formats (already done, extend pattern)
6. Compile luca-specific skill to both formats
7. Iterate `ruleRegistry` -- compile to both formats
8. Compile luca-specific rule to both formats
9. Log summary with combined counts

The combined agent loop:
```ts
for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
  try {
    const agentInstance = new (AgentClass as new () => BaseAgent)();
    const cursorContent = cursorCompiler.compileAgent(agentInstance, 'CURSOR');
    const claudeContent = claudeCompiler.compileAgent(agentInstance, 'CLAUDE');

    await Bun.write(path.join(cursorAgentsDir, `${agentName}.md`), cursorContent);
    await Bun.write(path.join(claudeAgentsDir, `${agentName}.md`), claudeContent);

    console.log(`  Generated agents/${agentName}.md (Cursor + Claude)`);
    agentCount++;
  } catch (error) {
    console.error(`  Failed to generate agents/${agentName}.md:`, error);
  }
}
```

**Verification**:
- `bun run build:all` completes without errors
- Both `.cursor/` and `.claude/` contain the expected file counts (same as Tasks 2 and 3)
- Output from `build:all` matches output from running `build:cursor` + `build:claude` separately

### Task 5: Run builds and verify output matches source

**Goal**: Execute all three build commands and verify that every source entity has a corresponding output file, and no stale or orphaned files exist.

**File**: No file changes. Execution and manual verification.

**Details**:

Run these commands in order:

```sh
# Clean build
bun run build:all

# Verify agent counts
ls .cursor/agents/*.md | wc -l   # Should be 25
ls .claude/agents/*.md | wc -l   # Should be 25

# Verify skill counts
ls -d .cursor/skills/*/  | wc -l  # Should be 36
ls -d .claude/skills/*/  | wc -l  # Should be 36

# Verify rule counts
ls .cursor/rules/*.mdc | wc -l   # Should be 21
ls .claude/rules/*.md | wc -l    # Should be 21

# Verify no symlinks in .cursor/rules/
find .cursor/rules/ -type l       # Should be empty

# Verify no subdirectories in .cursor/rules/
find .cursor/rules/ -type d -mindepth 1  # Should be empty

# Verify individual builds match combined build
bun run build:cursor
bun run build:claude
# Compare file lists -- should match build:all output
```

Also verify specific special cases:
- `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc` is a regular file (not a symlink)
- `.cursor/rules/taskmaster-dev_workflow.mdc` exists as a flat file
- `.cursor/rules/taskmaster-taskmaster.mdc` exists as a flat file
- No `.cursor/rules/taskmaster/` directory exists

**Verification**:
- All counts match expected values
- No stale files, no symlinks, no unexpected subdirectories

### Task 6: Add registry completeness tests

**Goal**: Add tests that verify every source file in `src/agents/general/` and `src/rules/general/` has a corresponding registry entry, and every registry entry can be instantiated.

**File**: Create `__tests__/src/agents/agent-registry.test.ts` and `__tests__/src/rules/rule-registry.test.ts`

**Details**:

**`__tests__/src/agents/agent-registry.test.ts`**:

```ts
import { describe, test, expect } from 'bun:test';
import { readdirSync } from 'fs';
import path from 'path';
import { agentRegistry } from '../../../src/agents/index';
import type { BaseAgent } from '../../../src/agents/types/agent.types';

const GENERAL_AGENTS_DIR = path.join(import.meta.dir, '../../../src/agents/general');

describe('agentRegistry', () => {
  const agentFiles = readdirSync(GENERAL_AGENTS_DIR)
    .filter(f => f.endsWith('.agent.ts'))
    .map(f => f.replace('.agent.ts', ''));

  test('has an entry for every agent source file', () => {
    const registryKeys = Object.keys(agentRegistry);
    for (const agentName of agentFiles) {
      expect(registryKeys).toContain(agentName);
    }
  });

  test('has no extra entries beyond source files', () => {
    const registryKeys = Object.keys(agentRegistry);
    for (const key of registryKeys) {
      expect(agentFiles).toContain(key);
    }
  });

  test('has exactly 23 entries', () => {
    expect(Object.keys(agentRegistry).length).toBe(23);
  });

  test('every registry entry can be instantiated', () => {
    for (const [name, AgentClass] of Object.entries(agentRegistry)) {
      const instance = new (AgentClass as new () => BaseAgent)();
      expect(instance).toBeDefined();
      expect(instance.name).toBe(name);
    }
  });
});
```

**`__tests__/src/rules/rule-registry.test.ts`**:

```ts
import { describe, test, expect } from 'bun:test';
import { readdirSync } from 'fs';
import path from 'path';
import { ruleRegistry } from '../../../src/rules/index';
import type { BaseRule } from '../../../src/rules/types/rule.types';

const GENERAL_RULES_DIR = path.join(import.meta.dir, '../../../src/rules/general');

describe('ruleRegistry', () => {
  const ruleFiles = readdirSync(GENERAL_RULES_DIR)
    .filter(f => f.endsWith('.rule.ts'))
    .map(f => f.replace('.rule.ts', ''));

  test('has an entry for every rule source file', () => {
    const registryKeys = Object.keys(ruleRegistry);
    for (const ruleName of ruleFiles) {
      expect(registryKeys).toContain(ruleName);
    }
  });

  test('has no extra entries beyond source files', () => {
    const registryKeys = Object.keys(ruleRegistry);
    for (const key of registryKeys) {
      expect(ruleFiles).toContain(key);
    }
  });

  test('has exactly 20 entries', () => {
    expect(Object.keys(ruleRegistry).length).toBe(20);
  });

  test('every registry entry can be instantiated', () => {
    for (const [name, RuleClass] of Object.entries(ruleRegistry)) {
      const instance = new (RuleClass as new () => BaseRule)();
      expect(instance).toBeDefined();
    }
  });
});
```

**Verification**:
- `bun test __tests__/src/agents/agent-registry.test.ts` passes (4 tests)
- `bun test __tests__/src/rules/rule-registry.test.ts` passes (4 tests)
- `bun test` passes (all tests including existing ones)

### Task 7: Add build output tests

**Goal**: Add integration tests that run the build and verify output file counts and content correctness.

**File**: Create `__tests__/scripts/build-output.test.ts`

**Details**:

```ts
import { describe, test, expect, beforeAll } from 'bun:test';
import { readdirSync, existsSync, lstatSync } from 'fs';
import path from 'path';
import { agentRegistry } from '../../src/agents/index';
import { skillRegistry } from '../../src/skills/index';
import { ruleRegistry } from '../../src/rules/index';

const ROOT = path.join(import.meta.dir, '../..');
const CURSOR_DIR = path.join(ROOT, '.cursor');
const CLAUDE_DIR = path.join(ROOT, '.claude');

// Expected counts: general + luca-specific
const EXPECTED_AGENTS = Object.keys(agentRegistry).length + 2; // +2 for lu-executor, lu-planner
const EXPECTED_SKILLS = Object.keys(skillRegistry).length + 1; // +1 for lu
const EXPECTED_RULES = Object.keys(ruleRegistry).length + 1;   // +1 for lu-workflow

describe('build output - .cursor/', () => {
  test('agents directory has correct file count', () => {
    const files = readdirSync(path.join(CURSOR_DIR, 'agents')).filter(f => f.endsWith('.md'));
    expect(files.length).toBe(EXPECTED_AGENTS);
  });

  test('skills directory has correct subdirectory count', () => {
    const dirs = readdirSync(path.join(CURSOR_DIR, 'skills')).filter(f => {
      return lstatSync(path.join(CURSOR_DIR, 'skills', f)).isDirectory();
    });
    expect(dirs.length).toBe(EXPECTED_SKILLS);
  });

  test('rules directory has correct file count', () => {
    const files = readdirSync(path.join(CURSOR_DIR, 'rules')).filter(f => f.endsWith('.mdc'));
    expect(files.length).toBe(EXPECTED_RULES);
  });

  test('rules directory has no symlinks', () => {
    const entries = readdirSync(path.join(CURSOR_DIR, 'rules'));
    for (const entry of entries) {
      const stat = lstatSync(path.join(CURSOR_DIR, 'rules', entry));
      expect(stat.isSymbolicLink()).toBe(false);
    }
  });

  test('rules directory has no subdirectories', () => {
    const entries = readdirSync(path.join(CURSOR_DIR, 'rules'));
    for (const entry of entries) {
      const fullPath = path.join(CURSOR_DIR, 'rules', entry);
      const stat = lstatSync(fullPath);
      expect(stat.isDirectory()).toBe(false);
    }
  });
});

describe('build output - .claude/', () => {
  test('agents directory has correct file count', () => {
    const files = readdirSync(path.join(CLAUDE_DIR, 'agents')).filter(f => f.endsWith('.md'));
    expect(files.length).toBe(EXPECTED_AGENTS);
  });

  test('skills directory has correct subdirectory count', () => {
    const dirs = readdirSync(path.join(CLAUDE_DIR, 'skills')).filter(f => {
      return lstatSync(path.join(CLAUDE_DIR, 'skills', f)).isDirectory();
    });
    expect(dirs.length).toBe(EXPECTED_SKILLS);
  });

  test('rules directory has correct file count', () => {
    const files = readdirSync(path.join(CLAUDE_DIR, 'rules')).filter(f => f.endsWith('.md'));
    expect(files.length).toBe(EXPECTED_RULES);
  });
});

describe('build output - no stale files', () => {
  test('every .cursor/agents/ file maps to a registry entry or luca entity', () => {
    const files = readdirSync(path.join(CURSOR_DIR, 'agents'))
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
    const expected = [...Object.keys(agentRegistry), 'lu-executor', 'lu-planner'];
    expect(files.sort()).toEqual(expected.sort());
  });

  test('every .cursor/rules/ file maps to a registry entry or luca entity', () => {
    const files = readdirSync(path.join(CURSOR_DIR, 'rules'))
      .filter(f => f.endsWith('.mdc'))
      .map(f => f.replace('.mdc', ''));
    const expected = [...Object.keys(ruleRegistry), 'lu-workflow'];
    expect(files.sort()).toEqual(expected.sort());
  });

  test('every .claude/agents/ file maps to a registry entry or luca entity', () => {
    const files = readdirSync(path.join(CLAUDE_DIR, 'agents'))
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
    const expected = [...Object.keys(agentRegistry), 'lu-executor', 'lu-planner'];
    expect(files.sort()).toEqual(expected.sort());
  });

  test('every .claude/rules/ file maps to a registry entry or luca entity', () => {
    const files = readdirSync(path.join(CLAUDE_DIR, 'rules'))
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
    const expected = [...Object.keys(ruleRegistry), 'lu-workflow'];
    expect(files.sort()).toEqual(expected.sort());
  });
});
```

**Important**: These tests assume `bun run build:all` has been run before running the test suite. The tests verify the _output_ of a build, not the build process itself. Add a note at the top of the file:

```ts
/**
 * Build output verification tests.
 *
 * Prerequisites: Run `bun run build:all` before running these tests.
 * These tests verify that build output matches source registries
 * and that no stale files exist in output directories.
 */
```

**Verification**:
- Run `bun run build:all` then `bun test __tests__/scripts/build-output.test.ts` -- all tests pass
- `bun test` passes (all tests including existing ones)

## Exit Criteria

1. **BUILD-03**: Build scripts iterate `agentRegistry`, `skillRegistry`, and `ruleRegistry` -- no hardcoded entity lists (luca-specific entities are still hardcoded individually, which is correct by design)
2. **BUILD-04**: `bun run build:cursor` generates 25 agents, 36 skills, and 21 rules in `.cursor/`
3. **BUILD-05**: `bun run build:claude` generates 25 agents, 36 skills, and 21 rules in `.claude/`
4. **BUILD-06**: Build output matches source -- no stale files, no symlinks, no orphaned subdirectories in output
5. All three build scripts (`build:cursor`, `build:claude`, `build:all`) complete without errors
6. No symlinks remain in `.cursor/rules/`
7. No `taskmaster/` subdirectory remains in `.cursor/rules/`
8. `scripts/build-utils.ts` provides reusable cleanup functions
9. `__tests__/src/agents/agent-registry.test.ts` passes (4 tests)
10. `__tests__/src/rules/rule-registry.test.ts` passes (4 tests)
11. `__tests__/scripts/build-output.test.ts` passes (9 tests)
12. `bun test` passes (all existing + new tests)
