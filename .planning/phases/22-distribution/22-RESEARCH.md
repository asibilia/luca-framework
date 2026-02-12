# Phase 22: Distribution & Marketplace -- Research

**Researched:** 2026-02-12
**Researcher:** lu-phase-researcher
**Phase Goal:** Create marketplace manifest, plugin README, update build:all pipeline, and extend drift detection.

---

## 1. Claude Code Marketplace Specification

### 1.1 marketplace.json Schema

The Claude Code marketplace spec requires a `.claude-plugin/marketplace.json` file. Based on the official documentation at [code.claude.com/docs/en/plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) and the Anthropic reference implementation at [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code/blob/main/.claude-plugin/marketplace.json), the schema is:

**Required fields:**

| Field     | Type   | Description                                                                              |
| --------- | ------ | ---------------------------------------------------------------------------------------- |
| `name`    | string | Marketplace identifier (kebab-case). Users see this: `/plugin install tool@marketplace`. |
| `owner`   | object | Maintainer info: `{ name: string, email?: string }`.                                     |
| `plugins` | array  | List of plugin entries. Each needs at minimum `name` and `source`.                       |

**Optional metadata fields:**

| Field                  | Type   | Description                                                                   |
| ---------------------- | ------ | ----------------------------------------------------------------------------- |
| `$schema`              | string | JSON schema reference URL (Anthropic uses a placeholder that may not resolve) |
| `metadata.description` | string | Brief marketplace description                                                 |
| `metadata.version`     | string | Marketplace catalog version                                                   |
| `metadata.pluginRoot`  | string | Base directory prepended to relative plugin source paths                      |

**Plugin entry fields (within `plugins[]`):**

| Field         | Type          | Required | Description                                       |
| ------------- | ------------- | -------- | ------------------------------------------------- |
| `name`        | string        | Yes      | Plugin identifier (kebab-case)                    |
| `source`      | string/object | Yes      | Where to fetch: relative path, GitHub, or git URL |
| `description` | string        | No       | Brief plugin description                          |
| `version`     | string        | No       | Semver version                                    |
| `author`      | object        | No       | `{ name, email? }`                                |
| `homepage`    | string        | No       | Documentation URL                                 |
| `repository`  | string        | No       | Source code repo URL                              |
| `license`     | string        | No       | SPDX identifier                                   |
| `keywords`    | array         | No       | Discovery tags                                    |
| `category`    | string        | No       | Plugin category for organization                  |
| `tags`        | array         | No       | Tags for searchability                            |
| `strict`      | boolean       | No       | Whether marketplace entry merges with plugin.json |
| `commands`    | string/array  | No       | Custom paths to command files                     |
| `agents`      | string/array  | No       | Custom paths to agent files                       |
| `hooks`       | string/object | No       | Hook config or path                               |
| `mcpServers`  | string/object | No       | MCP server configs                                |
| `lspServers`  | string/object | No       | LSP server configs                                |

### 1.2 Anthropic Reference: Official marketplace.json

