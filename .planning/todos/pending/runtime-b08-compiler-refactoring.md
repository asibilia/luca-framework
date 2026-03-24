---
title: "Runtime B08: Compiler refactoring — delegate compile.ts to Claude adapter emitters"
area: adapters
created: 2026-03-24
source: docs/runtime-architecture/adapter-architecture.md
depends_on: [B03, B04, B05]
phase: runtime-b
estimated_files: 2
---

## Context

After the Claude adapter emitters are in place (B03, B04, B05), the existing `src/compilers/__helpers/compile.ts` must be refactored to delegate to them. This makes `compile.ts` a thin wrapper that preserves all existing exports and behavior while the real logic lives in the adapter.

The `plugin-registry.ts` is also updated to use the adapter's emitters for its built-in plugins.

**Critical constraint:** This is the highest-risk task in Phase B. The output of every function must be byte-identical before and after. The developer must run `bun run build:all` outside the Claude Code session and diff the output to verify.

## Task

### File 1: Modify `src/compilers/__helpers/compile.ts`

Replace the inline implementations of `compileAgentClaude`, `compileSkillClaude`, `compileRuleClaude`, `compileAgentPlugin`, `compileSkillPlugin`, and `compileRulePlugin` with delegations to the adapter emitters. The `buildAgentFrontmatter` private function is removed (it now lives in `agent-emitter.ts`).

**Before** (current file, 259 lines — see `/Users/alecsibilia/Github/luca-framework/src/compilers/__helpers/compile.ts`):

The file contains:

- `SupportedFormat` type (line 27)
- `validateFormat` function (lines 35-39)
- `buildAgentFrontmatter` private function (lines 49-75)
- `compileAgentClaude` function (lines 92-96)
- `compileSkillClaude` function (lines 104-106)
- `compileRuleClaude` function (lines 119-139)
- `compileAgentPlugin` function (lines 156-158)
- `compileSkillPlugin` function (lines 170-174)
- `compileRulePlugin` function (lines 186-188)
- `compileAgent` dispatcher (lines 204-215)
- `compileSkill` dispatcher (lines 227-238)
- `compileRule` dispatcher (lines 250-258)

**After** (refactored):

