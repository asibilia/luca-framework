---
id: 20-03
title: Command Compilation Pipeline
phase: 20-skills-agents-packaging
wave: 2
delivers: PACK-03 (partial)
depends_on: "20-01, 20-02"
tasks: 5
---

# Plan 20-03: Command Compilation Pipeline

## Objective

Implement the command compilation pipeline in `scripts/build-plugin.ts` to generate `commands/<name>.md` files for all user-facing skills. Commands are the slash-command interface that Claude Code exposes to users. Exactly 38 skills become commands (all except `workflow-start` and the 5 `rule-*` reference skills). This plan also updates the plugin manifest to list all commands.

## Context

- **No `commands/` directory** exists in the current plugin output (`dist/plugin/`). The manifest `commands` array is currently empty.
- **Plugin manifest schema** in `src/compilers/plugin.types.ts` already has a `commands: z.array(z.string()).default([])` field — no schema changes needed.
- **Command format**: Based on Claude Code plugin conventions, commands are `.md` files in the `commands/` directory with YAML frontmatter containing a `description` field. The file name is the command name (e.g., `commands/git-commit.md`).
- **Relationship to skills**: Each command maps 1:1 to a skill. The command `.md` file is a lightweight wrapper that tells Claude Code to load the corresponding skill.
- **38 commands** (from 20-RESEARCH.md Section 7.1): All skills except `workflow-start` (redirect) and 5 `rule-*` skills (auto-invocation only).
- **Dependencies**: Plan 20-01 optimizes descriptions (commands use the same descriptions). Plan 20-02 adds 5 new rule-as-skills (which are excluded from commands). Both should complete first.
- **Build script**: `scripts/build-plugin.ts` currently handles agents, skills, hooks, and the manifest. The command section needs to be added.
- **Skill identification**: Rather than adding a `command` field to all skill configs, maintain a command exclusion list in the build script. This is simpler since most skills ARE commands — only a few are excluded.
- **`build-utils.ts`**: Provides `cleanDirectory()`, `cleanSkillsDirectory()`, `ensureDir()` for directory management.

## Files

### Modify

- `scripts/build-plugin.ts` — Add command compilation section, update manifest generation
- `scripts/build-all.ts` — Update plugin summary display and total file count to include commands
- `scripts/build-utils.ts` — Add `cleanCommandsDirectory()` if needed (may reuse `cleanDirectory()`)

## Tasks

### Task 1: Define command exclusion list and command generation function

**Goal:** Add the logic to `scripts/build-plugin.ts` that determines which skills become commands and generates the command markdown content.

**File:** `scripts/build-plugin.ts` (modify)

**Instructions:**

1. Add a constant for skills that should NOT become commands, placed after the imports and before the `generatePluginHooksConfig` function:

```typescript
/**
 * Skills excluded from command generation.
 *
 * These skills are not exposed as slash commands because they are either:
 * - Internal orchestrator redirects (workflow-start)
 * - Reference/guidance skills for auto-invocation only (rule-* skills)
 */
const COMMAND_EXCLUDED_SKILLS: ReadonlySet<string> = new Set([
  "workflow-start",
  "rule-lu-workflow",
  "rule-complexity-gating",
  "rule-harness-verification",
  "rule-hook-skill-boundary",
  "rule-file-naming",
]);
```

2. Add a function to generate command markdown content. Place it after the `generatePluginHooksConfig` function:

```typescript
/**
 * Generate a command markdown file for a skill.
 *
 * Commands are lightweight markdown files that register a skill as a
 * user-invokable slash command. The file contains YAML frontmatter with
 * the command description, which Claude Code uses for command listing
 * and discovery.
 *
 * @param skillName - The skill name (used as the command name)
 * @param description - The skill description (used as command description)
 * @returns Markdown string for the command file
 */
function generateCommandMarkdown(
  skillName: string,
  description: string,
): string {
  return `---\ndescription: ${description}\n---\n`;
}
```

Note: The command file format is minimal — just YAML frontmatter with description. Claude Code's plugin system links commands to skills by name matching. The command file does NOT need to contain the full skill content.

**Verification:**

- `COMMAND_EXCLUDED_SKILLS` set contains 6 entries
- `generateCommandMarkdown()` returns valid YAML frontmatter string
- No compile errors

### Task 2: Add commands directory to build output structure

**Goal:** Create the `commands/` directory in the plugin output and add cleaning logic.

**File:** `scripts/build-plugin.ts` (modify)

**Instructions:**

1. Add the commands directory definition alongside the existing directory definitions (around line 185):

```typescript
const commandsDir = path.join(pluginDir, "commands");
```

2. Add `commandsDir` to the `ensureDir()` Promise.all call (around line 189):

