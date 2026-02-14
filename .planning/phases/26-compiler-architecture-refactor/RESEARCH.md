# Phase 26: Compiler Architecture Refactor — Research

## Executive Summary

The compiler subsystem consists of **4 classes** (1 abstract base + 3 concrete), consumed by **6 build scripts**, **1 public API entry point**, and tested by **4 test files**. The refactoring to factory functions is straightforward because:

1. **No mutable state** — compilers carry zero instance state; every method is pure
2. **Minimal shared logic** — BaseCompiler provides only `validateFormat()` (4 lines)
3. **Delegation pattern** — all compile methods delegate to entity `.toClaudeFormat()` / `.toCursorFormat()`
4. **PluginCompiler == ClaudeCompiler** for agents and rules (identical code), differs only for skills

The total blast radius is **12 files** (4 compiler sources + 4 tests + 3 build scripts + 1 public index).

---

## 1. Current Class Hierarchy

### 1.1 BaseCompiler (`src/compilers/base.compiler.ts`)

```typescript
export type SupportedFormat = "CURSOR" | "CLAUDE" | "PLUGIN";

export abstract class BaseCompiler {
  abstract compileAgent(agent: BaseAgent, format: SupportedFormat): string;
  abstract compileSkill(skill: BaseSkill, format: SupportedFormat): string;
  abstract compileRule(rule: BaseRule, format: SupportedFormat): string;

  protected validateFormat(format: SupportedFormat): void {
    if (format !== "CURSOR" && format !== "CLAUDE" && format !== "PLUGIN") {
      throw new Error(`Unsupported format: ${format}`);
    }
  }
}
```

**Key observations:**

- Abstract class with 3 abstract methods + 1 protected utility
- `validateFormat()` is the ONLY shared logic (a 3-way string check)
- No constructor, no instance state, no lifecycle methods
- The `format` parameter is passed to every method but only validated — the actual format-specific logic lives in the entity's `toClaudeFormat()` / `toCursorFormat()` methods

### 1.2 ClaudeCompiler (`src/compilers/claude.compiler.ts`)

```typescript
export class ClaudeCompiler extends BaseCompiler {
  compileAgent(agent: BaseAgent, format: SupportedFormat): string {
    this.validateFormat(format);
    const markdown = agent.toClaudeFormat();
    // Prepends YAML frontmatter if cognition OR context config present
    if (cognition || context) {
      /* build frontmatter */
    }
    return markdown;
  }

  compileSkill(skill: BaseSkill, format: SupportedFormat): string {
    this.validateFormat(format);
    return skill.toClaudeFormat();
  }

  compileRule(rule: BaseRule, format: SupportedFormat): string {
    this.validateFormat(format);
    return rule.toClaudeFormat();
  }
}
```

**Key observations:**

- `compileSkill` and `compileRule` are pure delegation (validate + delegate)
- `compileAgent` has extra logic: YAML frontmatter generation for cognition/context config
- Imports `formatFrontmatter` from `src/shared/utils`

### 1.3 CursorCompiler (`src/compilers/cursor.compiler.ts`)

```typescript
export class CursorCompiler extends BaseCompiler {
  compileAgent(agent: BaseAgent, format: SupportedFormat): string {
    this.validateFormat(format);
    return agent.toCursorFormat();
  }

  compileSkill(skill: BaseSkill, format: SupportedFormat): string {
    this.validateFormat(format);
    return skill.toCursorFormat();
  }

  compileRule(rule: BaseRule, format: SupportedFormat): string {
    this.validateFormat(format);
    return rule.toCursorFormat();
  }
}
```

**Key observations:**

- Simplest compiler — pure delegation for all 3 methods
- Every method: validate + call `entity.toCursorFormat()`

### 1.4 PluginCompiler (`src/compilers/plugin.compiler.ts`)