The Anthropic bundled marketplace at `claude-code/.claude-plugin/marketplace.json` uses this structure:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "claude-code-plugins",
  "version": "1.0.0",
  "description": "Bundled plugins for Claude Code...",
  "owner": {
    "name": "Anthropic",
    "email": "support@anthropic.com"
  },
  "plugins": [
    {
      "name": "agent-sdk-dev",
      "description": "Development kit for working with the Claude Agent SDK",
      "source": "./plugins/agent-sdk-dev",
      "category": "development"
    }
  ]
}
```

**Key observations:**

- `version` and `description` are at the root level (NOT nested under `metadata`). The `metadata.description` and `metadata.version` paths are documented as optional alternatives, but Anthropic's own file uses flat root-level fields.
- Each plugin entry includes `category` -- values seen: `development`, `productivity`, `learning`, `security`.
- `source` uses relative paths (`./plugins/...`) for monorepo-style distribution.
- Not all plugin entries have `version` or `author` -- these are optional per-plugin.

### 1.3 marketplace.json vs plugin.json

The marketplace.json and plugin.json serve different purposes:

| Concern             | marketplace.json                          | plugin.json                      |
| ------------------- | ----------------------------------------- | -------------------------------- |
| **Purpose**         | Marketplace catalog listing               | Individual plugin manifest       |
| **Location**        | `.claude-plugin/marketplace.json`         | `.claude-plugin/plugin.json`     |
| **Who reads it**    | `/plugin marketplace add` (discovery)     | `/plugin install` (installation) |
| **Scope**           | Lists multiple plugins                    | Describes one plugin             |
| **Component paths** | Can override/supplement plugin.json paths | Default component locations      |
| **Required fields** | `name`, `owner`, `plugins[]`              | `name` (only)                    |

**For Luca:** We need BOTH files:

1. `marketplace.json` -- for marketplace discovery (so users can `/plugin marketplace add` our repo)
2. `plugin.json` -- already exists at `dist/plugin/.claude-plugin/plugin.json`

### 1.4 Plugin Installation Flow

When a user runs `/plugin marketplace add <owner/repo>`:

1. Claude Code clones/fetches the repository
2. Reads `.claude-plugin/marketplace.json`
3. Lists available plugins from the `plugins[]` array

When a user runs `/plugin install luca@luca-marketplace`:

1. Claude Code resolves the `source` field from the marketplace entry
2. Copies the entire plugin directory to a local cache
3. Reads `.claude-plugin/plugin.json` for manifest metadata
4. Auto-discovers `commands/`, `agents/`, `skills/`, `hooks/` at plugin root
5. Registers all components

**Critical implication for source field:** For GitHub-hosted distribution, the `source` should point to the plugin directory relative to the marketplace root. Since the Luca repo has `dist/plugin/` as the plugin location:

- **Option A (monorepo-style):** marketplace.json at repo root, `"source": "./dist/plugin"` -- requires the marketplace file to live at the repo root
- **Option B (self-contained plugin):** marketplace.json inside `dist/plugin/`, `"source": "."` -- makes `dist/plugin/` a standalone marketplace+plugin
- **Option C (GitHub source):** marketplace.json anywhere, `"source": { "source": "github", "repo": "owner/luca-framework" }` -- external reference

**Recommendation:** Option A. Place `marketplace.json` at the repo root `.claude-plugin/marketplace.json` with `"source": "./dist/plugin"`. This follows the Anthropic pattern and allows the repo itself to be the marketplace.

**Alternative (also valid):** Place `marketplace.json` inside `dist/plugin/.claude-plugin/` alongside plugin.json. This makes the plugin self-contained but requires users to add the marketplace specifically from the dist/plugin path.

Per 22-CONTEXT.md, the exact location is "Claude's discretion based on Claude Code marketplace spec." The research recommends Option A (repo root) as it aligns with the Anthropic pattern and provides the simplest user experience: `claude plugin marketplace add owner/luca-framework`.

### 1.5 marketplace.json for Luca

Based on the spec and project context:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "luca-marketplace",
  "description": "Luca - Agentic development framework with cognitive memory and spec-driven workflow",
  "owner": {
    "name": "Alec Sibilia"
  },
  "plugins": [
    {
      "name": "luca",
      "description": "Agentic development framework with cognitive memory and spec-driven workflow",
      "source": "./dist/plugin",
      "category": "development",
      "version": "<from package.json at build time>",
      "author": {
        "name": "Alec Sibilia"
      },
      "homepage": "<repository URL>",
      "repository": "<repository URL>",
      "license": "MIT",
      "keywords": ["agent", "ai", "framework", "luca", "workflow", "cognitive"]
    }
  ]
}
```

**Key decisions:**

- `name`: `"luca-marketplace"` -- distinct from the plugin name `"luca"`
- `category`: `"development"` -- matches the Anthropic pattern for dev tools
- `source`: `"./dist/plugin"` -- relative path to the compiled plugin
- `version`: Sourced from package.json at build time (single source of truth per 22-CONTEXT.md)

---

## 2. Build Pipeline Analysis

### 2.1 Current Architecture

The current build pipeline has a clear separation:

```
scripts/build-all.ts          scripts/build-plugin.ts
      |                              |
      |-- .claude/ generation        |-- dist/plugin/ generation
      |-- .cursor/ generation        |-- agents, skills, commands
      |-- Hook scripts + configs     |-- hooks.json, scripts
      |                              |-- plugin.json manifest
      +--- calls buildPlugin() ------+
```

`build-all.ts` (line 362-366) calls `buildPlugin()` from `build-plugin.ts`:

```typescript
const pluginSummary = await buildPlugin();
console.log(
  `Plugin: ${pluginSummary.agents} agents, ${pluginSummary.skills} skills, ...`,
);
```

`build-plugin.ts` exports both the `buildPlugin()` function AND has an `import.meta.main` standalone entry point (line 529-553). This dual-mode pattern is what enables both:

- `bun run build:plugin` -- standalone via `import.meta.main`
- `bun run build:all` -- imported function call

### 2.2 Consolidation Approach

Per 22-CONTEXT.md: "Consolidate all generation into build-all.ts -- move plugin generation logic inline alongside .claude/ and .cursor/ generation. Remove standalone build-plugin.ts script."

**What to move inline:**

1. **Plugin directory structure creation** (build-plugin.ts lines 232-248)
2. **Agent compilation for plugin** (lines 288-331) -- uses `PluginCompiler`, same registries
3. **Skill compilation for plugin** (lines 336-372) -- same registries
4. **Command generation** (lines 377-416) -- `generateCommandMarkdown()` function
5. **Hook script copying and filtering** (lines 421-464) -- `PLUGIN_EXCLUDED_HOOKS` set
6. **Hooks.json generation** (lines 468-473) -- `generatePluginHooksConfig()` function
7. **Plugin manifest generation** (lines 477-498) -- `generatePluginManifest()` from `plugin.types.ts`
8. **Version reading** (lines 172-203) -- `readVersion()` function

**What stays in separate modules (not moved):**

- `PluginCompiler` class -- stays in `src/compilers/plugin.compiler.ts`
- `generatePluginManifest()` -- stays in `src/compilers/plugin.types.ts`
- `COMMAND_EXCLUDED_SKILLS` set -- moves inline to build-all.ts
- `PLUGIN_EXCLUDED_HOOKS` set -- moves inline to build-all.ts
- `generatePluginHooksConfig()` -- moves inline or to a shared utils file
- `generateCommandMarkdown()` -- moves inline (3-line function)
- `readVersion()` -- moves inline

**New additions for marketplace:**

- marketplace.json generation (new code)
- README.md generation (new code)

### 2.3 Build Summary Enhancement

Current summary (build-all.ts lines 375-385):

```
=== Build All Summary ===
Agents: 26 (x2 formats = 52 files)
Skills: 44 (x2 formats = 88 files)
Rules:  17 (x2 formats = 34 files)
Hooks:  7 (Claude) + 7 (Cursor)
Plugin: 26 agents, 44 skills, 38 commands, 6 hooks
Total:  308 files
```

**Enhanced summary should report all three targets:**

```
=== Build All Summary ===

--- .claude/ ---
Agents:  26 files
Skills:  44 files
Rules:   17 files
Hooks:   7 scripts + settings.json

--- .cursor/ ---
Agents:  26 files
Skills:  44 files
Rules:   17 files
Hooks:   7 scripts + hooks.json

--- dist/plugin/ ---
Agents:   26 files
Skills:   44 files
Commands: 38 files
Hooks:    6 scripts + hooks.json
Manifest: plugin.json + marketplace.json
Docs:     README.md

Total: ~320 files across 3 targets
```

### 2.4 Package.json Script Changes

Current scripts:

```json
"build:all": "bun run ./scripts/build-all.ts",
"build:plugin": "bun ./scripts/build-plugin.ts",
```

After consolidation:

```json
"build:all": "bun run ./scripts/build-all.ts"
```

Remove `build:plugin` since there is no standalone plugin build. All builds go through `build:all`.

---

## 3. Drift Detection Extension

### 3.1 Current Drift Detection Architecture

The drift detection system has two layers:

1. **`scripts/check-drift.ts`** -- Runtime drift checker (called by hook and standalone):
   - Generates all outputs in memory via `generateToTemp()`
   - Compares each generated file against committed output
   - Reports `drifted`, `missing`, and `orphaned` statuses
   - **Currently covers:** `.claude/` and `.cursor/` only. No `dist/plugin/` coverage.

2. **`scripts/check-drift.test.ts`** -- Test-time drift checker:
   - Three test suites: Output Freshness, Registry Completeness, No Orphan Outputs
   - **Currently covers:** `.claude/` and `.cursor/` agents, skills, rules, hooks, settings
   - **Does NOT cover:** `dist/plugin/` at all

3. **`src/hooks/scripts/pre-commit-drift-check.sh`** -- Pre-commit hook:
   - Intercepts commit commands
   - Only runs if staged files include `.claude/*`, `.cursor/*`, or `src/` changes
   - Calls `bun run ./scripts/check-drift.ts`

### 3.2 What check-drift.ts Currently Checks

From `check-drift.ts:46-160`, the `generateToTemp()` function generates:

| Category                        | Coverage                               | Count       |
| ------------------------------- | -------------------------------------- | ----------- |
| `.claude/agents/*.md`           | All registry + lu-executor, lu-planner | 26 files    |
| `.cursor/agents/*.md`           | Same                                   | 26 files    |
| `.claude/skills/*/SKILL.md`     | All registry + lu skill                | 44 files    |
| `.cursor/skills/*/SKILL.md`     | Same                                   | 44 files    |
| `.claude/rules/*.md`            | All registry + lu-workflow             | 17 files    |
| `.cursor/rules/*.mdc`           | Same                                   | 17 files    |
| `.claude/hooks/*.sh`            | All hook scripts                       | 7 files     |
| `.cursor/hooks/*.sh`            | Same                                   | 7 files     |
| `.claude/settings.json` (hooks) | Hooks section only                     | 1 check     |
| `.cursor/hooks.json`            | Full file                              | 1 check     |
| **Total**                       |                                        | ~189 checks |

**Not covered:**

| Missing Category                              | Expected Files                         |
| --------------------------------------------- | -------------------------------------- |
| `dist/plugin/agents/*.md`                     | 26 agent files                         |
| `dist/plugin/skills/*/SKILL.md`               | 44 skill directories                   |
| `dist/plugin/commands/*.md`                   | 38 command files                       |
| `dist/plugin/hooks/hooks.json`                | 1 hooks config                         |
| `dist/plugin/scripts/*.sh`                    | 6 hook scripts (excluding drift-check) |
| `dist/plugin/.claude-plugin/plugin.json`      | 1 manifest                             |
| `dist/plugin/.claude-plugin/marketplace.json` | 1 marketplace manifest (NEW)           |
| `dist/plugin/README.md`                       | 1 README (NEW)                         |

### 3.3 Extension Approach

**Pattern to follow:** The existing `generateToTemp()` function builds a `Map<string, string>` of `relPath -> expectedContent`. Extending it means adding plugin output entries to this map.

**Step 1: Generate plugin content in check-drift.ts**

The plugin generation requires `PluginCompiler`, which is separate from `CursorCompiler`/`ClaudeCompiler`. Add to `generateToTemp()`:

```typescript
// --- Plugin agents ---
const pluginCompiler = new PluginCompiler();
for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
  const instance = new (AgentClass as new () => BaseAgent)();
  generated.set(
    `dist/plugin/agents/${agentName}.md`,
    pluginCompiler.compileAgent(instance, "CLAUDE"),
  );
}
// ... lu-executor, lu-planner

// --- Plugin skills ---
for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
  const instance = new (SkillClass as new () => BaseSkill)();
  generated.set(
    `dist/plugin/skills/${skillName}/SKILL.md`,
    pluginCompiler.compileSkill(instance, "CLAUDE"),
  );
}
// ... lu skill

// --- Plugin commands ---
for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
  if (COMMAND_EXCLUDED_SKILLS.has(skillName)) continue;
  const instance = new (SkillClass as new () => BaseSkill)();
  generated.set(
    `dist/plugin/commands/${skillName}.md`,
    generateCommandMarkdown(skillName, instance.description),
  );
}
// ... lu command

// --- Plugin hooks ---
const pluginHookRegistry = Object.fromEntries(
  Object.entries(hookRegistry).filter(
    ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
  ),
);
const pluginHooksConfig = generatePluginHooksConfig(pluginHookRegistry);
generated.set(
  "dist/plugin/hooks/hooks.json",
  JSON.stringify(pluginHooksConfig, null, 2) + "\n",
);

// Plugin hook scripts
for (const [_name, def] of Object.entries(pluginHookRegistry)) {
  const srcPath = path.join(hookScriptsDir, def.script);
  const srcFile = Bun.file(srcPath);
  if (await srcFile.exists()) {
    generated.set(`dist/plugin/scripts/${def.script}`, await srcFile.text());
  }
}

// --- Plugin manifest ---
const manifest = generatePluginManifest({
  /* ... */
});
generated.set(
  "dist/plugin/.claude-plugin/plugin.json",
  JSON.stringify(manifest, null, 2) + "\n",
);

// --- Marketplace manifest ---
// ... generate and add
generated.set(
  "dist/plugin/.claude-plugin/marketplace.json",
  JSON.stringify(marketplaceManifest, null, 2) + "\n",
);

// --- README ---
generated.set("dist/plugin/README.md", generatedReadme);
```