```typescript
/**
 * Functional compiler module for converting TypeScript entity definitions
 * to target format markdown.
 *
 * This module is a thin delegation layer. The real compilation logic lives
 * in src/adapters/claude/ (agent-emitter.ts, skill-emitter.ts, claude-adapter.ts).
 * This file preserves all existing exports for backward compatibility.
 *
 * @module
 */
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import type { BaseRule } from "~/rules/__schemas/rule.schemas";
import { emitAgentMarkdown } from "~/adapters/claude/agent-emitter";
import {
  emitSkillMarkdown,
  emitSkillPluginMarkdown,
} from "~/adapters/claude/skill-emitter";
import { createClaudeAdapter } from "~/adapters/claude/claude-adapter";

/**
 * Supported compilation output formats.
 *
 * - CLAUDE: Claude Code native format (.claude/ directory)
 * - PLUGIN: Claude Code plugin format (dist/plugin/ directory)
 */
export type SupportedFormat = "CLAUDE" | "PLUGIN";

/**
 * Validate that a format string is one of the supported formats.
 *
 * @param format - The format string to validate
 * @throws Error if the format is not "CLAUDE" or "PLUGIN"
 */
export function validateFormat(format: SupportedFormat): void {
  if (format !== "CLAUDE" && format !== "PLUGIN") {
    throw new Error(`Unsupported format: ${format}`);
  }
}

// Lazily-created Claude adapter instance for rule compilation
let _claudeAdapter: ReturnType<typeof createClaudeAdapter> | null = null;
function getClaudeAdapter() {
  if (!_claudeAdapter) {
    _claudeAdapter = createClaudeAdapter();
  }
  return _claudeAdapter;
}

// ---------------------------------------------------------------------------
// Claude format — delegates to adapter emitters
// ---------------------------------------------------------------------------

/**
 * Compile an agent definition to Claude-format markdown.
 *
 * Delegates to emitAgentMarkdown from src/adapters/claude/agent-emitter.ts.
 * Output is byte-identical to the previous inline implementation.
 *
 * @param agent - The agent instance to compile
 * @returns Compiled markdown string, prefixed with YAML frontmatter
 */
export function compileAgentClaude(agent: BaseAgent): string {
  return emitAgentMarkdown(agent);
}

/**
 * Compile a skill definition to Claude-format markdown.
 *
 * Delegates to emitSkillMarkdown from src/adapters/claude/skill-emitter.ts.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string
 */
export function compileSkillClaude(skill: BaseSkill): string {
  return emitSkillMarkdown(skill);
}

/**
 * Compile a rule definition to Claude-format markdown.
 *
 * Delegates to the Claude adapter's compileRule method.
 *
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
 */
export function compileRuleClaude(rule: BaseRule): string {
  return getClaudeAdapter().compileRule!(rule) as string;
}

// ---------------------------------------------------------------------------
// Plugin format — delegates to adapter emitters
// ---------------------------------------------------------------------------

/**
 * Compile an agent definition to plugin-compatible markdown.
 *
 * Plugin agents use the same format as Claude agents.
 *
 * @param agent - The agent instance to compile
 * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
 */
export function compileAgentPlugin(agent: BaseAgent): string {
  return emitAgentMarkdown(agent);
}

/**
 * Compile a skill definition to plugin-compatible markdown.
 *
 * Plugin skills add YAML frontmatter with a description field.
 *
 * @param skill - The skill instance to compile
 * @returns Compiled markdown string with description frontmatter
 */
export function compileSkillPlugin(skill: BaseSkill): string {
  return emitSkillPluginMarkdown(skill);
}

/**
 * Compile a rule definition to plugin-compatible markdown.
 *
 * Plugin rules use the same format as Claude rules.
 *
 * @param rule - The rule instance to compile
 * @returns Compiled markdown string
 */
export function compileRulePlugin(rule: BaseRule): string {
  return getClaudeAdapter().compileRule!(rule) as string;
}

// ---------------------------------------------------------------------------
// Format-dispatching functions (unchanged signatures)
// ---------------------------------------------------------------------------

/**
 * Compile an agent definition to the specified format.
 *
 * @param agent - The agent instance to compile
 * @param format - Target format: "CLAUDE" or "PLUGIN"
 * @returns Compiled markdown string
 * @throws Error if format is not supported
 */
export function compileAgent(
  agent: BaseAgent,
  format: SupportedFormat,
): string {
  validateFormat(format);
  switch (format) {
    case "CLAUDE":
      return compileAgentClaude(agent);
    case "PLUGIN":
      return compileAgentPlugin(agent);
  }
}

/**
 * Compile a skill definition to the specified format.
 *
 * @param skill - The skill instance to compile
 * @param format - Target format: "CLAUDE" or "PLUGIN"
 * @returns Compiled markdown string
 * @throws Error if format is not supported
 */
export function compileSkill(
  skill: BaseSkill,
  format: SupportedFormat,
): string {
  validateFormat(format);
  switch (format) {
    case "CLAUDE":
      return compileSkillClaude(skill);
    case "PLUGIN":
      return compileSkillPlugin(skill);
  }
}

/**
 * Compile a rule definition to the specified format.
 *
 * @param rule - The rule instance to compile
 * @param format - Target format: "CLAUDE" or "PLUGIN"
 * @returns Compiled markdown string
 * @throws Error if format is not supported
 */
export function compileRule(rule: BaseRule, format: SupportedFormat): string {
  validateFormat(format);
  switch (format) {
    case "CLAUDE":
      return compileRuleClaude(rule);
    case "PLUGIN":
      return compileRulePlugin(rule);
  }
}
```

### Key Changes Summary