```typescript
export class PluginCompiler extends BaseCompiler {
  compileAgent(agent: BaseAgent, format: SupportedFormat): string {
    // IDENTICAL to ClaudeCompiler.compileAgent
  }

  compileSkill(skill: BaseSkill, format: SupportedFormat): string {
    this.validateFormat(format);
    const markdown = skill.toClaudeFormat();
    const frontmatter = formatFrontmatter({ description: skill.description });
    return `${frontmatter}\n\n${markdown}`;
  }

  compileRule(rule: BaseRule, format: SupportedFormat): string {
    // IDENTICAL to ClaudeCompiler.compileRule
  }
}
```

**Key observations:**

- `compileAgent` is copy-pasted from ClaudeCompiler (DRY violation)
- `compileRule` is copy-pasted from ClaudeCompiler (DRY violation)
- `compileSkill` is unique: adds YAML frontmatter with `description` field
- This was established in Phase 19 as the "plugin delegation pattern"

---

## 2. Entity Types (What Compilers Consume)

### 2.1 BaseAgent Interface (`src/agents/types/agent.types.ts`)

```typescript
export interface BaseAgent {
  readonly config: AgentConfig;
  readonly name: string;
  readonly description: string;
  toCursorFormat(): string;
  toClaudeFormat(): string;
}
```

### 2.2 BaseSkill Interface (`src/skills/types/skill.types.ts`)

```typescript
export interface BaseSkill {
  readonly config: SkillConfig;
  readonly name: string;
  readonly description: string;
  toCursorFormat(): string;
  toClaudeFormat(): string;
}
```

### 2.3 BaseRule Interface (`src/rules/types/rule.types.ts`)

```typescript
export interface BaseRule {
  readonly config: RuleConfig;
  readonly name: string;
  readonly description: string;
  toCursorFormat(): string;
  toClaudeFormat(): string;
}
```

**Key observation:** All three entity types share the same contract: `config`, `name`, `description`, `toCursorFormat()`, `toClaudeFormat()`. This is a strong candidate for a union type or shared interface.

### 2.4 Base Implementations (Also Classes — Separate Refactor Scope)

The entity base classes (`BaseAgentImpl`, `BaseSkillImpl`, `BaseRuleImpl`) are also classes but are **out of scope** for Phase 26. They implement `toCursorFormat()` / `toClaudeFormat()` by delegating to `src/shared/format.ts` utility functions. They also validate config via Zod schemas in constructors.

Note: The concrete agents/skills/rules (e.g., `CodeArchitectAgent extends BaseAgentImpl`) are also classes. Refactoring them is also out of scope for Phase 26.

---

## 3. Shared Utilities Used by Compilers

### 3.1 `formatFrontmatter()` (`src/shared/utils.ts`)

```typescript
export function formatFrontmatter(frontmatter: Record<string, unknown>): string;
```

Already a pure function. Used by `ClaudeCompiler.compileAgent()`, `PluginCompiler.compileAgent()`, and `PluginCompiler.compileSkill()` for YAML frontmatter generation.

### 3.2 `toCursorFormat()` / `toClaudeFormat()` (`src/shared/format.ts`)

```typescript
export function toCursorFormat(
  frontmatter: Record<string, unknown>,
  sections: Section[],
): string;
export function toClaudeFormat(heading: string, sections: Section[]): string;
```

Already pure functions. Used by entity base classes, not directly by compilers.

---

## 4. Registry Pattern

### 4.1 Agent Registry (`src/agents/index.ts`)

```typescript
export const agentRegistry = {
  "code-architect": CodeArchitectAgent, // class reference
  "code-developer": CodeDeveloperAgent,
  // ... 23 total entries
};
```

**Registry stores class constructors** (not instances). Consumers call `new (AgentClass as new () => BaseAgent)()` to instantiate.

### 4.2 Skill Registry (`src/skills/index.ts`)

```typescript
export const skillRegistry = {
  "code-lint": CodeLintSkill, // class reference
  // ... 41 total entries
};
```

### 4.3 Rule Registry (`src/rules/index.ts`)

```typescript
export const ruleRegistry = {
  "api-snake-case": ApiSnakeCaseRule, // class reference
  // ... 17 total entries
};
```

### 4.4 How Registries Interact With Compilers

In `build-shared.ts::generateAllOutputs()`:

```typescript
const cursorCompiler = new CursorCompiler();
const claudeCompiler = new ClaudeCompiler();
const pluginCompiler = new PluginCompiler();

// For each registry entry:
for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
  const instance = new (AgentClass as new () => BaseAgent)();
  claudeCompiler.compileAgent(instance, "CLAUDE");
  cursorCompiler.compileAgent(instance, "CURSOR");
  pluginCompiler.compileAgent(instance, "CLAUDE");
}
```

Pattern: instantiate entity class -> pass instance to compiler method -> get string output.

---

## 5. All Consumers of Compiler Modules

### 5.1 `scripts/build-shared.ts` (PRIMARY CONSUMER)

- **Imports:** `CursorCompiler`, `ClaudeCompiler`, `PluginCompiler`
- **Usage:** `generateAllOutputs()` creates instances of all 3 compilers, iterates registries, calls compile methods
- **Lines 462-682:** The main compilation loop
- **Impact:** HIGHEST — this is the single source of truth for all build output

### 5.2 `scripts/build-claude.ts`

- **Imports:** `ClaudeCompiler`
- **Usage:** `const compiler = new ClaudeCompiler();` then iterates registries
- **Pattern:** Same as build-shared but Claude-only

### 5.3 `scripts/build-cursor.ts`

- **Imports:** `CursorCompiler`
- **Usage:** `const compiler = new CursorCompiler();` then iterates registries
- **Pattern:** Same as build-shared but Cursor-only

### 5.4 `scripts/check-drift.ts`

- **Imports:** None (uses `generateAllOutputs` from build-shared which internally uses compilers)
- **Impact:** Indirect only via `generateAllOutputs()`

### 5.5 `scripts/check-drift.test.ts`

- **Imports:** None (uses `generateAllOutputs` from build-shared)
- **Impact:** Indirect only via `generateAllOutputs()`

### 5.6 `index.ts` (Public API)

```typescript
export { BaseCompiler } from "./src/compilers/base.compiler";
export type { SupportedFormat } from "./src/compilers/base.compiler";
export { CursorCompiler } from "./src/compilers/cursor.compiler";
export { ClaudeCompiler } from "./src/compilers/claude.compiler";
```

- **BREAKING CHANGE RISK:** PluginCompiler is NOT exported from public API
- BaseCompiler, CursorCompiler, ClaudeCompiler ARE exported
- SupportedFormat type is exported

---

## 6. All Test Files

### 6.1 `__tests__/src/compilers/base-compiler.test.ts`

- Creates `TestCompiler extends BaseCompiler` to test `validateFormat()`
- **3 tests:** accepts CURSOR, accepts CLAUDE, rejects unknown
- **Impact:** Must be rewritten — tests the abstract class pattern directly

### 6.2 `__tests__/src/compilers/claude-compiler.test.ts`

- `const compiler = new ClaudeCompiler();`
- Uses `TestAgent extends BaseAgentImpl`, `TestSkill extends BaseSkillImpl`, `TestRule extends BaseRuleImpl`
- **5 tests:** delegation (3), format rejection (1), output format (1)
- **Impact:** Must update instantiation pattern

### 6.3 `__tests__/src/compilers/cursor-compiler.test.ts`

- `const compiler = new CursorCompiler();`
- Same test entity pattern as claude-compiler.test.ts
- **5 tests:** delegation (3), format rejection (1), output format (1)
- **Impact:** Must update instantiation pattern

### 6.4 `src/compilers/plugin.compiler.test.ts`

- `const pluginCompiler = new PluginCompiler();`
- `const claudeCompiler = new ClaudeCompiler();`
- Uses `TestAgent extends BaseAgentImpl`, `TestSkill extends BaseSkillImpl`, `TestRule extends BaseRuleImpl`
- **10 tests:** agent compilation (4), skill compilation (1), rule compilation (1), parity with ClaudeCompiler (4)
- **Impact:** Must update instantiation pattern, parity tests remain valid

### 6.5 `__tests__/scripts/build-output.test.ts`