```typescript
await Promise.all([
  ensureDir(manifestDir),
  ensureDir(agentsDir),
  ensureDir(skillsDir),
  ensureDir(commandsDir), // NEW
  ensureDir(hooksDir),
  ensureDir(scriptsDir),
]);
```

3. Add command directory cleaning to the stale file cleanup Promise.all (around line 199). Commands are simple `.md` files, so use `cleanDirectory()`:

```typescript
const [
  removedAgents,
  removedSkills,
  removedCommands,
  removedHooks,
  removedScripts,
] = await Promise.all([
  cleanDirectory(agentsDir, [".md"]),
  cleanSkillsDirectory(skillsDir),
  cleanDirectory(commandsDir, [".md"]), // NEW
  cleanDirectory(hooksDir, [".json"]),
  cleanDirectory(scriptsDir, [".sh"]),
]);
```

4. Update the `totalRemoved` calculation to include `removedCommands`:

```typescript
const totalRemoved =
  removedAgents.length +
  removedSkills.length +
  removedCommands.length + // NEW
  removedHooks.length +
  removedScripts.length;
```

5. Add command tracking variables alongside the existing counters (around line 218):

```typescript
let commandCount = 0;
const commandNames: string[] = [];
```

**Verification:**

- `commandsDir` variable defined
- `ensureDir(commandsDir)` in the setup
- `cleanDirectory(commandsDir, [".md"])` in the cleanup
- `commandCount` and `commandNames` initialized
- No compile errors

### Task 3: Add command compilation loop

**Goal:** Generate command `.md` files for all command-eligible skills.

**File:** `scripts/build-plugin.ts` (modify)

**Instructions:**

1. Add a command compilation section AFTER the skills compilation section and BEFORE the hook scripts section. Place it after the "Luca-specific skill" block (around line 310) with a clear section comment:

```typescript
// --- Commands ---

// Generate commands from general skills (excluding non-command skills)
for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
  if (COMMAND_EXCLUDED_SKILLS.has(skillName)) {
    continue;
  }

  try {
    const instance = new (SkillClass as new () => BaseSkill)();
    const commandContent = generateCommandMarkdown(
      skillName,
      instance.description,
    );

    await Bun.write(path.join(commandsDir, `${skillName}.md`), commandContent);

    console.log(`  Generated commands/${skillName}.md`);
    commandNames.push(skillName);
    commandCount++;
  } catch (error) {
    console.error(`  Failed to generate commands/${skillName}.md:`, error);
    failures.push(`command/${skillName}`);
  }
}

// Generate command for luca-specific lu skill
try {
  const luSkill = new LuSkill();
  const luCommandContent = generateCommandMarkdown("lu", luSkill.description);

  await Bun.write(path.join(commandsDir, "lu.md"), luCommandContent);

  console.log("  Generated commands/lu.md");
  commandNames.push("lu");
  commandCount++;
} catch (error) {
  console.error("  Failed to generate commands/lu.md:", error);
  failures.push("command/lu");
}
```

2. This generates a command for every skill in the registry that is NOT in the exclusion set, plus the `lu` skill (which is handled separately since it is not in the registry).

**Verification:**

- Command loop iterates over `skillRegistry` entries
- Excluded skills are skipped
- `lu` skill command generated separately
- Each command file is written to `commandsDir`
- Failures are tracked
- No compile errors

### Task 4: Update manifest generation and build summary

**Goal:** Include commands in the plugin manifest, build summary output, and the `build-all.ts` aggregated summary.

**Files:** `scripts/build-plugin.ts` (modify), `scripts/build-all.ts` (modify)

**Instructions:**

1. Update the `BuildPluginResult` interface to include commands (around line 56):

```typescript
export interface BuildPluginResult {
  agents: number;
  skills: number;
  commands: number; // NEW
  hooks: number;
  failures: string[];
}
```

2. Update the manifest generation to include `commandNames` (around line 361). Add `commands: commandNames` to the `generatePluginManifest()` call:

```typescript
const manifest = generatePluginManifest({
  name: "luca",
  version,
  description:
    "Luca - Agentic development framework with cognitive memory and spec-driven workflow",
  author: {
    name: "Alec Sibilia",
  },
  keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
  commands: commandNames, // NEW
  agents: agentNames,
  skills: skillNames,
  hooks: hookNames,
});
```

3. Update the total files count (around line 382):

```typescript
const totalFiles = agentCount + skillCount + commandCount + hookCount + 2; // +2 for hooks.json and plugin.json
```

4. Update the build summary output to include commands (around line 384):

