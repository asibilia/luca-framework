---
id: "24-02"
title: "Extract generateAllOutputs() pipeline and migrate all consumers"
wave: 2
requirements: ["DEDUP-01", "DEDUP-03", "CLEAN-03"]
---

# Plan 24-02: Extract generateAllOutputs() Pipeline and Migrate All Consumers

## Objective

Extract the core compilation pipeline -- which is duplicated across `build-all.ts`, `check-drift.ts`, and `check-drift.test.ts` (~290 lines of triplicated logic) -- into a single `generateAllOutputs()` function in `build-shared.ts`. This function returns a `Map<string, string>` of relative paths to content, enabling all three consumers to share one compilation path. This inherently resolves DEDUP-03 (unused `tempDir` parameter removed) and CLEAN-03 (error handling behavior change: instead of per-entity try/catch with continuation in build-all.ts, the centralized function uses fail-fast — any compilation failure throws, and the caller decides how to handle it. This is a conscious simplification: the pipeline should either succeed completely or fail fast).

## Context

@scripts/build-shared.ts — receives `generateAllOutputs()` and absorbs all 16 compilation imports
@scripts/build-all.ts — simplified to: call `generateAllOutputs()`, iterate Map to write files + handle filesystem concerns
@scripts/check-drift.ts — simplified to: call `generateAllOutputs()`, compare Map to committed files
@scripts/check-drift.test.ts — simplified to: call `generateAllOutputs()` for freshness checks; keeps registries for orphan detection
@src/hooks/index.ts — unchanged (exports consumed by build-shared.ts)
@src/agents/index.ts — import moves from 3 consumers to build-shared.ts only
@src/skills/index.ts — import moves from 3 consumers to build-shared.ts only
@src/rules/index.ts — import moves from 3 consumers to build-shared.ts only
@src/compilers/cursor.compiler.ts — import moves from 3 consumers to build-shared.ts only
@src/compilers/claude.compiler.ts — import moves from 3 consumers to build-shared.ts only
@src/compilers/plugin.compiler.ts — import moves from 3 consumers to build-shared.ts only

## Tasks

### Task 1: Create `generateAllOutputs()` in build-shared.ts

**Goal:** Centralize all in-memory compilation logic into one function that returns a Map of relative paths to content strings.

**Files:** `scripts/build-shared.ts`

**Steps:**

1. Add the following imports to `scripts/build-shared.ts` (these currently exist in all 3 consumer files):

   ```typescript
   import { agentRegistry } from "../src/agents/index";
   import { ruleRegistry } from "../src/rules/index";
   import { skillRegistry } from "../src/skills/index";
   import { hookRegistry, generateCursorHooksConfig } from "../src/hooks/index";
   import type { BaseAgent } from "../src/agents/types/agent.types";
   import type { BaseSkill } from "../src/skills/types/skill.types";
   import type { BaseRule } from "../src/rules/types/rule.types";
   import { LuExecutorAgent } from "../src/agents/luca/lu-executor.agent";
   import { LuPlannerAgent } from "../src/agents/luca/lu-planner.agent";
   import { LuSkill } from "../src/skills/luca/lu.skill";
   import { LuWorkflowRule } from "../src/rules/lu-workflow.rule";
   import { CursorCompiler } from "../src/compilers/cursor.compiler";
   import { ClaudeCompiler } from "../src/compilers/claude.compiler";
   import { PluginCompiler } from "../src/compilers/plugin.compiler";
   import { generatePluginManifest } from "../src/compilers/plugin.types";
   ```

2. Re-export `agentRegistry`, `skillRegistry`, `ruleRegistry`, and `hookRegistry` from `build-shared.ts` so consumers that need them for orphan detection can import from one place:

   ```typescript
   export { agentRegistry, skillRegistry, ruleRegistry, hookRegistry };
   ```