**Step 2: Add orphan detection for dist/plugin/**

Currently, `check-drift.ts` does NOT detect orphaned files -- it only checks that generated files match committed output. The `check-drift.test.ts` file handles orphan detection via the "No Orphan Outputs" test suite.

For plugin orphan detection in `check-drift.test.ts`, add new tests:

```typescript
describe("No Orphan Outputs (Plugin)", () => {
  test("no orphan agent outputs in dist/plugin/agents/", () => {
    const dir = path.join(ROOT, "dist", "plugin", "agents");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const orphans = files.filter(
      (f) => !validAgentNames.has(f.replace(".md", "")),
    );
    expect(orphans).toEqual([]);
  });

  // ... similar for skills, commands, scripts
});
```

**Step 3: Extend pre-commit-drift-check.sh staged file check**

Current pattern (line 53-60):

```bash
case "$file" in
  .claude/*|.cursor/*|src/agents/*|src/skills/*|src/rules/*|src/hooks/*)
    HAS_RELEVANT_FILES=1
    break
    ;;
esac
```

Extend to include plugin output:

```bash
case "$file" in
  .claude/*|.cursor/*|dist/plugin/*|src/agents/*|src/skills/*|src/rules/*|src/hooks/*|src/compilers/*)
    HAS_RELEVANT_FILES=1
    break
    ;;
esac
```

### 3.4 Drift Detection for Generated Files

marketplace.json and README.md are generated at build time from dynamic data (registries, package.json version). The drift check must generate the same content deterministically. Key considerations:

- **Version sourcing:** The `readVersion()` function in build-plugin.ts reads from `packages/luca-framework/package.json` then falls back to root `package.json`. check-drift.ts must use the same logic.
- **Registry counts:** README content depends on `Object.keys(agentRegistry).length` etc. -- deterministic as long as registries don't change.
- **Marketplace manifest:** Version field comes from package.json -- must match.

---

## 4. Plugin README Generation

### 4.1 Content Requirements (from 22-CONTEXT.md)

- Developer-concise tone (like a good npm package README)
- High-level categories only for "What's Included" -- group by capability with counts
- Generated at build time from source registries
- Lives at `dist/plugin/README.md`

### 4.2 README Structure

Based on patterns from Anthropic's official plugins and the Claude Code plugin spec:

````markdown
# Luca

Agentic development framework with cognitive memory and spec-driven workflow.

## Installation

```bash
# Add the marketplace
/plugin marketplace add owner/luca-framework

# Install the plugin
/plugin install luca@luca-marketplace
```
````

## Quick Start

```bash
# Start a new project
/lu-new-project

# Begin working on a phase
/lu

# Check progress
/lu-progress
```

## What's Included

### Skills (N total)

- **Workflow** (N): Phase planning, execution, research, discussion, verification
- **Git** (N): Commits, feature branches, pull requests
- **Project Management** (N): Milestones, todos, roadmaps, session planning
- **Code Quality** (N): Linting, type checking, test running, QA consolidation
- **Utilities** (N): Help, settings, updates, debug

### Agents (N total)

- **Development** (N): Code architect, developer, simplifier, DX advocate
- **Workflow** (N): Executor, planner, router, verifier, learner
- **Quality** (N): PR reviewer, integration checker, plan checker, QA generator
- **Research** (N): Phase researcher, project researcher, codebase mapper

### Commands (N total)

All skills are available as slash commands.

### Hooks (N active)

Automated code formatting, type checking, pre-commit validation, context monitoring, and session management.

## License

MIT

````

### 4.3 Category Classification

For the "What's Included" section, skills should be classified into high-level categories. Based on the current skill registry:

**Skill categories:**

| Category               | Skills                                                                                       | Count |
| ---------------------- | -------------------------------------------------------------------------------------------- | ----- |
| Workflow               | lu, lu-execute-phase, lu-plan-phase, lu-discuss-phase, lu-research-phase, lu-verify-work, lu-quick, lu-choose, workflow-start | ~9 |
| Git                    | git-commit, git-feature, git-pr                                                              | 3     |
| Project Management     | lu-new-project, lu-new-milestone, lu-complete-milestone, lu-audit-milestone, lu-add-phase, lu-insert-phase, lu-remove-phase, lu-plan-milestone-gaps, lu-plan-session, lu-progress, lu-add-todo, lu-check-todos, lu-list-phase-assumptions | ~13 |
| Code Quality           | code-lint, code-typecheck, test-run, qa-consolidate                                          | 4     |
| Collaboration          | jira-issue, lu-address-pr, git-pr                                                            | 3     |
| Configuration          | lu-settings, lu-set-profile, lu-help, lu-update, lu-map-codebase                             | 5     |
| Session Management     | lu-pause-work, lu-resume-work                                                                | 2     |
| Reference (auto-invoked) | rule-lu-workflow, rule-complexity-gating, rule-harness-verification, rule-hook-skill-boundary, rule-file-naming | 5 |

**Agent categories:**

| Category       | Agents                                                                                      | Count |
| -------------- | ------------------------------------------------------------------------------------------- | ----- |
| Development    | code-architect, code-developer, code-simplifier, dx-advocate                                | 4     |
| Workflow       | lu-executor, lu-planner, lu-router, lu-verifier, lu-learner, lu-cognition                   | 6     |
| Quality        | lu-pr-reviewer, lu-integration-checker, lu-plan-checker, qa-plan-generator, performance-auditor, security-auditor | 6 |
| Research       | lu-phase-researcher, lu-project-researcher, lu-research-synthesizer, lu-codebase-mapper      | 4     |
| Specialty      | lu-roadmapper, lu-pm-planner, lu-debugger, product, ui, ux                                   | 6     |

### 4.4 Generation Approach

The README should be generated programmatically in the build script by reading from the registries:

```typescript
function generateReadme(
  agentCount: number,
  skillCount: number,
  commandCount: number,
  hookCount: number,
  version: string,
): string {
  return `# Luca

Agentic development framework with cognitive memory and spec-driven workflow.

## Installation
...

## What's Included

### Skills (${skillCount} total)
...

### Agents (${agentCount} total)
...

### Commands (${commandCount} total)
...

### Hooks (${hookCount} active)
...

## License

MIT
`;
}
````

Category assignments could be maintained as a static map in the build script (not derived from skill content). This keeps the classification stable and human-curated while still auto-updating counts.

---

## 5. Don't Hand-Roll

### 5.1 Existing Infrastructure to Reuse

| Concern                        | Existing Solution                                                               | Reuse Strategy                                             |
| ------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Plugin manifest schema         | `pluginManifestSchema` in `src/compilers/plugin.types.ts`                       | Use `generatePluginManifest()` as-is                       |
| Plugin compilation             | `PluginCompiler` in `src/compilers/plugin.compiler.ts`                          | Import and use unchanged                                   |
| Agent/skill/hook registries    | `src/agents/index.ts`, `src/skills/index.ts`, `src/hooks/index.ts`              | Same registries power all three targets                    |
| Plugin hooks config generation | `generatePluginHooksConfig()` in `build-plugin.ts`                              | Move function to shared location or inline in build-all.ts |
| Command generation             | `generateCommandMarkdown()` in `build-plugin.ts`                                | Move inline (3 lines)                                      |
| Version reading                | `readVersion()` in `build-plugin.ts`                                            | Move inline to build-all.ts                                |
| Directory cleanup              | `cleanDirectory()`, `cleanSkillsDirectory()`, `ensureDir()` in `build-utils.ts` | Already shared; no changes needed                          |
| Excluded sets                  | `COMMAND_EXCLUDED_SKILLS`, `PLUGIN_EXCLUDED_HOOKS`                              | Move to build-all.ts or shared constants file              |
| Drift check structure          | `DriftResult` interface, `generateToTemp()` pattern                             | Extend, don't replace                                      |
| Drift test patterns            | `check-drift.test.ts` describe/test structure                                   | Add new describe blocks following existing pattern         |

### 5.2 Do NOT Recreate

- **Do NOT** create a separate marketplace build script. Marketplace manifest generation goes inline in `build-all.ts`.
- **Do NOT** create a new marketplace schema. The marketplace.json structure is defined by Claude Code's spec, not by a Zod schema in our codebase. Generate the JSON directly.
- **Do NOT** parse the existing plugin.json to extract fields for marketplace.json. Both are generated from the same source data (registries + package.json).
- **Do NOT** add a new npm dependency for README generation. Use template literals.
- **Do NOT** create separate drift detection for plugin output. Extend the existing `generateToTemp()` and test suites.

---

## 6. Common Pitfalls

### 6.1 marketplace.json Location

**Pitfall:** Placing marketplace.json inside `dist/plugin/.claude-plugin/` makes the plugin self-referential (the marketplace contains only itself). This works for single-plugin distribution but means users must point to `dist/plugin/` specifically when adding the marketplace.

**Better:** Place marketplace.json generation at the repo root level (`.claude-plugin/marketplace.json`) so users can add the whole repo as a marketplace: `/plugin marketplace add owner/luca-framework`.

**However:** The repo root `.claude-plugin/` already contains `plugin.json` (the Luca plugin manifest for the repo as a plugin). Having BOTH `plugin.json` AND `marketplace.json` in the same `.claude-plugin/` directory is valid -- the marketplace file is for marketplace discovery, while plugin.json is for the repo-as-plugin.

**Resolution:** Generate marketplace.json inside `dist/plugin/.claude-plugin/` alongside the existing plugin.json. This makes `dist/plugin/` a self-contained distributable that is both a plugin AND a marketplace. Users add it via `/plugin marketplace add` pointing to the dist/plugin directory or the GitHub repo (with appropriate source paths).

### 6.2 Version Synchronization

**Pitfall:** Version appears in three places -- package.json, plugin.json, marketplace.json. If they drift, users see inconsistent versions.

**Solution:** All three read from the SAME source via `readVersion()`. The build script writes the version to both plugin.json and marketplace.json. package.json is the source of truth.

### 6.3 Drift Detection False Positives

**Pitfall:** If marketplace.json or README.md contain timestamps or non-deterministic content, every drift check will report drift.

**Solution:** Generated content must be fully deterministic. No timestamps, no random values, no environment-dependent strings. Version comes from package.json (static). Counts come from registries (static for a given source state).

### 6.4 Build Order Dependency

**Pitfall:** The README needs counts from the plugin build (agents, skills, commands). If generated before compilation, counts could be wrong.

**Solution:** Generate README and marketplace.json AFTER all compilation is complete, using the same count variables. The build-all.ts consolidation naturally handles this since everything is in one function.

### 6.5 Orphan Detection Complexity

**Pitfall:** Plugin output has a complex directory structure (skills are in subdirectories, commands are flat .md files). Orphan detection needs different strategies per directory.

**Solution:** Follow the exact pattern from check-drift.test.ts. For flat directories (agents, commands, scripts), check filenames against valid name sets. For nested directories (skills), check directory names. For singleton files (plugin.json, hooks.json, marketplace.json, README.md), verify existence and content.

### 6.6 build-plugin.ts Import Side Effects

**Pitfall:** Other files may import from `build-plugin.ts` (e.g., tests, build-all.ts). Removing the file breaks imports.

**Current importers:**

- `build-all.ts` line 44: `import { buildPlugin } from "./build-plugin";`
- No test files import from build-plugin.ts directly.

**Solution:** After consolidation, remove the import from build-all.ts (since the logic is now inline) and delete build-plugin.ts. Verify no other files import it.

---

## 7. Implementation Recommendations

### 7.1 Wave 1 (Parallel)

**22-01: Marketplace manifest generation**

- Add marketplace.json generation to build-all.ts (inline, after plugin build)
- Source version from `readVersion()` (same function used for plugin.json)
- Include `name`, `owner`, `description`, `category`, `source`, `version`, `author`, `license`, `keywords`
- Location: `dist/plugin/.claude-plugin/marketplace.json` (alongside plugin.json)
- Add to drift detection in check-drift.ts and check-drift.test.ts

**22-02: Plugin README generation**

- Add README.md generation to build-all.ts (inline, after plugin build)
- Use registry counts for dynamic "What's Included" section
- Maintain skill/agent category maps as static data in the build script
- Location: `dist/plugin/README.md`
- Developer-concise tone with installation, quick-start, and feature summary
- Add to drift detection

### 7.2 Wave 2 (Parallel)

**22-03: Build pipeline consolidation**

- Move ALL plugin generation logic from build-plugin.ts into build-all.ts
- Inline helper functions: `generatePluginHooksConfig()`, `generateCommandMarkdown()`, `readVersion()`
- Move constants: `COMMAND_EXCLUDED_SKILLS`, `PLUGIN_EXCLUDED_HOOKS`
- Remove `build-plugin.ts` file entirely
- Remove `build:plugin` script from package.json
- Update build summary to report all three targets with unified stats
- Verify `BuildPluginResult` type is no longer needed externally

**22-04: Drift detection extension**

- Extend `generateToTemp()` in check-drift.ts to generate all plugin output
- Add plugin output comparison in the main drift check loop
- Extend check-drift.test.ts with plugin-specific test suites:
  - Plugin Output Freshness (agents, skills, commands, hooks, scripts, manifest, marketplace, README)
  - Plugin Registry Completeness (optional -- main registry tests already cover source completeness)
  - Plugin No Orphan Outputs (agents, skills, commands, scripts)
- Extend pre-commit-drift-check.sh staged file pattern to include `dist/plugin/*`

---

## 8. Risk Assessment

### 8.1 Low Risk: marketplace.json Field Compatibility

**Risk:** Claude Code marketplace spec evolves and our generated manifest becomes invalid.
**Mitigation:** Use only well-documented required fields. Run `claude plugin validate .` during testing. The `$schema` reference is optional and the URL does not actually resolve (known issue).
**Probability:** Low.

### 8.2 Low Risk: Build Consolidation Regressions

**Risk:** Moving plugin generation inline causes compilation differences.
**Mitigation:** The existing drift detection will catch any differences. Run `bun run build:all` before and after consolidation; diff the output directories.
**Probability:** Low -- the logic is identical, just relocated.

### 8.3 Medium Risk: Drift Detection Performance

**Risk:** Adding ~120 more file checks to drift detection slows down pre-commit hooks significantly.
**Mitigation:** The existing drift check generates files in memory (not to disk). Plugin compilation adds ~120 more `Map.set()` calls and ~120 file reads for comparison. The compilation itself (PluginCompiler) is fast since it reuses Claude-format output. Expected overhead: < 5 seconds.
**Probability:** Low for runtime impact. Medium for perceived slowness on first experience.

### 8.4 Low Risk: README Content Staleness

**Risk:** README category assignments become stale as new skills/agents are added.
**Mitigation:** Categories are maintained as a static map. If a new skill is added without a category assignment, the build should still succeed (uncategorized skills counted separately). Adding a warning for uncategorized skills would catch this.
**Probability:** Medium over time, but low impact (README is informational, not functional).

---

## 9. File References Summary

### Files to Create

| File                                          | Purpose                          |
| --------------------------------------------- | -------------------------------- |
| `dist/plugin/.claude-plugin/marketplace.json` | Marketplace manifest (generated) |
| `dist/plugin/README.md`                       | Plugin documentation (generated) |

### Files to Modify

| File                                          | Change                                                               |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `scripts/build-all.ts`                        | Consolidate plugin build inline; add marketplace + README generation |
| `scripts/check-drift.ts`                      | Extend `generateToTemp()` for plugin output                          |
| `scripts/check-drift.test.ts`                 | Add plugin output freshness + orphan detection test suites           |
| `src/hooks/scripts/pre-commit-drift-check.sh` | Add `dist/plugin/*` to staged file pattern                           |
| `package.json`                                | Remove `build:plugin` script                                         |

### Files to Delete

| File                      | Reason                                                         |
| ------------------------- | -------------------------------------------------------------- |
| `scripts/build-plugin.ts` | Logic consolidated into build-all.ts; standalone entry removed |

### Files Unchanged

| File                                     | Reason                                                        |
| ---------------------------------------- | ------------------------------------------------------------- |
| `src/compilers/plugin.compiler.ts`       | Imported by build-all.ts; no changes needed                   |
| `src/compilers/plugin.types.ts`          | `generatePluginManifest()` and schema used as-is              |
| `src/agents/index.ts`                    | Registry unchanged                                            |
| `src/skills/index.ts`                    | Registry unchanged                                            |
| `src/hooks/index.ts`                     | Registry unchanged; hook config generators still needed       |
| `scripts/build-utils.ts`                 | Shared utilities used as-is                                   |
| `dist/plugin/.claude-plugin/plugin.json` | Already generated; now generated inline instead of via import |

### Generated Output Changes

| File                                          | Change                                             |
| --------------------------------------------- | -------------------------------------------------- |
| `dist/plugin/.claude-plugin/marketplace.json` | NEW: marketplace catalog for distribution          |
| `dist/plugin/README.md`                       | NEW: plugin documentation                          |
| All existing dist/plugin/\* files             | Same content, now generated by build-all.ts inline |

---

_Research completed: 2026-02-12_
_Total files examined: 14_
_External sources consulted: Claude Code marketplace docs, Anthropic official marketplace repo, claude-plugins-official repo_
_Gaps identified: 4 plans covering marketplace manifest, README, build consolidation, drift detection_