```typescript
console.log("\n=== Plugin Build Summary ===");
console.log(`Agents:   ${agentCount}`);
console.log(`Skills:   ${skillCount}`);
console.log(`Commands: ${commandCount}`); // NEW
console.log(`Hooks:    ${hookCount}`);
console.log(`Total:    ${totalFiles} files`);
console.log(`Output:   dist/plugin/`);
```

5. Update the return statement to include `commands` (around line 398):

```typescript
return {
  agents: agentCount,
  skills: skillCount,
  commands: commandCount,
  hooks: hookCount,
  failures,
};
```

6. Update `scripts/build-all.ts` to display command counts in the aggregated summary. There are two places to update:

   a. The plugin summary line (around line 364):

   ```typescript
   console.log(
     `✓ Plugin: ${pluginSummary.agents} agents, ${pluginSummary.skills} skills, ${pluginSummary.commands} commands, ${pluginSummary.hooks} hooks`,
   );
   ```

   b. The final "Build All Summary" section (around line 383):

   ```typescript
   console.log(
     `Plugin: ${pluginSummary.agents} agents, ${pluginSummary.skills} skills, ${pluginSummary.commands} commands, ${pluginSummary.hooks} hooks`,
   );
   ```

   c. The total files count calculation (around line 385) — add `pluginSummary.commands` to the sum:

   ```typescript
   console.log(
     `Total:  ${(agentCount + skillCount + ruleCount) * 2 + hookCount + cursorHookCount + pluginSummary.agents + pluginSummary.skills + pluginSummary.commands + pluginSummary.hooks + 2} files`,
   );
   ```

**Verification:**

- `BuildPluginResult` includes `commands: number`
- Manifest generation includes `commands: commandNames`
- Build summary displays command count in `build-plugin.ts`
- `build-all.ts` displays command count in both plugin summary and final summary
- `build-all.ts` total file count includes commands
- Return value includes command count
- No compile errors

### Task 5: Build and verify command compilation

**Goal:** Run the full plugin build and verify commands are generated correctly.

**Instructions:**

1. Run the plugin build:

   ```bash
   bun run build:plugin
   ```

2. Verify the `commands/` directory exists and has the correct number of files:

   ```bash
   ls dist/plugin/commands/ | wc -l
   # Expected: 38 (all skills minus workflow-start minus 5 rule-* skills, plus lu)
   ```

3. Verify specific command files exist:

   ```bash
   ls dist/plugin/commands/lu.md
   ls dist/plugin/commands/git-commit.md
   ls dist/plugin/commands/lu-execute-phase.md
   ls dist/plugin/commands/lu-plan-phase.md
   ```

4. Verify excluded skills do NOT have command files:

   ```bash
   # These should NOT exist:
   ls dist/plugin/commands/workflow-start.md 2>&1    # Should fail
   ls dist/plugin/commands/rule-lu-workflow.md 2>&1   # Should fail
   ls dist/plugin/commands/rule-complexity-gating.md 2>&1  # Should fail
   ```

5. Verify command file format:

   ```bash
   cat dist/plugin/commands/git-commit.md
   # Expected output:
   # ---
   # description: Stage and commit changes using the project's conventional commit CLI with ticket extraction.
   # ---
   ```

6. Verify the manifest includes commands:

   ```bash
   cat dist/plugin/.claude-plugin/plugin.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Commands: {len(d[\"commands\"])}'); print(f'Skills: {len(d[\"skills\"])}'); print(f'Agents: {len(d[\"agents\"])}')"
   # Expected: Commands: 38, Skills: 44 (or 43 depending on lu consolidation), Agents: 26
   ```

7. Verify the build summary shows all counts:

   ```bash
   # Build output should show:
   # Agents:   26
   # Skills:   44
   # Commands: 38
   # Hooks:    6
   ```

8. Run the full test suite:

   ```bash
   bun test
   ```

9. If any existing tests reference `BuildPluginResult`, update them to include the new `commands` field.

**Verification:**

- 38 command files in `dist/plugin/commands/`
- Excluded skills have no command files
- Each command file has correct YAML frontmatter format
- Manifest `commands` array has 38 entries
- Build summary shows correct counts
- All tests pass

## Verification

- [ ] `COMMAND_EXCLUDED_SKILLS` constant defined with 6 entries
- [ ] `generateCommandMarkdown()` function produces valid YAML frontmatter
- [ ] `commands/` directory created, cleaned, and populated during build
- [ ] Exactly 38 command files generated (verified by count)
- [ ] `workflow-start` and 5 `rule-*` skills excluded from commands
- [ ] `lu` skill included as a command (generated separately from registry)
- [ ] Plugin manifest `commands` array has 38 entries
- [ ] `BuildPluginResult` includes `commands` count
- [ ] Build summary displays command count
- [ ] `bun run build:plugin` completes with 0 failures
- [ ] All tests pass: `bun test`