3. Implement `generateAllOutputs()`:

   ```typescript
   /**
    * Generate all build outputs in memory.
    *
    * Instantiates all compilers, iterates all registries and Luca-specific
    * entities, and returns a Map<string, string> mapping relative file paths
    * to their content. This is the single source of truth for the compilation
    * pipeline, consumed by build-all.ts, check-drift.ts, and check-drift.test.ts.
    *
    * Throws on compilation failure (Option A from research). Callers that need
    * graceful degradation should wrap in try/catch.
    *
    * @returns Map of relative paths to file content strings
    */
   export async function generateAllOutputs(): Promise<Map<string, string>> {
     const cursorCompiler = new CursorCompiler();
     const claudeCompiler = new ClaudeCompiler();
     const pluginCompiler = new PluginCompiler();
     const generated = new Map<string, string>();

     // =========================================================================
     // Cursor + Claude outputs
     // =========================================================================

     // --- Agents (registry) ---
     for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
       const instance = new (AgentClass as new () => BaseAgent)();
       generated.set(
         `.claude/agents/${agentName}.md`,
         claudeCompiler.compileAgent(instance, "CLAUDE"),
       );
       generated.set(
         `.cursor/agents/${agentName}.md`,
         cursorCompiler.compileAgent(instance, "CURSOR"),
       );
     }

     // --- Agents (Luca-specific) ---
     const luExecutor = new LuExecutorAgent();
     generated.set(
       ".claude/agents/lu-executor.md",
       claudeCompiler.compileAgent(luExecutor, "CLAUDE"),
     );
     generated.set(
       ".cursor/agents/lu-executor.md",
       cursorCompiler.compileAgent(luExecutor, "CURSOR"),
     );

     const luPlanner = new LuPlannerAgent();
     generated.set(
       ".claude/agents/lu-planner.md",
       claudeCompiler.compileAgent(luPlanner, "CLAUDE"),
     );
     generated.set(
       ".cursor/agents/lu-planner.md",
       cursorCompiler.compileAgent(luPlanner, "CURSOR"),
     );

     // --- Skills (registry) ---
     for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
       const instance = new (SkillClass as new () => BaseSkill)();
       generated.set(
         `.claude/skills/${skillName}/SKILL.md`,
         claudeCompiler.compileSkill(instance, "CLAUDE"),
       );
       generated.set(
         `.cursor/skills/${skillName}/SKILL.md`,
         cursorCompiler.compileSkill(instance, "CURSOR"),
       );
     }

     // --- Skills (Luca-specific) ---
     const luSkill = new LuSkill();
     generated.set(
       ".claude/skills/lu/SKILL.md",
       claudeCompiler.compileSkill(luSkill, "CLAUDE"),
     );
     generated.set(
       ".cursor/skills/lu/SKILL.md",
       cursorCompiler.compileSkill(luSkill, "CURSOR"),
     );

     // --- Rules (registry) ---
     for (const [ruleName, RuleClass] of Object.entries(ruleRegistry)) {
       const instance = new (RuleClass as new () => BaseRule)();
       generated.set(
         `.claude/rules/${ruleName}.md`,
         claudeCompiler.compileRule(instance, "CLAUDE"),
       );
       generated.set(
         `.cursor/rules/${ruleName}.mdc`,
         cursorCompiler.compileRule(instance, "CURSOR"),
       );
     }

     // --- Rules (Luca-specific) ---
     const luWorkflowRule = new LuWorkflowRule();
     generated.set(
       ".claude/rules/lu-workflow.md",
       claudeCompiler.compileRule(luWorkflowRule, "CLAUDE"),
     );
     generated.set(
       ".cursor/rules/lu-workflow.mdc",
       cursorCompiler.compileRule(luWorkflowRule, "CURSOR"),
     );

     // --- Hook scripts ---
     const hookScriptsDir = path.join(process.cwd(), "src", "hooks", "scripts");
     for (const [_hookName, hookDef] of Object.entries(hookRegistry)) {
       const srcPath = path.join(hookScriptsDir, hookDef.script);
       const srcFile = Bun.file(srcPath);
       if (await srcFile.exists()) {
         const content = await srcFile.text();
         generated.set(`.claude/hooks/${hookDef.script}`, content);
         generated.set(`.cursor/hooks/${hookDef.script}`, content);
       }
     }

     // --- Settings/hooks configs ---
     const hooksConfig = generateClaudeHooksConfig(hookRegistry, {
       commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
     });
     generated.set(
       ".claude/settings.json__hooks",
       JSON.stringify(hooksConfig, null, 2),
     );

     const cursorHooksConfig = generateCursorHooksConfig(hookRegistry);
     generated.set(
       ".cursor/hooks.json",
       JSON.stringify(cursorHooksConfig, null, 2) + "\n",
     );

     // =========================================================================
     // Plugin outputs (dist/plugin/)
     // =========================================================================

     // --- Plugin agents (registry) ---
     for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
       const instance = new (AgentClass as new () => BaseAgent)();
       generated.set(
         `dist/plugin/agents/${agentName}.md`,
         pluginCompiler.compileAgent(instance, "CLAUDE"),
       );
     }

     // --- Plugin agents (Luca-specific) ---
     generated.set(
       "dist/plugin/agents/lu-executor.md",
       pluginCompiler.compileAgent(new LuExecutorAgent(), "CLAUDE"),
     );
     generated.set(
       "dist/plugin/agents/lu-planner.md",
       pluginCompiler.compileAgent(new LuPlannerAgent(), "CLAUDE"),
     );

     // --- Plugin skills (registry) ---
     for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
       const instance = new (SkillClass as new () => BaseSkill)();
       generated.set(
         `dist/plugin/skills/${skillName}/SKILL.md`,
         pluginCompiler.compileSkill(instance, "CLAUDE"),
       );
     }

     // --- Plugin skills (Luca-specific) ---
     generated.set(
       "dist/plugin/skills/lu/SKILL.md",
       pluginCompiler.compileSkill(new LuSkill(), "CLAUDE"),
     );

     // --- Plugin commands ---
     for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
       if (!isCommandSkill(skillName)) continue;
       const instance = new (SkillClass as new () => BaseSkill)();
       generated.set(
         `dist/plugin/commands/${skillName}.md`,
         `---\ndescription: "${instance.description.replace(/"/g, '\\"')}"\n---\n\nInvoke the ${skillName} skill to execute this command.\n`,
       );
     }

     // Luca-specific command
     const luSkillForCmd = new LuSkill();
     generated.set(
       "dist/plugin/commands/lu.md",
       `---\ndescription: "${luSkillForCmd.description.replace(/"/g, '\\"')}"\n---\n\nInvoke the lu skill to execute this command.\n`,
     );

     // --- Plugin hooks ---
     const pluginHookRegistry = Object.fromEntries(
       Object.entries(hookRegistry).filter(
         ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
       ),
     );

     // Plugin hook scripts
     for (const [_name, def] of Object.entries(pluginHookRegistry)) {
       const srcPath = path.join(hookScriptsDir, def.script);
       const srcFile = Bun.file(srcPath);
       if (await srcFile.exists()) {
         generated.set(
           `dist/plugin/scripts/${def.script}`,
           await srcFile.text(),
         );
       }
     }

     // Plugin hooks.json
     const pluginHooksConfig = generateClaudeHooksConfig(pluginHookRegistry, {
       commandPrefix: "${CLAUDE_PLUGIN_ROOT}/scripts",
       wrapInHooksKey: true,
     });
     generated.set(
       "dist/plugin/hooks/hooks.json",
       JSON.stringify(pluginHooksConfig, null, 2) + "\n",
     );

     // --- Plugin manifest (plugin.json) ---
     const version = await readVersion();
     const pluginAgentNames = [
       ...Object.keys(agentRegistry),
       "lu-executor",
       "lu-planner",
     ];
     const pluginSkillNames = [...Object.keys(skillRegistry), "lu"];
     const pluginHookNames = Object.keys(pluginHookRegistry);

     const manifest = generatePluginManifest({
       name: "luca",
       version,
       description:
         "Luca - Agentic development framework with cognitive memory and spec-driven workflow",
       author: { name: "Alec Sibilia" },
       keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
     });

     generated.set(
       "dist/plugin/.claude-plugin/plugin.json",
       JSON.stringify(manifest, null, 2) + "\n",
     );

     // --- Marketplace manifest ---
     const marketplaceManifest = generateMarketplaceManifest(version);
     generated.set(
       "dist/plugin/.claude-plugin/marketplace.json",
       JSON.stringify(marketplaceManifest, null, 2) + "\n",
     );

     // --- README ---
     const readmeContent = generateReadme(
       pluginSkillNames,
       pluginAgentNames,
       pluginHookNames.length,
     );
     generated.set("dist/plugin/README.md", readmeContent);

     return generated;
   }
   ```

4. Verify `build-shared.ts` compiles without errors: `bunx --bun tsc --noEmit scripts/build-shared.ts`

**Verification:**

- [ ] `build-shared.ts` compiles without type errors
- [ ] `generateAllOutputs()` is exported and callable
- [ ] Function produces same Map keys and values as the current `generateToTemp()` in check-drift.ts

---

### Task 2: Migrate check-drift.ts to use generateAllOutputs()

**Goal:** Replace the entire `generateToTemp()` function and its 16 imports with a single import from `build-shared.ts`. This also removes the unused `tempDir` parameter (DEDUP-03).

**Files:** `scripts/check-drift.ts`

**Steps:**

1. Replace all imports from `src/` modules with a single import:

   ```typescript
   import { generateAllOutputs } from "./build-shared";
   ```

   Remove all 16 imports from `src/agents/index`, `src/skills/index`, `src/rules/index`, `src/hooks/index`, all type imports, all Luca-specific entity imports, all compiler imports, `generatePluginManifest`, `PLUGIN_EXCLUDED_HOOKS`, `generatePluginHooksConfig`, `readVersion`, `generateReadme`.

2. Remove the entire `generateToTemp()` function (lines 52-315).

3. Update `main()` to call `generateAllOutputs()` directly:

   ```typescript
   async function main() {
     const projectDir = process.cwd();
     const results: DriftResult[] = [];

     // Generate all outputs in memory
     const generated = await generateAllOutputs();

     // ... rest of comparison logic remains unchanged
   ```

   (Remove the `""` argument from the old `generateToTemp("")` call.)

4. Keep the `DriftResult` interface and all comparison/reporting logic unchanged.

**Verification:**

- [ ] `bun run check:drift` reports zero drift
- [ ] `scripts/check-drift.ts` has exactly 1 import from build-shared (plus `path`)
- [ ] No `generateToTemp` function exists in the file
- [ ] No `tempDir` parameter exists anywhere in the file
- [ ] The `DriftResult` interface and comparison logic are unchanged

---

### Task 3: Migrate check-drift.test.ts to use generateAllOutputs()

**Goal:** Replace `generateExpected()` and inline plugin compilation with `generateAllOutputs()`. Keep registry imports only for orphan detection tests.

**Files:** `scripts/check-drift.test.ts`

**Steps:**

1. Replace compilation-related imports with:

   ```typescript
   import {
     generateAllOutputs,
     agentRegistry,
     skillRegistry,
     ruleRegistry,
     hookRegistry,
     PLUGIN_EXCLUDED_HOOKS,
     isCommandSkill,
   } from "./build-shared";
   ```

   Remove all compiler imports (`CursorCompiler`, `ClaudeCompiler`, `PluginCompiler`), all Luca-specific entity imports, all base type imports, `generatePluginManifest`, `generatePluginHooksConfig`, `readVersion`, `generateReadme`, `generateHooksConfig`, `generateCursorHooksConfig`.

2. Remove the module-level compiler instantiations (lines 42-44):

   ```typescript
   // REMOVE:
   const cursorCompiler = new CursorCompiler();
   const claudeCompiler = new ClaudeCompiler();
   const pluginCompiler = new PluginCompiler();
   ```

3. Remove the entire `generateExpected()` function (lines 50-135).

4. Rewrite the "Output Freshness" `describe` block to use `generateAllOutputs()`:

   ```typescript
   describe("Output Freshness", () => {
     let generated: Map<string, string>;

     // Generate all outputs once before tests run
     beforeAll(async () => {
       generated = await generateAllOutputs();
     });

     test("agent outputs match source", () => {
       const drifted: string[] = [];
       for (const [relPath, expected] of generated) {
         if (!relPath.includes("/agents/")) continue;
         // Skip plugin agents (checked in Plugin Output Freshness)
         if (relPath.startsWith("dist/")) continue;
         const absPath = path.join(ROOT, relPath);
         try {
           const actual = require("fs").readFileSync(absPath, "utf8");
           if (actual !== expected) {
             drifted.push(`${relPath}: content differs`);
           }
         } catch {
           drifted.push(`${relPath}: missing`);
         }
       }
       expect(drifted).toEqual([]);
     });

     // ... similar pattern for skills, rules
   ```

5. Rewrite the "Plugin Output Freshness" `describe` block to use the same `generateAllOutputs()` Map, filtering for `dist/plugin/` paths:

   ```typescript
   describe("Plugin Output Freshness", () => {
     let generated: Map<string, string>;

     beforeAll(async () => {
       generated = await generateAllOutputs();
     });

     test("plugin agent outputs match source", () => {
       const drifted: string[] = [];
       for (const [relPath, expected] of generated) {
         if (!relPath.startsWith("dist/plugin/agents/")) continue;
         const absPath = path.join(ROOT, relPath);
         try {
           const actual = require("fs").readFileSync(absPath, "utf8");
           if (actual !== expected) {
             drifted.push(`${relPath}: content differs`);
           }
         } catch {
           drifted.push(`${relPath}: missing`);
         }
       }
       expect(drifted).toEqual([]);
     });

     // ... similar for plugin skills, commands, hooks, manifests, README
   ```

6. Keep all "Registry Completeness" and "No Orphan Outputs" tests unchanged (they use registries directly, not compilation output).

7. In the "Plugin No Orphan Outputs" `describe` block (line 753-759), replace local `COMMAND_EXCLUDED_PREFIXES` and `isCommandSkill` with imports from `build-shared` (already imported in step 1).

**Verification:**

- [ ] `bun test scripts/check-drift.test.ts` passes (all test suites)
- [ ] No compiler imports remain in check-drift.test.ts
- [ ] No `generateExpected()` function remains
- [ ] No Luca-specific entity imports remain (LuExecutorAgent, etc.)
- [ ] Registry Completeness and No Orphan Outputs tests continue to pass
- [ ] All 5 test describe blocks pass

---

### Task 4: Migrate build-all.ts to use generateAllOutputs()

**Goal:** Replace the duplicated compilation logic in `build-all.ts` with a call to `generateAllOutputs()`, keeping only the filesystem concerns (directory creation, file writing, hook script copying, chmod, settings.json merge, progress logging, failure tracking).

**Files:** `scripts/build-all.ts`

**Steps:**

1. Replace compilation-related imports with:

   ```typescript
   import { generateAllOutputs } from "./build-shared";
   import {
     cleanDirectory,
     cleanSkillsDirectory,
     ensureDir,
   } from "./build-utils";
   import path from "path";
   ```

   `generateCursorHooksConfig` is NOT needed — `generateAllOutputs()` generates `.cursor/hooks.json` content in the Map. `hookRegistry` is NOT needed — hook script content is in the Map, and directory cleaning uses file-extension-based scanning (`cleanDirectory(dir, [".sh"])`) not registry iteration.

   Remove all other imports: `agentRegistry`, `ruleRegistry`, `skillRegistry`, all type imports, all Luca-specific entity imports, all compiler imports, `generatePluginManifest`, `generateHooksConfig`/`generateClaudeHooksConfig`, `PLUGIN_EXCLUDED_HOOKS`, `generatePluginHooksConfig`, `readVersion`, `generateReadme`, `hookRegistry`, `generateCursorHooksConfig`.

2. Restructure `main()` to:
   a. **Keep**: Directory creation/cleaning (lines 58-105) -- filesystem concern
   b. **Replace**: All compilation loops (lines 112-245, 426-550) with `generateAllOutputs()`
   c. **Replace**: Hook script file copying (lines 260-358) — Map write handles content, post-write chmod pass handles permissions
   d. **Replace**: Settings.json hooks generation (lines 294-314) with reading from the Map
   e. **Keep**: Console output and progress logging -- UI concern
   f. **Keep**: Failure tracking and reporting (lines 738-744) -- reporting concern

3. The new flow for `main()`:

   ```typescript
   async function main() {
     // 1. Generate all outputs in memory
     const generated = await generateAllOutputs();

     // 2. Create and clean output directories (unchanged)
     // ...existing directory creation/cleaning code...

     // 3. Write all generated content to disk
     const failures: Array<{ type: string; name: string; error: unknown }> = [];
     let agentCount = 0;
     let skillCount = 0;
     let ruleCount = 0;

     for (const [relPath, content] of generated) {
       // Skip the special settings.json__hooks key (handled separately)
       if (relPath === ".claude/settings.json__hooks") continue;

       try {
         const absPath = path.join(process.cwd(), relPath);

         // Ensure parent directory exists for skill subdirectories
         await ensureDir(path.dirname(absPath));

         await Bun.write(absPath, content);

         // Track counts for summary
         if (relPath.includes("/agents/")) agentCount++;
         else if (relPath.includes("/skills/")) skillCount++;
         else if (relPath.includes("/rules/")) ruleCount++;
       } catch (error) {
         failures.push({ type: "write", name: relPath, error });
       }
     }

     // 4. Handle settings.json merge (special case)
     const hooksContent = generated.get(".claude/settings.json__hooks");
     if (hooksContent) {
       const settingsPath = path.join(
         process.cwd(),
         ".claude",
         "settings.json",
       );
       let existingSettings: Record<string, unknown> = {};
       try {
         const settingsFile = Bun.file(settingsPath);
         if (await settingsFile.exists()) {
           existingSettings = JSON.parse(await settingsFile.text());
         }
       } catch {
         /* start fresh */
       }

       existingSettings.hooks = JSON.parse(hooksContent);
       await Bun.write(
         settingsPath,
         JSON.stringify(existingSettings, null, 2) + "\n",
       );
     }

     // 5. chmod +x on hook scripts written from the Map
     for (const relPath of generated.keys()) {
       if (
         (relPath.includes("/hooks/") || relPath.includes("/scripts/")) &&
         relPath.endsWith(".sh")
       ) {
         Bun.spawnSync(["chmod", "+x", path.join(process.cwd(), relPath)]);
       }
     }

     // 6. Summary and failure reporting (unchanged)
     // ...
   }
   ```

4. Note: `generateAllOutputs()` reads hook script content into the Map as text strings. The Map iteration in Step 3 writes this content to disk. A separate `chmod +x` pass (Step 5 in the flow above) makes the `.sh` files executable after writing. The old separate hook script copying logic (lines 260-358, 569-601) is fully replaced by this Map-based approach.

5. Update count tracking to work from the Map rather than inline loops. Derive counts from Map keys:
   ```typescript
   // Derive counts from Map keys for summary
   const claudeAgentCount = [...generated.keys()].filter((k) =>
     k.startsWith(".claude/agents/"),
   ).length;
   // ... similar for other categories
   ```

**Verification:**

- [ ] `bun run build:all` completes successfully
- [ ] `bun run check:drift` reports zero drift after build
- [ ] All generated files are byte-identical to before
- [ ] Hook scripts have executable permissions after build
- [ ] `.claude/settings.json` hooks section is correctly merged
- [ ] `.cursor/hooks.json` is correctly generated
- [ ] Build summary output still shows accurate counts
- [ ] Failure reporting still works (test by temporarily breaking a source file)

---

### Task 5: Verify import graph simplification

**Goal:** Confirm the import graph matches the research target and no circular dependencies exist.

**Files:** All files modified in Tasks 1-4

**Steps:**

1. Verify `scripts/build-shared.ts` imports from `src/` modules (the single hub):
   - `src/agents/index`
   - `src/skills/index`
   - `src/rules/index`
   - `src/hooks/index`
   - `src/agents/types/agent.types`
   - `src/skills/types/skill.types`
   - `src/rules/types/rule.types`
   - `src/agents/luca/lu-executor.agent`
   - `src/agents/luca/lu-planner.agent`
   - `src/skills/luca/lu.skill`
   - `src/rules/lu-workflow.rule`
   - `src/compilers/cursor.compiler`
   - `src/compilers/claude.compiler`
   - `src/compilers/plugin.compiler`
   - `src/compilers/plugin.types`

2. Verify `scripts/check-drift.ts` has only:
   - `./build-shared` (1 import)
   - `path` (stdlib)

3. Verify `scripts/check-drift.test.ts` has only:
   - `bun:test` (test framework)
   - `node:fs` (for `readdirSync`, `existsSync`)
   - `path` (stdlib)
   - `./build-shared` (shared pipeline + registries)

4. Verify `scripts/build-all.ts` has only:
   - `./build-shared` (shared pipeline + hookRegistry)
   - `./build-utils` (filesystem utilities)
   - `path` (stdlib)

5. Run `bun test` to confirm no circular dependency issues.

**Verification:**

- [ ] Import graph matches the research target (Section 5 of RESEARCH.md)
- [ ] `check-drift.ts`: 16 imports reduced to 1 (+ path)
- [ ] `check-drift.test.ts`: 16 imports reduced to 4 (+ bun:test, node:fs, path, build-shared)
- [ ] `build-all.ts`: 16 imports reduced to 3 (+ build-shared, build-utils, path)
- [ ] `bun test` passes with no circular dependency errors
- [ ] `bun run build:all && bun run check:drift` passes end-to-end

---

## Success Criteria

- [ ] `generateAllOutputs()` exists in `build-shared.ts` as the single compilation pipeline
- [ ] `check-drift.ts` has no compilation logic -- delegates entirely to `generateAllOutputs()`
- [ ] `check-drift.test.ts` has no compilation logic -- delegates entirely to `generateAllOutputs()`
- [ ] `build-all.ts` has no compilation logic -- only filesystem concerns (write, chmod, merge, clean)
- [ ] Unused `tempDir` parameter is eliminated (DEDUP-03)
- [ ] Luca-specific entity compilations have uniform error handling via the centralized function (CLEAN-03)
- [ ] Import count reduced: check-drift.ts (16 -> 1), check-drift.test.ts (16 -> 4), build-all.ts (16 -> 3)
- [ ] ~290 lines of duplicated compilation logic eliminated
- [ ] `bun test` passes (full suite)
- [ ] `bun run build:all` completes successfully
- [ ] `bun run check:drift` passes (zero drift)
- [ ] All generated output files are byte-identical to before this plan
