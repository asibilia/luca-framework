# Adapter Architectures for Multi-Platform Dev Tooling

**Researched:** 2026-03-23
**Domain:** Multi-platform AI coding tool adapter/plugin systems
**Overall confidence:** HIGH (primary sources are official docs for all major platforms)

---

## Executive Summary

The AI coding tool ecosystem in 2026 has converged on a remarkably similar configuration model across platforms: **markdown files with YAML frontmatter**, organized in convention-based directories. Claude Code, Cursor, Windsurf, and VS Code Copilot all use this pattern for agents, rules/instructions, and skills/commands. The differences are in naming conventions, frontmatter fields, and activation semantics -- not in fundamental architecture.

This convergence creates a strong opportunity for Luca's adapter system. The compilation problem is largely a **format translation** problem, not a paradigm mismatch. Luca's existing TypeScript-to-markdown compiler pipeline maps cleanly to every target platform because every platform consumes markdown with metadata.

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is the clear foundation for Luca's API/headless adapter. It provides the same tools (Read, Write, Edit, Bash, Grep, Glob), agent loop, and context management as Claude Code, available as a TypeScript library. This eliminates the need to build a custom tool bridge -- the SDK already implements every tool Luca uses.

For the adapter registry design, the Rollup/Vite plugin model is the strongest precedent: a hook-based interface where each adapter implements named lifecycle methods (compileAgent, compileRule, executeStep), registered in a Map with format-string keys. Luca's existing `plugin-registry.ts` already follows this pattern and needs only modest extension to support the full adapter interface.

---

## 1. Multi-Platform Dev Tool Architectures

### How Established Tools Handle Multi-Editor Integration

**Language Server Protocol (LSP) -- The Gold Standard**

LSP is the most successful multi-editor abstraction in developer tooling history. Its architecture provides the key insight for Luca's adapter design.

**Core architecture:** Client-server model where editors are thin clients and language servers contain the semantic engine, communicating via JSON-RPC messages.

**Critical design decision:** LSP works at the level of **editor data types** (open text document, cursor position) rather than programming language domain model types (ASTs, compiler symbols). This level of abstraction is what makes it portable -- it defines a protocol at the "LCD" (lowest common denominator) that all editors can implement.