- Does NOT import compilers — tests output files on disk
- **Impact:** None (tests build results, not compiler internals)

---

## 7. Proposed Factory-Function API

### 7.1 Core Design Principles

1. **One function per entity type per format** — simple, composable
2. **Shared logic extracted to utility functions** — DRY
3. **Format validation as a standalone utility** — reusable
4. **No classes, no `this`, no `new`** — per no-classes rule

### 7.2 Target API — `src/compilers/compile.ts` (Single File)

```typescript
export type SupportedFormat = "CURSOR" | "CLAUDE" | "PLUGIN";

/** Validate format string, throw on unsupported */
export function validateFormat(format: SupportedFormat): void { ... }

/** Build YAML frontmatter for agents with cognition/context config */
function buildAgentFrontmatter(agent: BaseAgent): string | null { ... }

// --- Claude format ---
export function compileAgentClaude(agent: BaseAgent): string { ... }
export function compileSkillClaude(skill: BaseSkill): string { ... }
export function compileRuleClaude(rule: BaseRule): string { ... }

// --- Cursor format ---
export function compileAgentCursor(agent: BaseAgent): string { ... }
export function compileSkillCursor(skill: BaseSkill): string { ... }
export function compileRuleCursor(rule: BaseRule): string { ... }

// --- Plugin format ---
export function compileAgentPlugin(agent: BaseAgent): string { ... }
export function compileSkillPlugin(skill: BaseSkill): string { ... }
export function compileRulePlugin(rule: BaseRule): string { ... }
```

### 7.3 Alternative: Single `compile()` with format dispatch

```typescript
export function compileAgent(
  agent: BaseAgent,
  format: SupportedFormat,
): string {
  validateFormat(format);
  switch (format) {
    case "CLAUDE":
      return compileAgentClaude(agent);
    case "CURSOR":
      return compileAgentCursor(agent);
    case "PLUGIN":
      return compileAgentPlugin(agent);
  }
}
```

**Recommendation:** Use **both** patterns. Export the per-format functions for direct use, plus unified `compileAgent()` / `compileSkill()` / `compileRule()` dispatchers for consumers that pass dynamic format strings.

### 7.4 Shared Logic Extraction

The `buildAgentFrontmatter()` function eliminates the ClaudeCompiler/PluginCompiler duplication:

```typescript
function buildAgentFrontmatter(agent: BaseAgent): string | null {
  const cognition = agent.config.frontmatter.cognition;
  const context = agent.config.frontmatter.context;

  if (!cognition && !context) return null;

  const data: Record<string, unknown> = { name: agent.name };
  if (cognition) {
    data.cognition = {
      default_tier: cognition.default_tier,
      promotable_to: cognition.promotable_to,
      memory_tags: cognition.memory_tags,
    };
  }
  if (context) {
    data.context = {
      default_tier: context.default_tier,
      promotable_to: context.promotable_to,
      isolation: context.isolation,
    };
  }

  return formatFrontmatter(data);
}
```

---

## 8. Consumer Migration Plan

### 8.1 `scripts/build-shared.ts`

**Before:**

```typescript
const cursorCompiler = new CursorCompiler();
const claudeCompiler = new ClaudeCompiler();
const pluginCompiler = new PluginCompiler();
// ...
claudeCompiler.compileAgent(instance, "CLAUDE");
```

**After:**

```typescript
import {
  compileAgent,
  compileSkill,
  compileRule,
} from "../src/compilers/compile";
// ...
compileAgent(instance, "CLAUDE");
compileAgent(instance, "CURSOR");
compileAgent(instance, "PLUGIN");
```

### 8.2 `scripts/build-claude.ts`

**Before:** `const compiler = new ClaudeCompiler();`
**After:** `import { compileAgent, compileSkill, compileRule } from "../src/compilers/compile";`

### 8.3 `scripts/build-cursor.ts`

**Before:** `const compiler = new CursorCompiler();`
**After:** `import { compileAgent, compileSkill, compileRule } from "../src/compilers/compile";`

### 8.4 `index.ts` (Public API)

**Before:**