| What                       | Before                                       | After                                            |
| -------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `buildAgentFrontmatter`    | Private function in compile.ts (lines 49-75) | Removed — lives in agent-emitter.ts              |
| `compileAgentClaude`       | Inline implementation (lines 92-96)          | Delegates to `emitAgentMarkdown`                 |
| `compileSkillClaude`       | Inline implementation (line 106)             | Delegates to `emitSkillMarkdown`                 |
| `compileRuleClaude`        | Inline implementation (lines 119-139)        | Delegates to `getClaudeAdapter().compileRule!()` |
| `compileAgentPlugin`       | Calls `compileAgentClaude` (line 157)        | Calls `emitAgentMarkdown`                        |
| `compileSkillPlugin`       | Inline implementation (lines 170-174)        | Delegates to `emitSkillPluginMarkdown`           |
| `compileRulePlugin`        | Calls `compileRuleClaude` (line 187)         | Delegates to `getClaudeAdapter().compileRule!()` |
| `formatFrontmatter` import | Used directly                                | Removed (adapter handles it)                     |

### File 2: Modify `src/compilers/__helpers/plugin-registry.ts`

Update the built-in plugin definitions to delegate to the adapter emitters instead of importing from compile.ts:

**Changes to the imports section** (lines 1-19):

Replace:

```typescript
import {
  compileAgentClaude,
  compileSkillClaude,
  compileRuleClaude,
  compileAgentPlugin,
  compileSkillPlugin,
  compileRulePlugin,
} from "./compile";
```

With:

```typescript
import {
  compileAgentClaude,
  compileSkillClaude,
  compileRuleClaude,
  compileAgentPlugin,
  compileSkillPlugin,
  compileRulePlugin,
} from "./compile";
```

**No actual change needed to plugin-registry.ts** — it already imports from `./compile`, and `compile.ts` now delegates to the adapters. The plugin registry works through the same compile.ts interface, which is the whole point of this refactoring.

### Import Tier Validation

The new import in `compile.ts` is:

- `src/compilers/__helpers/compile.ts` (T3) imports from `~/adapters/claude/agent-emitter` (T3)
- T3 importing T3 is same-tier — this is allowed per module-boundary rules

However, `compilers` and `adapters` are both T3 domains. The module-boundary rule says "T3 Build: terminal; imported by nothing in src/." Both are terminal. The question is whether T3-to-T3 cross-imports are allowed.

Per the rule clarification: "Same-tier imports (T1->T1) are permitted." And the enforcement script: `sourceTier < targetTier` is the violation condition. So T3->T3 passes (3 is not less than 3).

But: `adapters` is not yet in the `DOMAIN_TIER` map. That is handled in B10.

**Caution:** The entity isolation rule applies only to T2 entity domains (agents/skills/rules). Compilers and adapters are T3 infrastructure — cross-import between them is allowed.

## Verification

```bash
bunx --bun tsc --noEmit
```

**Critical verification (must be done manually by the developer outside Claude Code):**

```bash
# Step 1: Save current build output
bun run build:all
cp -r .claude/ /tmp/claude-before/

# Step 2: Apply the refactoring

# Step 3: Rebuild
bun run build:all

# Step 4: Diff — must be empty (byte-identical)
diff -r /tmp/claude-before/ .claude/
```

- All exported function signatures are unchanged
- All exported types are unchanged
- `src/compilers/index.ts` is NOT modified (all its exports still work)
- `compile.ts` no longer contains `buildAgentFrontmatter` or `formatFrontmatter` import
- `compile.ts` imports from `~/adapters/claude/agent-emitter`, `~/adapters/claude/skill-emitter`, `~/adapters/claude/claude-adapter`
- No TypeScript errors
- No classes used

## Notes

- This is the highest-risk task. The byte-identical output guarantee is non-negotiable. If the diff shows ANY difference, the refactoring has a bug.
- The `getClaudeAdapter()` lazy initialization pattern avoids creating the adapter at module load time, which could cause circular dependency issues.
- After this refactoring, `compile.ts` is ~140 lines (down from ~260) and contains zero compilation logic — only delegations and format dispatching.
- `bun run build:all` crashes Claude Code sessions (per MEMORY.md). The developer must run the verification steps manually.