**Lesson for Luca:** The adapter interface should operate at the level of **agent/skill/rule definitions** (Luca's domain model), not at the level of individual platform artifacts. Each adapter translates from the common model to platform-specific output. This is exactly what the existing `CompilerPlugin` interface does.

Sources:

- [LSP Official Site](https://microsoft.github.io/language-server-protocol/)
- [LSP vs AI-Native Architectures (Medium, 2026)](https://softwareguide.medium.com/language-server-protocol-lsp-vs-ai-native-architectures-f1bd313e6a87)
- [VSCode LSP Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)

**Rollup/Vite Plugin System -- The Build Tool Model**

Vite's plugin system provides the most relevant architecture for Luca's adapter registry because it solves a similar problem: multiple compilation targets from a single source definition.

**Architecture:** Hook-based plugin interface where each plugin implements named methods (resolveId, load, transform, renderChunk) that the build pipeline calls at specific points. Plugins are registered in an array and called in order.

**Key patterns:**

- **Hook types:** "first" (sequential until one returns), "sequential" (all in order), "parallel" (all concurrently)
- **Hook ordering:** Plugins can declare "pre" or "post" to control execution order
- **Rollup compatibility:** Vite extends Rollup's plugin API with Vite-specific hooks, so Rollup plugins work unchanged

**Evolution (2026):** Vite 8.0 (March 2026) replaced the dual esbuild/Rollup bundler with Rolldown (single Rust-based engine) while keeping the Rollup-compatible plugin API. This demonstrates that a stable plugin interface can survive wholesale internal rewrites -- exactly the guarantee Luca needs for adapters.

**Lesson for Luca:** The adapter interface should use named hooks (compileAgent, compileSkill, compileRule, executeStep, emit) that the pipeline calls at defined points. Adapters register in a Map/Array. The existing `CompilerPlugin` interface already follows this pattern.

Sources:

- [Rollup Plugin Development](https://rollupjs.org/plugin-development/)
- [Vite Plugin API](https://vite.dev/config/build-options)
- [Rolldown vs esbuild 2026](https://www.pkgpulse.com/blog/rolldown-vs-esbuild-rust-bundler-2026)

### Confidence: HIGH

All claims verified against official documentation and current (2026) sources.

---

## 2. AI Coding Tool Extension Models (2026)

### Claude Code

**Format:** Markdown files with YAML frontmatter in `.claude/` directory
**Status:** Stable, well-documented, plugin marketplace operational

**Directory structure:**

```
.claude/
  agents/          # Agent .md files
  skills/          # Skill directories with SKILL.md
  commands/        # Slash command .md files
  rules/           # Rule .md files with frontmatter
  hooks/           # Generated shell scripts
  settings.json    # IDE settings + hook config
  CLAUDE.md        # Project instructions
```

**Plugin format:**

```
my-plugin/
  .claude-plugin/
    plugin.json    # Manifest: name, description, version, author
  agents/          # Agent markdown files
  skills/          # Skill directories with SKILL.md
  commands/        # Slash command files
  hooks/
    hooks.json     # Hook configuration
  .mcp.json        # MCP server definitions
  .lsp.json        # LSP server configurations
  settings.json    # Default settings
```

**Key details:**

- Skills use `$ARGUMENTS` placeholder for user input
- Plugin skills are namespaced: `/plugin-name:skill-name`
- Frontmatter fields: `description`, `disable-model-invocation`
- Rule frontmatter: `description`, `globs`, `alwaysApply`
- Plugins can ship default `settings.json` including active agent
- Installation scopes: user (`~/.claude/plugins/`) or project (`.claude/plugins/`)
- Testing via `--plugin-dir` flag, hot reload via `/reload-plugins`

Sources:

- [Claude Code Plugin Docs](https://code.claude.com/docs/en/plugins)
- [Claude Code Plugin Reference](https://code.claude.com/docs/en/plugins-reference)

### Cursor

**Format:** Markdown/MDC files with YAML frontmatter in `.cursor/rules/`
**Status:** Stable, actively maintained, legacy `.cursorrules` deprecated

**Directory structure:**

```
.cursor/
  rules/
    react-patterns.mdc    # Rule with frontmatter
    api-guidelines.md     # Simple markdown rule
    frontend/
      components.md       # Nested organization supported
```

**Frontmatter fields:**
| Field | Type | Purpose |
|-------|------|---------|
| `description` | String | Helps agent decide relevance |
| `alwaysApply` | Boolean | When true, applies to every session |
| `globs` | Array | File path patterns for scoped application |

**Rule activation types:**

1. **Always Apply** (`alwaysApply: true`): Active in every chat session
2. **Apply Intelligently** (description only, no globs): Agent decides based on description
3. **Apply to Specific Files** (globs set): Activates when files match patterns
4. **Apply Manually**: Invoked via `@rule-name` mention

**Alternative:** `AGENTS.md` files (plain markdown, nested directories, more specific files take precedence)

**Key insight:** Cursor's frontmatter fields (`description`, `globs`, `alwaysApply`) are nearly identical to Claude Code's rule frontmatter. The compilation difference is primarily file extension (`.mdc` vs `.md`) and directory location (`.cursor/rules/` vs `.claude/rules/`).

Sources:

- [Cursor Rules Documentation](https://cursor.com/docs/rules)
- [Agent Rules Builder Guide](https://www.agentrulegen.com/guides/cursor-rules-guide)

### Windsurf (Codeium)

**Format:** Markdown files with YAML frontmatter in `.windsurf/rules/`
**Status:** Stable, actively maintained

**Directory structure:**

```
.windsurf/
  rules/
    my-rule.md     # Workspace rule with frontmatter
```

**Rule discovery locations:**

- Workspace: `.windsurf/rules/*.md`
- Subdirectories: `.windsurf/rules/` in any project subdirectory
- Git parents: Up to git root for git repos
- Global: `~/.codeium/windsurf/memories/global_rules.md`
- Enterprise/System: OS-specific paths

**Frontmatter fields:**
| Field | Type | Purpose |
|-------|------|---------|
| `trigger` | String | Activation mode |
| `globs` | Array | File patterns for glob-triggered rules |

**Activation modes (via `trigger` field):**
| Mode | Value | Behavior |
|------|-------|----------|
| Always On | `always_on` | Included in system prompt on every message |
| Model Decision | `model_decision` | Description visible; content loaded when relevant |
| Glob | `glob` | Activates when editing matching files |
| Manual | `manual` | Requires `@rule-name` mention |

**Character limits:** 12,000 per workspace rule, 6,000 for global rules.

**Key insight:** Windsurf uses `trigger` instead of `alwaysApply`, but the semantics map 1:1 to Cursor/Claude Code:

- `always_on` = `alwaysApply: true`
- `model_decision` = description only (Cursor's "Apply Intelligently")
- `glob` = `globs: [...]`
- `manual` = `@` mention (Cursor's manual rules)

Sources:

- [Windsurf Cascade Memories Docs](https://docs.windsurf.com/windsurf/cascade/memories)
- [Windsurf Rules Directory](https://windsurf.com/editor/directory)

### VS Code Copilot

**Format:** `.agent.md` files with YAML frontmatter in `.github/agents/` or `.claude/agents/`
**Status:** Preview (agent plugins), actively evolving

**Agent definition structure:**

```
.github/agents/
  code-reviewer.agent.md    # Custom agent definition
  planner.agent.md          # Another agent
```

**Frontmatter fields (`.agent.md`):**
| Field | Type | Purpose |
|-------|------|---------|
| `name` | String | Display name in agents dropdown |
| `description` | String | Brief explanation |
| `tools` | Array | Available tools (built-in, MCP, extension) |
| `agents` | Array | Subagents accessible (`*` for all) |
| `model` | String/Array | Model or prioritized fallback chain |
| `user-invocable` | Boolean | Dropdown visibility |
| `disable-model-invocation` | Boolean | Prevent subagent invocation |
| `handoffs` | Array | Workflow transitions to other agents |
| `hooks` | Object | Agent-scoped lifecycle hooks |
| `mcp-servers` | Object | MCP server configurations |

**Plugin format (agent plugins, preview):**

```
my-plugin/
  plugin.json              # Plugin metadata
  skills/
    test-runner/
      SKILL.md             # Skill instructions
  agents/
    reviewer.agent.md      # Custom agent
  hooks/
    hooks.json             # Hook configuration
  .mcp.json                # MCP server definitions
```

**Key insight:** VS Code Copilot explicitly supports Claude Code's `.claude/agents/` format, mapping Claude tool names to VS Code equivalents. This means Luca's Claude adapter output is already partially compatible with VS Code Copilot. The agent plugin format closely mirrors Claude Code's plugin format (plugin.json, skills/, agents/, hooks/, .mcp.json).

Sources:

- [VS Code Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [VS Code Agent Plugins (Preview)](https://code.visualstudio.com/docs/copilot/customization/agent-plugins)
- [VS Code Copilot February 2026 Release](https://github.blog/changelog/2026-03-06-github-copilot-in-visual-studio-code-v1-110-february-release/)

### IDE Format Comparison Table

| Feature                | Claude Code                    | Cursor                                | Windsurf                         | VS Code Copilot                             |
| ---------------------- | ------------------------------ | ------------------------------------- | -------------------------------- | ------------------------------------------- |
| **Rules directory**    | `.claude/rules/`               | `.cursor/rules/`                      | `.windsurf/rules/`               | `.github/copilot-instructions.md` or custom |
| **Rule file format**   | `.md` with YAML frontmatter    | `.mdc` or `.md` with YAML frontmatter | `.md` with YAML frontmatter      | `.md` or `.agent.md` with YAML frontmatter  |
| **Always-apply field** | `alwaysApply: true`            | `alwaysApply: true`                   | `trigger: always_on`             | N/A (agent-scoped)                          |
| **File-scoped field**  | `globs: [...]`                 | `globs: [...]`                        | `trigger: glob` + `globs: [...]` | N/A                                         |
| **Agent format**       | `.md` in `agents/`             | N/A (uses rules)                      | N/A (uses rules)                 | `.agent.md` in `.github/agents/`            |
| **Skill format**       | `SKILL.md` in `skills/{name}/` | N/A                                   | N/A                              | `SKILL.md` in `skills/{name}/`              |
| **Plugin manifest**    | `.claude-plugin/plugin.json`   | N/A                                   | N/A                              | `plugin.json` at root                       |
| **MCP support**        | `.mcp.json`                    | `.cursor/mcp.json`                    | Supported                        | `.mcp.json`                                 |
| **Hook support**       | `hooks.json` (16 events)       | N/A                                   | N/A                              | `hooks.json` (8+ events)                    |
| **Model selection**    | Via settings                   | Per-request                           | Per-request                      | `model` field in frontmatter                |
| **Stability**          | Stable                         | Stable                                | Stable                           | Preview (plugins)                           |
| **Nested directories** | Yes                            | Yes                                   | Yes                              | Yes                                         |

### Confidence: HIGH

All format details verified against official documentation fetched 2026-03-23.

---

## 3. Adapter Pattern Implementation Recommendations

### Registry Design

Luca's existing `plugin-registry.ts` already implements the core registry pattern correctly:

```typescript
// Current: Map<string, CompilerPlugin>
const registry = new Map<string, CompilerPlugin>([
  ["CLAUDE", claudePlugin],
  ["PLUGIN", pluginFormatPlugin],
]);
```

**Recommended evolution for the full adapter interface:**

```typescript
// Extended registry supporting full adapters
const adapterRegistry = new Map<string, Adapter>();

// Registration
export function registerAdapter(adapter: Adapter): void {
  adapterRegistry.set(adapter.config.name, adapter);
}

// Discovery (auto-detect from environment)
export function detectAdapter(projectRoot: string): Adapter {
  if (existsSync(join(projectRoot, ".claude"))) return getAdapter("claude");
  if (existsSync(join(projectRoot, ".cursor"))) return getAdapter("cursor");
  if (existsSync(join(projectRoot, ".windsurf"))) return getAdapter("windsurf");
  if (existsSync(join(projectRoot, ".github/agents")))
    return getAdapter("vscode");
  return getAdapter("claude"); // default
}

// Multi-target compilation
export function compileForAllTargets(
  entity: BaseAgent | BaseSkill | BaseRule,
  targets: string[] = listRegisteredAdapters(),
): Map<string, string> {
  const results = new Map<string, string>();
  for (const target of targets) {
    const adapter = getAdapter(target);
    results.set(target, adapter.compile(entity));
  }
  return results;
}
```

**Pattern precedents (from build tools):**

| Tool    | Registry Pattern                              | Hook Interface                           | Lesson for Luca                       |
| ------- | --------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| Rollup  | Array of plugins, called in order             | Named hooks (resolveId, load, transform) | Use named hooks for adapter lifecycle |
| Vite    | Extends Rollup array with Vite-specific hooks | Same + dev-specific hooks                | Extend base interface per adapter     |
| esbuild | Plugin array with namespace scoping           | onResolve, onLoad, onStart, onEnd        | Namespace adapters by format string   |

### Recommended Adapter Interface

Based on the research, the adapter interface should extend the existing `CompilerPlugin` with execution and emission capabilities:

```typescript
export interface Adapter {
  // Identity
  config: AdapterConfig;

  // Compilation (markdown/artifact generation)
  compileAgent: (agent: BaseAgent) => string | object;
  compileSkill: (skill: BaseSkill) => string | object;
  compileRule?: (rule: BaseRule) => string | object;

  // Execution (for headless/API mode)
  executeStep?: (
    step: WorkflowStep,
    context: ExecutionContext,
  ) => Promise<StepResult>;

  // Emission (write artifacts to disk)
  emit: (outputDir: string) => Promise<EmitResult>;

  // Discovery
  detect: (projectRoot: string) => boolean;
}
```

**Key design decisions:**

1. `compileRule` remains optional (not all platforms support individual rules)
2. `executeStep` is optional (IDE adapters don't execute, they compile)
3. `detect` enables auto-discovery from project structure
4. Return type is `string | object` to support both markdown (IDE adapters) and structured data (API adapter)

### Confidence: HIGH

Design derived from analysis of Rollup/Vite/esbuild official plugin APIs and Luca's existing codebase.

---

## 4. Headless AI Agent Execution

### Landscape (2026)

The headless AI agent execution space has matured significantly. Key players:

| Tool                    | Headless Support | Architecture              | CI/CD Integration                  |
| ----------------------- | ---------------- | ------------------------- | ---------------------------------- |
| Claude Code (`-p` flag) | Native           | CLI + Agent SDK           | GitHub Actions, GitLab CI          |
| Claude Agent SDK        | Native           | TypeScript/Python library | Any CI/CD                          |
| Cline CLI 2.0           | Full             | Terminal agent            | GitHub Actions, GitLab CI, Jenkins |
| Continue.dev            | Full             | Cloud-based async agents  | PR review automation               |
| Aider                   | Full             | CLI-based                 | Git integration                    |

**Key finding:** Over 60% of teams using Claude Code in enterprise leverage headless mode for at least one CI/CD workflow (per SFEIR Institute survey, 2026).

### Claude Code Headless Mode

Claude Code's headless mode (`claude -p`) is directly relevant because it is now **the same thing as the Agent SDK**:

```bash
# CLI mode (headless)
claude -p "Find and fix the bug in auth.py" --allowedTools "Read,Edit,Bash"

# Bare mode (no auto-discovery, faster startup)
claude --bare -p "Summarize this file" --allowedTools "Read"
```

**Output formats:**

- `text` (default): Plain text
- `json`: Structured JSON with result, session ID, metadata
- `stream-json`: Newline-delimited JSON for real-time streaming

**Key capability:** `--bare` mode skips all auto-discovery (hooks, skills, plugins, MCP servers, CLAUDE.md), running only with explicitly passed configuration. This is the correct mode for CI/CD and SDK usage.

Sources:

- [Claude Code Headless Docs](https://code.claude.com/docs/en/headless)
- [SFEIR Institute Cheatsheet](https://institute.sfeir.com/en/claude-code/claude-code-headless-mode-and-ci-cd/cheatsheet/)

### Confidence: HIGH

Verified against official Claude Code documentation.

---

## 5. Claude Agent SDK -- The API Adapter Foundation

### Overview

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`, v0.2.71 as of March 2026) provides the same tools, agent loop, and context management that power Claude Code, available as a programmatic TypeScript/Python library.

**This is the foundation for Luca's API adapter.** It eliminates the "tool bridge" problem entirely.

### Key API Surface

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Basic execution
for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    permissionMode: "acceptEdits",
  },
})) {
  if ("result" in message) console.log(message.result);
}
```

### Built-in Tools (No Bridge Needed)

The SDK includes all tools Luca uses:

| SDK Tool  | Luca Equivalent       | Notes                            |
| --------- | --------------------- | -------------------------------- |
| Read      | Read file             | Same semantics                   |
| Write     | Write file            | Same semantics                   |
| Edit      | Edit file             | Same semantics                   |
| Bash      | Shell commands        | Same semantics                   |
| Glob      | File pattern matching | Same semantics                   |
| Grep      | Content search        | Same semantics                   |
| WebSearch | Web search            | Same semantics                   |
| WebFetch  | Web fetch             | Same semantics                   |
| Agent     | Subagent spawning     | Maps to Luca's sub-agent pattern |

### Key Capabilities for Luca's API Adapter

**1. Subagent support:**

```typescript
const options = {
  allowedTools: ["Read", "Glob", "Grep", "Agent"],
  agents: {
    "code-reviewer": {
      description: "Expert code reviewer",
      prompt: "Analyze code quality and suggest improvements.",
      tools: ["Read", "Glob", "Grep"],
    },
  },
};
```

This maps directly to Luca's multi-agent architecture. Each Luca agent can be registered as a subagent.

**2. Session management:**

```typescript
// Capture session ID
let sessionId: string;
for await (const message of query({ prompt: "Start review" })) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
}

// Resume with context
for await (const message of query({
  prompt: "Continue review",
  options: { resume: sessionId },
})) {
  /* ... */
}
```

This maps to Luca's session context and state machine persistence.

**3. Hook support:**

```typescript
const options = {
  permissionMode: "acceptEdits",
  hooks: {
    PostToolUse: [
      {
        matcher: "Edit|Write",
        hooks: [
          async (input) => {
            // Custom post-edit logic
            return {};
          },
        ],
      },
    ],
  },
};
```

This maps to Luca's hook system -- SDK hooks use the same event names and matcher patterns as Claude Code hooks.

**4. MCP integration:**

```typescript
const options = {
  mcpServers: {
    myServer: { command: "npx", args: ["@my/mcp-server"] },
  },
};
```

This means Luca's MuninnDB MCP integration works unchanged in headless mode.

**5. Claude Code filesystem configuration:**

```typescript
const options = {
  settingSources: ["project"], // Load .claude/ directory config
};
```

Setting `settingSources: ['project']` makes the SDK load skills, agents, CLAUDE.md, and other Claude Code configuration from the project directory. This means the API adapter can optionally leverage Luca's compiled Claude Code artifacts.

**6. V2 Preview (send/stream pattern):**
The SDK has a V2 preview interface with `send()` and `stream()` patterns for multi-turn conversations, which may simplify the API adapter's conversation management.

### What the SDK Does NOT Provide

- **DAG workflow execution** -- Luca must orchestrate step ordering
- **Complexity routing** -- Luca must select models per agent
- **Convergence detection** -- Luca must determine when to halt
- **State machine** -- Luca must manage workflow state

These are Luca's differentiators and should remain in Luca's domain.

### Recommendation: Use Agent SDK as API Adapter Foundation

**Do:** Use `@anthropic-ai/claude-agent-sdk` as the execution engine for `src/adapters/api/`
**Do:** Map Luca agents to SDK subagent definitions
**Do:** Use SDK sessions for state continuity
**Do:** Use SDK hooks for post-step verification
**Don't:** Build a custom tool bridge -- the SDK has every tool
**Don't:** Reimplement the agent loop -- the SDK handles tool execution autonomously
**Don't:** Wrap the SDK in an abstraction layer -- call `query()` directly from `executeStep()`

### API Adapter Implementation Sketch

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

export function createApiAdapter(): Adapter {
  return {
    config: {
      name: "api",
      description: "Direct LLM API execution via Claude Agent SDK",
      supportedFeatures: {
        agents: true,
        skills: false, // Skills are IDE-specific
        rules: false, // Rules compiled into system prompt
        hooks: true, // Via SDK hooks
        workflows: true, // DAG step execution
        headless: true,
      },
    },

    compileAgent: (agent) => ({
      // Return structured config for SDK subagent registration
      name: agent.name,
      description: agent.description,
      prompt: agent.toClaudeFormat(), // Reuse existing compilation
      tools: mapToolPermissions(agent),
    }),

    executeStep: async (step, context) => {
      // Use Agent SDK's query() for step execution
      const messages = [];
      for await (const message of query({
        prompt: step.prompt,
        options: {
          allowedTools: step.tools,
          agents: step.subAgents,
          resume: context.sessionId, // State continuity
        },
      })) {
        messages.push(message);
        if ("result" in message) {
          return { success: true, result: message.result };
        }
      }
      return { success: false, messages };
    },

    emit: async () => {
      // API adapter doesn't emit files -- it executes directly
      return { filesWritten: 0 };
    },

    detect: (projectRoot) => {
      // API adapter is selected explicitly, not auto-detected
      return false;
    },
  };
}
```

### Confidence: HIGH

All API details verified against official Claude Agent SDK documentation (TypeScript reference, overview) fetched 2026-03-23.

Sources:

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Agent SDK GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Claude Agent SDK npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)

---

## Adapter Registry Design Recommendation

### Architecture

```
src/adapters/
  __schemas/
    adapter.schemas.ts          # Adapter interface, AdapterConfig, AdapterOutput
  __helpers/
    adapter-registry.ts         # Registry: register, get, list, detect
  claude/
    claude-adapter.ts           # Refactored from existing compilers
  api/
    api-adapter.ts              # Built on Claude Agent SDK
  cursor/
    cursor-adapter.ts           # .cursor/rules/*.mdc compilation
  windsurf/
    windsurf-adapter.ts         # .windsurf/rules/*.md compilation
  vscode/
    vscode-adapter.ts           # .github/agents/*.agent.md compilation
  index.ts                      # Barrel exports
```

### Registration Pattern

```typescript
// Functional factory pattern (per no-classes rule)
const adapterRegistry = new Map<string, Adapter>();

// Built-in adapters pre-registered
registerAdapter(createClaudeAdapter());
registerAdapter(createApiAdapter());

// Community adapters registered at runtime
registerAdapter(createCursorAdapter());
registerAdapter(createWindsurfAdapter());
registerAdapter(createVSCodeAdapter());
```

### Auto-Detection Priority

1. CLI flag (`--adapter=cursor`) -- highest priority
2. Config file (`.planning/config.json` `adapter` field)
3. Environment detection (check for `.claude/`, `.cursor/`, `.windsurf/`, `.github/agents/`)
4. Default to `claude`

### Multi-Target Compilation

`bun run build:all` should compile for all registered IDE adapters:

```typescript
export async function buildAll(projectRoot: string): Promise<void> {
  const adapters = listRegisteredAdapters().filter(
    (a) => a.config.supportedFeatures.agents,
  ); // IDE adapters only

  for (const adapter of adapters) {
    await adapter.emit(projectRoot);
  }
}
```

### Migration Path

1. **Phase 1:** Extract `createClaudeAdapter()` from existing `src/compilers/` (refactoring only, no behavior change)
2. **Phase 2:** Add `createApiAdapter()` using Claude Agent SDK (new capability)
3. **Phase 3:** Add `createCursorAdapter()` and `createWindsurfAdapter()` (format translation)
4. **Phase 4:** Add `createVSCodeAdapter()` (when agent plugins exit preview)

---

## Key Findings Summary

1. **Format convergence is real.** All four target platforms use markdown with YAML frontmatter. The compilation problem is format translation, not paradigm translation.

2. **Claude Agent SDK eliminates the tool bridge problem.** No need to reimplement Read/Write/Edit/Bash/Grep/Glob -- the SDK provides them all with identical semantics.

3. **VS Code Copilot already reads Claude Code format.** The `.claude/agents/` directory is explicitly supported, making VS Code the easiest non-Claude target.

4. **Cursor and Windsurf rule formats are nearly identical to Claude Code's.** The differences are: directory name (`.cursor/rules/` vs `.windsurf/rules/` vs `.claude/rules/`), file extension (`.mdc` vs `.md`), and activation field name (`alwaysApply` vs `trigger`).

5. **The existing plugin-registry.ts is the right foundation.** It already implements the Map-based registry with named compilation functions. Extending it to the full Adapter interface is incremental, not a rewrite.

6. **LSP's success validates the adapter approach.** By operating at the level of Luca's domain model (agent/skill/rule definitions) rather than platform-specific artifacts, adapters can survive platform API changes.

---

## Open Questions for Phase-Specific Research

1. **Cursor adapter stability:** Cursor's rules format is stable, but does Cursor support skills/agents beyond rules? If not, the Cursor adapter is rules-only.

2. **Windsurf character limits:** The 12,000 character limit per workspace rule may require Luca to split large agent definitions. How should the adapter handle this?

3. **VS Code agent plugin maturity:** Agent plugins are in preview (`chat.plugins.enabled`). What's the timeline for GA? Should Luca wait or build against the preview API?

4. **Agent SDK cost model:** The API adapter makes direct API calls (billed per token). How should Luca surface cost awareness to users? The SDK doesn't provide cost tracking natively.

5. **MCP compatibility across platforms:** All four platforms support MCP, but `.mcp.json` format varies slightly. Should the adapter normalize MCP configuration?

---

## All Sources

### Official Documentation (HIGH confidence)

- [Claude Code Plugin Docs](https://code.claude.com/docs/en/plugins)
- [Claude Code Headless Mode](https://code.claude.com/docs/en/headless)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Agent SDK GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Cursor Rules Documentation](https://cursor.com/docs/rules)
- [Windsurf Cascade Memories](https://docs.windsurf.com/windsurf/cascade/memories)
- [VS Code Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [VS Code Agent Plugins](https://code.visualstudio.com/docs/copilot/customization/agent-plugins)
- [LSP Official Site](https://microsoft.github.io/language-server-protocol/)
- [Rollup Plugin Development](https://rollupjs.org/plugin-development/)

### Ecosystem Sources (MEDIUM confidence)

- [LSP vs AI-Native Architectures](https://softwareguide.medium.com/language-server-protocol-lsp-vs-ai-native-architectures-f1bd313e6a87)
- [IDE Wars 2026](https://icloudcentral.com/the-ide-wars-heat-up-why-2026s-developer-tool-landscape-reveals-deeper-industry-fractures/)
- [Best AI Coding CLI Tools 2026](https://awesomeagents.ai/tools/best-ai-coding-cli-tools-2026/)
- [VS Code Copilot February 2026 Release](https://github.blog/changelog/2026-03-06-github-copilot-in-visual-studio-code-v1-110-february-release/)
- [SFEIR Institute CI/CD Cheatsheet](https://institute.sfeir.com/en/claude-code/claude-code-headless-mode-and-ci-cd/cheatsheet/)
- [Cline CLI 2.0](https://devops.com/cline-cli-2-0-turns-your-terminal-into-an-ai-agent-control-plane/)
- [Continue.dev Review 2026](https://vibecoding.app/blog/continue-dev-review)
- [Rolldown vs esbuild 2026](https://www.pkgpulse.com/blog/rolldown-vs-esbuild-rust-bundler-2026)

---

## Pre-Grooming Notes (Technical Validation)

**Validated:** 2026-03-23
**Validator:** tech-validator

### Verified Claims

- **Claude Agent SDK exists as `@anthropic-ai/claude-agent-sdk`** -- Verified. Package exists on npm. Renamed from `@anthropic-ai/claude-code`. Primary API is `query()` function. Source: [npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk), [Official Docs](https://platform.claude.com/docs/en/agent-sdk/typescript)
- **Claude Agent SDK provides Read, Write, Edit, Bash, Grep, Glob** -- Verified. The SDK `allowedTools` option accepts these tool names. The `tools` option can be set to `{ type: 'preset', preset: 'claude_code' }` to get all default tools. Examples in docs show `allowedTools: ["Read", "Write", "Edit"]`, `allowedTools: ["Read", "Grep", "Glob"]`. Source: [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- **Claude Agent SDK also provides WebSearch, WebFetch, Agent tools** -- Verified implicitly. The SDK documentation shows tool presets and the same tool surface as Claude Code. Source: [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- **Claude Agent SDK `query()` function pattern** -- Verified. `query({ prompt, options })` returns an `AsyncGenerator<SDKMessage>`. The for-await-of pattern shown in the research doc matches the official API. Source: [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- **Claude Agent SDK subagent support** -- Verified. The `agents` option accepts `Record<string, AgentDefinition>` where each agent has `description`, `prompt`, `tools`, `model`, `mcpServers`, `skills`, `maxTurns`. Source: [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- **Claude Agent SDK session management (resume)** -- Verified. The `resume` option takes a session ID string. `forkSession` option also available. Source: [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- **Claude Agent SDK hook support** -- Verified. The `hooks` option accepts `Partial<Record<HookEvent, HookCallbackMatcher[]>>`. Same event names as Claude Code. Source: [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- **Claude Agent SDK MCP integration** -- Verified. `mcpServers` option accepts stdio, SSE, HTTP, and SDK (in-process) server configs. Source: [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- **Claude Agent SDK `settingSources: ['project']`** -- Verified. Loads `.claude/` directory config including CLAUDE.md, settings.json. Source: [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- **Claude Agent SDK V2 preview** -- Verified. `send()` and `stream()` patterns for multi-turn conversations are documented as preview. Source: [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- **VS Code reads `.claude/agents/`** -- Verified. VS Code documentation explicitly states: "VS Code also detects `.md` files in the `.claude/agents` folder, following the Claude sub-agents format. This enables you to use the same agent definitions across VS Code and Claude Code." Source: [VS Code Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- **VS Code `.agent.md` format and frontmatter fields** -- Verified. Supports `name`, `description`, `tools`, `agents`, `model`, `handoffs`, `user-invocable`, `disable-model-invocation`, `hooks` (Preview), `mcp-servers`. Source: [VS Code Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- **VS Code agent plugin format mirrors Claude Code** -- Verified. Plugin structure includes `plugin.json`, `skills/`, `agents/`, `hooks/hooks.json`, `.mcp.json`. VS Code "auto-detects the plugin format and discovers the hook file automatically" supporting both Claude and Copilot formats. Source: [VS Code Agent Plugins](https://code.visualstudio.com/docs/copilot/customization/agent-plugins)
- **Cursor `.mdc` format with `alwaysApply` field** -- Verified. YAML frontmatter requires `description`, `globs`, `alwaysApply`. Rule types: Always Apply, Apply Intelligently, Apply to Specific Files, Apply Manually. Source: [Cursor Rules Documentation](https://cursor.com/docs/rules), [Cursor Community Forum](https://forum.cursor.com/t/a-deep-dive-into-cursor-rules-0-45/60721)
- **Windsurf `trigger` field and character limits** -- Verified. `trigger` values: `always_on`, `model_decision`, `glob`, `manual`. Character limits: 12,000 per workspace rule, 6,000 for global rules. Directory: `.windsurf/rules/*.md`. Source: [Windsurf Cascade Memories](https://docs.windsurf.com/windsurf/cascade/memories)
- **Windsurf activation mode semantic mapping to Cursor/Claude Code** -- Verified. The 1:1 mapping (`always_on` = `alwaysApply: true`, `model_decision` = description only, `glob` = `globs`, `manual` = `@` mention) is accurate. Source: Cross-referencing [Windsurf docs](https://docs.windsurf.com/windsurf/cascade/memories), [Cursor docs](https://cursor.com/docs/rules)
- **Rollup/Vite plugin hook-based architecture** -- Verified. Named hooks (resolveId, load, transform, renderChunk), plugin array registration, hook ordering. Source: [Rollup Plugin Development](https://rollupjs.org/plugin-development/)
- **Format convergence claim ("markdown with YAML frontmatter")** -- Verified. All four platforms (Claude Code, Cursor, Windsurf, VS Code Copilot) use markdown files with YAML frontmatter for agent/rule definitions. This is the core finding and it holds.

### Corrections

- **Claude Agent SDK version: "v0.2.71" is outdated** -- Latest version as of 2026-03-23 is **v0.2.81**. Minor point but worth noting if version-specific features are discussed. The API surface described is accurate for the 0.2.x line. Source: [npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- **VS Code hook events: "8+ events" needs refinement** -- VS Code supports exactly **8 hook events**: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, SubagentStart, SubagentStop, Stop. Claude Code supports 16 events. The "8+" in the comparison table is accurate but the doc should note this is exactly 8 (not "8 or more"). Source: [VS Code Hooks](https://code.visualstudio.com/docs/copilot/customization/hooks)
- **Hook protocol convergence claim needs nuance** -- The doc implies VS Code uses "the same protocol as Claude Code" for hooks. This is PARTIALLY TRUE but has important differences: (a) VS Code reads Claude Code hook configs from `.claude/settings.json`, (b) BUT tool names differ (`Write`/`Edit` in Claude Code vs `create_file`/`replace_string_in_file` in VS Code), (c) property naming differs (snake_case vs camelCase), (d) hook matchers are parsed but NOT applied in VS Code. The JSON stdin/stdout protocol structure is similar (timestamp, cwd, sessionId, hookEventName) but not identical. Source: [VS Code Hooks docs](https://code.visualstudio.com/docs/copilot/customization/hooks)
- **Cursor agent support: "N/A (uses rules)" is incomplete** -- Cursor supports `AGENTS.md` files (plain markdown, nested directories) as an alternative to rules. The comparison table lists this for rules but not for agents. Should note that Cursor has a lightweight agent concept via AGENTS.md, not just rules. Source: [Cursor Rules Documentation](https://cursor.com/docs/rules)
- **"60% of teams using Claude Code in enterprise leverage headless mode" stat** -- This is attributed to "SFEIR Institute survey, 2026" but the specific number (60%) should be treated as MEDIUM confidence. Survey methodology and sample size are unknown. The directional claim (enterprise adoption of headless mode is significant) is well-supported by multiple sources.
- **Cline CLI 2.0 "Full" headless support** -- Not independently verified. The doc lists this in the headless landscape table. Source link exists but was not fetched. MEDIUM confidence.
- **Continue.dev "Cloud-based async agents"** -- Not independently verified. MEDIUM confidence.

### Unverified Claims

- **"The Claude adapter compiles the DAG into the same prose format Claude Code expects"** -- This is a design intention, not a verified capability. The research doc presents it as fact in the API adapter sketch. Should be flagged as "proposed" since no DAG-to-prose compiler exists yet.
- **Vite 8.0 Rolldown replacement (March 2026)** -- The claim that Vite 8.0 replaced esbuild/Rollup with Rolldown is mentioned but not verified against official Vite release notes. The linked source (pkgpulse.com) is a blog, not official. MEDIUM confidence.
- **VS Code agent plugin GA timeline** -- Listed as an open question. Confirmed: still in preview as of March 2026, gated behind `chat.plugins.enabled`. No GA timeline found.

### Technical Pitfalls

- **VS Code hook tool name mismatch is a real adapter concern** -- The discovery that VS Code maps Claude tool names differently (Write -> create_file, Edit -> replace_string_in_file) means the adapter cannot simply copy hook scripts between platforms. Each adapter's hook emitter needs a tool name translation layer. This is not called out in the research doc's adapter interface design.
- **Agent SDK `allowedTools` does NOT restrict tools** -- Per the official docs: "This does not restrict Claude to only these tools; unlisted tools fall through to `permissionMode` and `canUseTool`. Use `disallowedTools` to block tools." This is a subtle but important distinction for the API adapter. The research doc's `executeStep` sketch passes `allowedTools` as if it restricts the tool set, but it actually auto-approves them. For security, use `disallowedTools` to block unwanted tools or `canUseTool` for fine-grained control. This needs correction in the adapter implementation sketch.
- **Windsurf 12,000 character limit** -- The research doc correctly flags this as an open question. For context: Luca's `lu.skill.ts` is 1,597 lines. If agents/skills exceed 12,000 characters, the Windsurf adapter will need to split or truncate. This should be addressed during Windsurf adapter design.
- **MCP config format varies across platforms** -- The research doc notes "All four platforms support MCP" and lists `.mcp.json` format. However, Cursor uses `.cursor/mcp.json` (different path), and the internal format may vary. The adapter registry should normalize MCP config as a first-class concern.
- **`detect()` race condition** -- The auto-detection pattern (`if existsSync(".claude") -> claude adapter`) fails when multiple IDE directories coexist (common for developers who use both Cursor and Claude Code). The priority order is defined but the research doc should note this is for single-adapter selection. Multi-target compilation (also documented) is the real solution.

### Cross-Check: Consistency with Design Doc (`adapter-architecture.md`)

- **CONSISTENT:** Domain structure (`src/adapters/` with per-adapter subdirectories) matches.
- **CONSISTENT:** Adapter interface shape (compileAgent, compileSkill, compileRule, executeStep, emit) aligns.
- **CONTRADICTION:** Design doc's `api/tool-bridge.ts` file vs. research doc's conclusion "No need to build a custom tool bridge -- the SDK has every tool." The research doc explicitly says to NOT build a tool bridge, but the design doc includes it in the directory structure. The design doc should be updated to remove `tool-bridge.ts`.
- **CONTRADICTION:** Design doc lists `hooks: z.boolean().default(false)` for API adapter features, but research doc shows the Agent SDK DOES support hooks. Research doc's sketch shows `hooks: true` for the API adapter. The design doc should update to reflect SDK hook support.
- **GAP:** Design doc's API adapter lists `compileSkill` as N/A and `compileRule` as N/A. Research doc concurs (skills are IDE-specific). However, the Agent SDK supports `skills` in `AgentDefinition` and `settingSources: ['project']` loads skills. The API adapter could potentially support skills via the SDK. This deserves discussion in grooming.
- **GAP:** Design doc's open question "How much of the tool bridge needs to be built?" is answered by the research: "None -- the SDK provides every tool." Update the design doc.
- **GAP:** Design doc mentions "Any provider" for API adapter multi-model support. Research doc focuses exclusively on Claude Agent SDK (Anthropic only). If multi-provider support is a requirement, the API adapter needs a different foundation than the Claude Agent SDK, or multiple API adapters (one per provider).
- **GAP:** Research doc details VS Code agent plugin format compatibility but design doc has no `vscode/` adapter in the directory structure. Research recommends Phase 4 for VS Code. Design doc should add a placeholder.

### Grooming Recommendations

1. **Remove `tool-bridge.ts` from design doc** -- Research conclusively shows the Claude Agent SDK provides all needed tools. This is the most impactful simplification.
2. **Update the `allowedTools` usage in the API adapter sketch** -- The current sketch implies `allowedTools` restricts tools, but per SDK docs it only auto-approves them. For security, use `disallowedTools` to block unwanted tools or `canUseTool` for fine-grained control.
3. **Add tool name translation concern to adapter interface** -- VS Code uses different tool names than Claude Code. Each adapter needs a tool mapping layer, especially for hook scripts.
4. **Clarify hook protocol compatibility** -- The convergence claim is partially true but differences in tool names, property naming, and matcher support mean hooks are NOT copy-paste portable. Flag this for the hook emitter design.
5. **Update Agent SDK version** from 0.2.71 to current (0.2.81) before finalizing.
6. **Resolve multi-provider question** -- If the API adapter must support non-Anthropic models, the Claude Agent SDK is insufficient. Decide scope before implementation.
7. **Add Windsurf character limit handling** to the adapter interface as a concern -- could affect compileAgent/compileRule output.
8. **Add `vscode/` placeholder to design doc** directory structure for completeness.
9. **Flag the "60% enterprise headless" stat** as needing source verification or removal before external presentation.