```typescript
export { BaseCompiler } from "./src/compilers/base.compiler";
export type { SupportedFormat } from "./src/compilers/base.compiler";
export { CursorCompiler } from "./src/compilers/cursor.compiler";
export { ClaudeCompiler } from "./src/compilers/claude.compiler";
```

**After:**

```typescript
export {
  compileAgent,
  compileSkill,
  compileRule,
  compileAgentClaude,
  compileAgentCursor,
  compileAgentPlugin,
  compileSkillClaude,
  compileSkillCursor,
  compileSkillPlugin,
  compileRuleClaude,
  compileRuleCursor,
  compileRulePlugin,
  validateFormat,
} from "./src/compilers/compile";
export type { SupportedFormat } from "./src/compilers/compile";
```

**BREAKING CHANGE:** `BaseCompiler`, `CursorCompiler`, `ClaudeCompiler` classes will no longer be exported. This is a **public API change** but acceptable because:

- The framework is pre-1.0 (semver allows breaking changes)
- The new API is simpler and more composable
- No known external consumers of these classes

---

## 9. File Inventory and Blast Radius

### Files to CREATE (1):

| File                       | Purpose                        |
| -------------------------- | ------------------------------ |
| `src/compilers/compile.ts` | New functional compiler module |

### Files to MODIFY (8):

| File                                              | Change                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `scripts/build-shared.ts`                         | Replace class instantiation with function calls                             |
| `scripts/build-claude.ts`                         | Replace class instantiation with function calls                             |
| `scripts/build-cursor.ts`                         | Replace class instantiation with function calls                             |
| `index.ts`                                        | Replace class exports with function exports                                 |
| `__tests__/src/compilers/base-compiler.test.ts`   | Rewrite to test `validateFormat()` function                                 |
| `__tests__/src/compilers/claude-compiler.test.ts` | Replace `new ClaudeCompiler()` with function calls                          |
| `__tests__/src/compilers/cursor-compiler.test.ts` | Replace `new CursorCompiler()` with function calls                          |
| `src/compilers/plugin.compiler.test.ts`           | Replace `new PluginCompiler()` / `new ClaudeCompiler()` with function calls |

### Files to DELETE (4):

| File                               | Reason                   |
| ---------------------------------- | ------------------------ |
| `src/compilers/base.compiler.ts`   | Replaced by `compile.ts` |
| `src/compilers/claude.compiler.ts` | Replaced by `compile.ts` |
| `src/compilers/cursor.compiler.ts` | Replaced by `compile.ts` |
| `src/compilers/plugin.compiler.ts` | Replaced by `compile.ts` |

### Files UNAFFECTED:

| File                                     | Why                                                     |
| ---------------------------------------- | ------------------------------------------------------- |
| `src/compilers/plugin.types.ts`          | No compiler class references                            |
| `scripts/build-utils.ts`                 | No compiler references                                  |
| `scripts/check-drift.ts`                 | Uses `generateAllOutputs()`, no direct compiler imports |
| `scripts/check-drift.test.ts`            | Uses `generateAllOutputs()`, no direct compiler imports |
| `__tests__/scripts/build-output.test.ts` | Tests disk output, not compiler internals               |
| All entity source files                  | Entities are consumers OF compilers, not vice versa     |
| All registry files                       | Registries are independent of compiler implementation   |

### Total Blast Radius: **13 files** (1 create + 8 modify + 4 delete)

---

## 10. Risks and Dependencies

### 10.1 Public API Breaking Change (LOW RISK)

The `index.ts` exports `BaseCompiler`, `CursorCompiler`, `ClaudeCompiler` as the public API. Removing these is technically a breaking change. However:

- No known external consumers (this is the Luca Framework's own build system)
- Pre-1.0 semver allows breaking changes
- The `packages/luca-framework/` package may re-export these — needs verification

### 10.2 Test Entity Classes (OUT OF SCOPE)

Test files create `TestAgent extends BaseAgentImpl` etc. These test helpers use classes but refactoring them is **out of scope** for this phase (they test entity behavior, not compiler behavior). The entity base classes (`BaseAgentImpl`, `BaseSkillImpl`, `BaseRuleImpl`) are also classes and are a separate refactor target.

### 10.3 PluginCompiler/ClaudeCompiler Code Duplication (RESOLVED)

The `compileAgent()` code for PluginCompiler and ClaudeCompiler is identical. The new `buildAgentFrontmatter()` utility function resolves this DRY violation.

### 10.4 Format Parameter Semantics

Currently, `PluginCompiler.compileAgent(agent, "CLAUDE")` is called with format `"CLAUDE"` despite being a plugin compilation. This works because the plugin format IS the Claude format for agents. In the new API, `compileAgentPlugin()` makes the intent clearer without requiring a format parameter at all.

### 10.5 Build Pipeline Regression

The `check-drift.test.ts` test suite will catch any regression in build output. It compares generated output byte-for-byte against committed files. Running `bun test` after the refactor will validate end-to-end correctness.

---

## 11. DRY Violations to Fix

### 11.1 ClaudeCompiler.compileAgent === PluginCompiler.compileAgent

These two methods are **identical** (27 lines each). The factory-function approach extracts the shared `buildAgentFrontmatter()` helper.

### 11.2 ClaudeCompiler.compileRule === PluginCompiler.compileRule

Both are simple delegation: `validate + entity.toClaudeFormat()`. Unified in `compileRuleClaude()`.

### 11.3 Format Validation Pattern

Every compile method starts with `this.validateFormat(format)`. In the new API, the dispatch function handles validation once, and per-format functions don't need it.

---

## 12. Implementation Order

1. **Create `src/compilers/compile.ts`** — new functional module with all 9 per-format functions + 3 dispatchers + `validateFormat` + `buildAgentFrontmatter`
2. **Update `scripts/build-shared.ts`** — replace class usage with function imports
3. **Update `scripts/build-claude.ts`** — replace class usage
4. **Update `scripts/build-cursor.ts`** — replace class usage
5. **Update `index.ts`** — replace class exports with function exports
6. **Update all 4 test files** — replace class instantiation with function calls
7. **Delete 4 old compiler class files**
8. **Run `bun test`** — verify all tests pass
9. **Run `bun run build:all`** — verify build output unchanged
10. **Run drift check** — verify `check-drift.ts` passes

---

## 13. Entity Type Summary (Reference)

| Entity | Interface   | Base Impl       | Registry Size | Luca-Specific           |
| ------ | ----------- | --------------- | ------------- | ----------------------- |
| Agent  | `BaseAgent` | `BaseAgentImpl` | 23 general    | lu-executor, lu-planner |
| Skill  | `BaseSkill` | `BaseSkillImpl` | 41 general    | lu                      |
| Rule   | `BaseRule`  | `BaseRuleImpl`  | 17 general    | lu-workflow             |

All entities provide `toCursorFormat()` and `toClaudeFormat()` methods. Compilers delegate to these methods and optionally add frontmatter.

---

## 14. Appendix: Complete Import Graph

```
src/compilers/base.compiler.ts
  <- src/compilers/claude.compiler.ts
  <- src/compilers/cursor.compiler.ts
  <- src/compilers/plugin.compiler.ts
  <- __tests__/src/compilers/base-compiler.test.ts
  <- index.ts

src/compilers/claude.compiler.ts
  <- scripts/build-shared.ts
  <- scripts/build-claude.ts
  <- src/compilers/plugin.compiler.test.ts
  <- __tests__/src/compilers/claude-compiler.test.ts
  <- index.ts

src/compilers/cursor.compiler.ts
  <- scripts/build-shared.ts
  <- scripts/build-cursor.ts
  <- __tests__/src/compilers/cursor-compiler.test.ts
  <- index.ts

src/compilers/plugin.compiler.ts
  <- scripts/build-shared.ts
  <- src/compilers/plugin.compiler.test.ts

src/compilers/plugin.types.ts
  <- scripts/build-shared.ts
  <- scripts/plugin-spec-structure.test.ts
  <- scripts/plugin-spec-e2e.test.ts
  (NO dependency on compiler classes)
```
