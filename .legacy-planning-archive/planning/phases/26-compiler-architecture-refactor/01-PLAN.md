---
id: "26-01"
title: "Create functional compiler module and rewrite tests"
wave: 1
requirements: ["ARCH-01", "CLEAN-02"]
---

# Plan 26-01: Create Functional Compiler Module and Rewrite Tests

## Objective

Replace the 4-class compiler hierarchy (`BaseCompiler`, `ClaudeCompiler`, `CursorCompiler`, `PluginCompiler`) with a single functional module `src/compilers/compile.ts` containing per-format compile functions, format-dispatching functions, and a shared `buildAgentFrontmatter()` helper that eliminates the Claude/Plugin DRY violation. Rewrite all 4 test files to exercise the new functional API. The old class files remain on disk during this wave (deleted in Wave 2) so that consumers still import from them until they are migrated.

## Context

@src/compilers/base.compiler.ts -- abstract class with `validateFormat()` only (lines 10-20)
@src/compilers/claude.compiler.ts -- compile methods with frontmatter logic (lines 17-63)
@src/compilers/cursor.compiler.ts -- pure delegation to entity `toCursorFormat()` (lines 10-25)
@src/compilers/plugin.compiler.ts -- copy-paste of Claude for agents/rules, unique skill compilation (lines 38-127)
@src/shared/utils.ts -- `formatFrontmatter()` pure function (line 6)
@**tests**/src/compilers/base-compiler.test.ts -- tests `validateFormat` via TestCompiler subclass (51 lines)
@**tests**/src/compilers/claude-compiler.test.ts -- tests ClaudeCompiler delegation (59 lines)
@**tests**/src/compilers/cursor-compiler.test.ts -- tests CursorCompiler delegation (60 lines)
@src/compilers/plugin.compiler.test.ts -- tests PluginCompiler with parity checks (307 lines)

## Tasks

### Task 1: Create `src/compilers/compile.ts`

**Goal:** Create the new functional compiler module that replaces all 4 class files. Exports 9 per-format functions, 3 format-dispatching functions, 1 `validateFormat` utility, and 1 `SupportedFormat` type. The internal `buildAgentFrontmatter()` helper eliminates the ClaudeCompiler/PluginCompiler code duplication (CLEAN-02).

**Files:** `src/compilers/compile.ts` (NEW)

**Steps:**

1. Create `src/compilers/compile.ts` with the following content:

   ````typescript
   /**
    * Functional compiler module for converting TypeScript entity definitions
    * to target format markdown.
    *
    * Replaces the BaseCompiler class hierarchy (BaseCompiler, ClaudeCompiler,
    * CursorCompiler, PluginCompiler) with composable pure functions.
    *
    * Each entity type (agent, skill, rule) has:
    * - Per-format functions: compileAgentClaude(), compileAgentCursor(), compileAgentPlugin()
    * - A format-dispatching function: compileAgent(entity, format)
    *
    * The internal buildAgentFrontmatter() helper consolidates the duplicated
    * YAML frontmatter logic that was previously copy-pasted between
    * ClaudeCompiler and PluginCompiler.
    *
    * @module
    */
   import type { BaseAgent } from "../agents/types/agent.types";
   import type { BaseSkill } from "../skills/types/skill.types";
   import type { BaseRule } from "../rules/types/rule.types";
   import { formatFrontmatter } from "../shared/utils";

   /**
    * Supported compilation output formats.
    *
    * - CLAUDE: Claude Code native format (.claude/ directory)
    * - CURSOR: Cursor IDE format (.cursor/ directory)
    * - PLUGIN: Claude Code plugin format (dist/plugin/ directory)
    */
   export type SupportedFormat = "CURSOR" | "CLAUDE" | "PLUGIN";

   /**
    * Validate that a format string is one of the supported formats.
    *
    * @param format - The format string to validate
    * @throws Error if the format is not "CURSOR", "CLAUDE", or "PLUGIN"
    *
    * @example
    * ```typescript
    * validateFormat("CLAUDE"); // ok
    * validateFormat("UNKNOWN"); // throws "Unsupported format: UNKNOWN"
    * ```
    */
   export function validateFormat(format: SupportedFormat): void {
     if (format !== "CURSOR" && format !== "CLAUDE" && format !== "PLUGIN") {
       throw new Error(`Unsupported format: ${format}`);
     }
   }

   /**
    * Build YAML frontmatter for agents with cognition and/or context config.
    *
    * Returns null if the agent has neither cognition nor context configuration,
    * indicating no frontmatter should be prepended to the markdown output.
    *
    * This is an internal helper that consolidates the identical frontmatter
    * logic previously duplicated in ClaudeCompiler and PluginCompiler.
    *
    * @param agent - The agent instance to extract frontmatter config from
    * @returns YAML frontmatter string, or null if no config present
    */
   function buildAgentFrontmatter(agent: BaseAgent): string | null {
     const cognition = agent.config.frontmatter.cognition;
     const context = agent.config.frontmatter.context;

     if (!cognition && !context) return null;

     const frontmatterData: Record<string, unknown> = {
       name: agent.name,
     };

     if (cognition) {
       frontmatterData.cognition = {
         default_tier: cognition.default_tier,
         promotable_to: cognition.promotable_to,
         memory_tags: cognition.memory_tags,
       };
     }

     if (context) {
       frontmatterData.context = {
         default_tier: context.default_tier,
         promotable_to: context.promotable_to,
         isolation: context.isolation,
       };
     }

     return formatFrontmatter(frontmatterData);
   }

   // ---------------------------------------------------------------------------
   // Claude format
   // ---------------------------------------------------------------------------

   /**
    * Compile an agent definition to Claude format markdown.
    *
    * If the agent has cognition or context configuration in its frontmatter,
    * YAML frontmatter is prepended to the markdown body. This enables
    * lu-cognition and lu-context to parse compiled .md files and extract
    * config at runtime without importing TypeScript modules.
    *
    * @param agent - The agent instance to compile
    * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
    */
   export function compileAgentClaude(agent: BaseAgent): string {
     const markdown = agent.toClaudeFormat();
     const frontmatter = buildAgentFrontmatter(agent);
     if (frontmatter) {
       return `${frontmatter}\n\n${markdown}`;
     }
     return markdown;
   }

   /**
    * Compile a skill definition to Claude format markdown.
    *
    * @param skill - The skill instance to compile
    * @returns Compiled markdown string
    */
   export function compileSkillClaude(skill: BaseSkill): string {
     return skill.toClaudeFormat();
   }

   /**
    * Compile a rule definition to Claude format markdown.
    *
    * @param rule - The rule instance to compile
    * @returns Compiled markdown string
    */
   export function compileRuleClaude(rule: BaseRule): string {
     return rule.toClaudeFormat();
   }

   // ---------------------------------------------------------------------------
   // Cursor format
   // ---------------------------------------------------------------------------

   /**
    * Compile an agent definition to Cursor format markdown.
    *
    * @param agent - The agent instance to compile
    * @returns Compiled markdown string with YAML frontmatter
    */
   export function compileAgentCursor(agent: BaseAgent): string {
     return agent.toCursorFormat();
   }

   /**
    * Compile a skill definition to Cursor format markdown.
    *
    * @param skill - The skill instance to compile
    * @returns Compiled markdown string with YAML frontmatter
    */
   export function compileSkillCursor(skill: BaseSkill): string {
     return skill.toCursorFormat();
   }

   /**
    * Compile a rule definition to Cursor format markdown.
    *
    * @param rule - The rule instance to compile
    * @returns Compiled markdown string with YAML frontmatter
    */
   export function compileRuleCursor(rule: BaseRule): string {
     return rule.toCursorFormat();
   }

   // ---------------------------------------------------------------------------
   // Plugin format
   // ---------------------------------------------------------------------------

   /**
    * Compile an agent definition to plugin-compatible markdown.
    *
    * Produces the same output as compileAgentClaude: if the agent has cognition
    * or context configuration in its frontmatter, YAML frontmatter is prepended
    * to the markdown body. The plugin runtime consumes the same markdown dialect
    * as Claude's native .claude/ directory layout.
    *
    * @param agent - The agent instance to compile
    * @returns Compiled markdown string, optionally prefixed with YAML frontmatter
    */
   export function compileAgentPlugin(agent: BaseAgent): string {
     return compileAgentClaude(agent);
   }

   /**
    * Compile a skill definition to plugin-compatible markdown.
    *
    * Plugin SKILL.md files use Claude-format H1/H2 markdown body, but per
    * the official Claude Code plugin spec they also require YAML frontmatter
    * with at least a `description` field for discoverability.
    *
    * @param skill - The skill instance to compile
    * @returns Compiled markdown string with description frontmatter
    */
   export function compileSkillPlugin(skill: BaseSkill): string {
     const markdown = skill.toClaudeFormat();
     const frontmatter = formatFrontmatter({ description: skill.description });
     return `${frontmatter}\n\n${markdown}`;
   }

   /**
    * Compile a rule definition to plugin-compatible markdown.
    *
    * Note: Claude Code plugins cannot inject rules into the host project's
    * rule resolution pipeline. This method is provided for completeness --
    * plugins may bundle rule files as reference documentation.
    *
    * @param rule - The rule instance to compile
    * @returns Compiled markdown string
    */
   export function compileRulePlugin(rule: BaseRule): string {
     return compileRuleClaude(rule);
   }

   // ---------------------------------------------------------------------------
   // Format-dispatching functions
   // ---------------------------------------------------------------------------

   /**
    * Compile an agent definition to the specified format.
    *
    * Validates the format, then dispatches to the appropriate per-format
    * compile function. Use this when the format is determined at runtime.
    *
    * @param agent - The agent instance to compile
    * @param format - Target format ("CLAUDE", "CURSOR", or "PLUGIN")
    * @returns Compiled markdown string
    * @throws Error if format is unsupported
    *
    * @example
    * ```typescript
    * const markdown = compileAgent(myAgent, "CLAUDE");
    * ```
    */
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

   /**
    * Compile a skill definition to the specified format.
    *
    * Validates the format, then dispatches to the appropriate per-format
    * compile function. Use this when the format is determined at runtime.
    *
    * @param skill - The skill instance to compile
    * @param format - Target format ("CLAUDE", "CURSOR", or "PLUGIN")
    * @returns Compiled markdown string
    * @throws Error if format is unsupported
    */
   export function compileSkill(
     skill: BaseSkill,
     format: SupportedFormat,
   ): string {
     validateFormat(format);
     switch (format) {
       case "CLAUDE":
         return compileSkillClaude(skill);
       case "CURSOR":
         return compileSkillCursor(skill);
       case "PLUGIN":
         return compileSkillPlugin(skill);
     }
   }

   /**
    * Compile a rule definition to the specified format.
    *
    * Validates the format, then dispatches to the appropriate per-format
    * compile function. Use this when the format is determined at runtime.
    *
    * @param rule - The rule instance to compile
    * @param format - Target format ("CLAUDE", "CURSOR", or "PLUGIN")
    * @returns Compiled markdown string
    * @throws Error if format is unsupported
    */
   export function compileRule(
     rule: BaseRule,
     format: SupportedFormat,
   ): string {
     validateFormat(format);
     switch (format) {
       case "CLAUDE":
         return compileRuleClaude(rule);
       case "CURSOR":
         return compileRuleCursor(rule);
       case "PLUGIN":
         return compileRulePlugin(rule);
     }
   }
   ````

2. Verify the file was created correctly by reading it back.

**Verification:**

- [ ] `src/compilers/compile.ts` exists and exports all 13 public symbols: `SupportedFormat`, `validateFormat`, `compileAgentClaude`, `compileAgentCursor`, `compileAgentPlugin`, `compileSkillClaude`, `compileSkillCursor`, `compileSkillPlugin`, `compileRuleClaude`, `compileRuleCursor`, `compileRulePlugin`, `compileAgent`, `compileSkill`, `compileRule`
- [ ] `buildAgentFrontmatter` is NOT exported (internal helper)
- [ ] `bunx --bun tsc --noEmit src/compilers/compile.ts` passes

---

### Task 2: Rewrite `__tests__/src/compilers/base-compiler.test.ts`

**Goal:** Replace the class-based `validateFormat` tests with tests that exercise the exported `validateFormat()` function directly. No more `TestCompiler extends BaseCompiler` pattern.

**Files:** `__tests__/src/compilers/base-compiler.test.ts`

**Steps:**

1. Read `__tests__/src/compilers/base-compiler.test.ts` to verify current state.

2. Replace the entire file content with:

   ```typescript
   /**
    * Unit tests for validateFormat
    *
    * Tests the standalone validateFormat function from the functional compiler module.
    */
   import { describe, test, expect } from "bun:test";
   import {
     validateFormat,
     type SupportedFormat,
   } from "../../../src/compilers/compile";

   describe("validateFormat", () => {
     test("accepts CURSOR format without throwing", () => {
       expect(() => validateFormat("CURSOR")).not.toThrow();
     });

     test("accepts CLAUDE format without throwing", () => {
       expect(() => validateFormat("CLAUDE")).not.toThrow();
     });

     test("accepts PLUGIN format without throwing", () => {
       expect(() => validateFormat("PLUGIN")).not.toThrow();
     });

     test("rejects unsupported format with descriptive error", () => {
       expect(() => validateFormat("UNKNOWN" as SupportedFormat)).toThrow(
         "Unsupported format: UNKNOWN",
       );
     });
   });
   ```

**Verification:**

- [ ] `bun test __tests__/src/compilers/base-compiler.test.ts` passes (4 tests)
- [ ] No imports from `base.compiler.ts`
- [ ] No class definitions in the test file

---

### Task 3: Rewrite `__tests__/src/compilers/claude-compiler.test.ts`

**Goal:** Replace `new ClaudeCompiler()` instantiation with direct calls to `compileAgentClaude`, `compileSkillClaude`, `compileRuleClaude`, and the `compileAgent` dispatcher.

**Files:** `__tests__/src/compilers/claude-compiler.test.ts`

**Steps:**

1. Read `__tests__/src/compilers/claude-compiler.test.ts` to verify current state.

2. Replace the entire file content with:

   ```typescript
   /**
    * Unit tests for Claude format compilation functions
    *
    * Tests compileAgentClaude, compileSkillClaude, compileRuleClaude delegation
    * and compileAgent format validation.
    */
   import { describe, test, expect } from "bun:test";
   import {
     compileAgentClaude,
     compileSkillClaude,
     compileRuleClaude,
     compileAgent,
   } from "../../../src/compilers/compile";
   import { BaseAgentImpl } from "../../../src/agents/base/base-agent";
   import { BaseSkillImpl } from "../../../src/skills/base/base-skill";
   import { BaseRuleImpl } from "../../../src/rules/base/base-rule";
   import type { AgentConfig } from "../../../src/agents/types/agent.types";
   import type { SkillConfig } from "../../../src/skills/types/skill.types";
   import type { RuleConfig } from "../../../src/rules/types/rule.types";
   import {
     validAgentConfig,
     validSkillConfig,
     validRuleConfig,
   } from "../../utils/fixtures";

   // Concrete subclasses for the abstract base classes
   class TestAgent extends BaseAgentImpl {
     constructor(config: AgentConfig) {
       super(config);
     }
   }
   class TestSkill extends BaseSkillImpl {
     constructor(config: SkillConfig) {
       super(config);
     }
   }
   class TestRule extends BaseRuleImpl {
     constructor(config: RuleConfig) {
       super(config);
     }
   }

   describe("Claude format compilation", () => {
     test("compileAgentClaude delegates to agent.toClaudeFormat()", () => {
       const agent = new TestAgent(validAgentConfig);
       const result = compileAgentClaude(agent);
       expect(result).toBe(agent.toClaudeFormat());
     });

     test("compileSkillClaude delegates to skill.toClaudeFormat()", () => {
       const skill = new TestSkill(validSkillConfig);
       const result = compileSkillClaude(skill);
       expect(result).toBe(skill.toClaudeFormat());
     });

     test("compileRuleClaude delegates to rule.toClaudeFormat()", () => {
       const rule = new TestRule(validRuleConfig);
       const result = compileRuleClaude(rule);
       expect(result).toBe(rule.toClaudeFormat());
     });

     test("compileAgent throws on unsupported format", () => {
       const agent = new TestAgent(validAgentConfig);
       expect(() => compileAgent(agent, "INVALID" as any)).toThrow(
         "Unsupported format",
       );
     });

     test("compileAgentClaude returns string starting with H1 heading", () => {
       const agent = new TestAgent(validAgentConfig);
       const result = compileAgentClaude(agent);
       expect(result.startsWith("# test-agent")).toBe(true);
     });
   });
   ```

**Verification:**

- [ ] `bun test __tests__/src/compilers/claude-compiler.test.ts` passes (5 tests)
- [ ] No imports from `claude.compiler.ts`
- [ ] No `new ClaudeCompiler()` calls

---

### Task 4: Rewrite `__tests__/src/compilers/cursor-compiler.test.ts`

**Goal:** Replace `new CursorCompiler()` instantiation with direct calls to `compileAgentCursor`, `compileSkillCursor`, `compileRuleCursor`, and the `compileAgent` dispatcher.

**Files:** `__tests__/src/compilers/cursor-compiler.test.ts`

**Steps:**

1. Read `__tests__/src/compilers/cursor-compiler.test.ts` to verify current state.

2. Replace the entire file content with:

   ```typescript
   /**
    * Unit tests for Cursor format compilation functions
    *
    * Tests compileAgentCursor, compileSkillCursor, compileRuleCursor delegation
    * and compileAgent format validation.
    */
   import { describe, test, expect } from "bun:test";
   import {
     compileAgentCursor,
     compileSkillCursor,
     compileRuleCursor,
     compileAgent,
   } from "../../../src/compilers/compile";
   import { BaseAgentImpl } from "../../../src/agents/base/base-agent";
   import { BaseSkillImpl } from "../../../src/skills/base/base-skill";
   import { BaseRuleImpl } from "../../../src/rules/base/base-rule";
   import type { AgentConfig } from "../../../src/agents/types/agent.types";
   import type { SkillConfig } from "../../../src/skills/types/skill.types";
   import type { RuleConfig } from "../../../src/rules/types/rule.types";
   import {
     validAgentConfig,
     validSkillConfig,
     validRuleConfig,
   } from "../../utils/fixtures";

   // Concrete subclasses for the abstract base classes
   class TestAgent extends BaseAgentImpl {
     constructor(config: AgentConfig) {
       super(config);
     }
   }
   class TestSkill extends BaseSkillImpl {
     constructor(config: SkillConfig) {
       super(config);
     }
   }
   class TestRule extends BaseRuleImpl {
     constructor(config: RuleConfig) {
       super(config);
     }
   }

   describe("Cursor format compilation", () => {
     test("compileAgentCursor delegates to agent.toCursorFormat()", () => {
       const agent = new TestAgent(validAgentConfig);
       const result = compileAgentCursor(agent);
       expect(result).toBe(agent.toCursorFormat());
     });

     test("compileSkillCursor delegates to skill.toCursorFormat()", () => {
       const skill = new TestSkill(validSkillConfig);
       const result = compileSkillCursor(skill);
       expect(result).toBe(skill.toCursorFormat());
     });

     test("compileRuleCursor delegates to rule.toCursorFormat()", () => {
       const rule = new TestRule(validRuleConfig);
       const result = compileRuleCursor(rule);
       expect(result).toBe(rule.toCursorFormat());
     });

     test("compileAgent throws on unsupported format", () => {
       const agent = new TestAgent(validAgentConfig);
       expect(() => compileAgent(agent, "UNKNOWN" as any)).toThrow(
         "Unsupported format",
       );
     });

     test("compileAgentCursor returns string containing YAML frontmatter", () => {
       const agent = new TestAgent(validAgentConfig);
       const result = compileAgentCursor(agent);
       expect(result).toContain("---");
       expect(result).toContain("name: test-agent");
     });
   });
   ```

**Verification:**

- [ ] `bun test __tests__/src/compilers/cursor-compiler.test.ts` passes (5 tests)
- [ ] No imports from `cursor.compiler.ts`
- [ ] No `new CursorCompiler()` calls

---

### Task 5: Rewrite `src/compilers/plugin.compiler.test.ts`

**Goal:** Replace `new PluginCompiler()` and `new ClaudeCompiler()` instantiation with direct calls to the functional compile functions. Maintain the same test coverage including the parity tests between plugin and Claude output.

**Files:** `src/compilers/plugin.compiler.test.ts`

**Steps:**

1. Read `src/compilers/plugin.compiler.test.ts` to verify current state.

2. Replace the entire file content with:

   ```typescript
   /**
    * Tests for the plugin compilation functions.
    *
    * Verifies that plugin compile functions produce Claude-format markdown for
    * agents, skills, and rules, and that plugin output matches Claude output
    * for the same inputs (parity guarantee).
    */
   import { describe, test, expect } from "bun:test";

   import {
     compileAgentPlugin,
     compileSkillPlugin,
     compileRulePlugin,
     compileAgentClaude,
     compileSkillClaude,
     compileRuleClaude,
   } from "./compile";
   import { BaseAgentImpl } from "../agents/base/base-agent";
   import { BaseSkillImpl } from "../skills/base/base-skill";
   import { BaseRuleImpl } from "../rules/base/base-rule";
   import type { AgentConfig } from "../agents/types/agent.types";
   import type { SkillConfig } from "../skills/types/skill.types";
   import type { RuleConfig } from "../rules/types/rule.types";

   // ---------------------------------------------------------------------------
   // Test implementations (extend abstract base classes for instantiation)
   // ---------------------------------------------------------------------------

   class TestAgent extends BaseAgentImpl {
     constructor(config: AgentConfig) {
       super(config);
     }
   }

   class TestSkill extends BaseSkillImpl {
     constructor(config: SkillConfig) {
       super(config);
     }
   }

   class TestRule extends BaseRuleImpl {
     constructor(config: RuleConfig) {
       super(config);
     }
   }

   // ---------------------------------------------------------------------------
   // Fixtures
   // ---------------------------------------------------------------------------

   /** Agent config without cognition or context */
   const plainAgentConfig: AgentConfig = {
     frontmatter: {
       name: "test-agent",
       description: "A simple test agent with no cognition config",
     },
     sections: [
       {
         title: "Purpose",
         content: "Execute unit tests and report results.",
         order: 1,
       },
       {
         title: "Constraints",
         content: "Never modify source files.",
         order: 2,
       },
     ],
   };

   /** Agent config with cognition configuration */
   const cognitionAgentConfig: AgentConfig = {
     frontmatter: {
       name: "cognitive-agent",
       description: "An agent with cognition configuration",
       cognition: {
         default_tier: "T1",
         promotable_to: "T2",
         memory_tags: ["testing", "debugging"],
       },
     },
     sections: [
       {
         title: "Role",
         content: "Analyze test failures with recall.",
         order: 1,
       },
     ],
   };

   /** Agent config with context configuration */
   const contextAgentConfig: AgentConfig = {
     frontmatter: {
       name: "context-agent",
       description: "An agent with context configuration",
       context: {
         default_tier: "T0",
         promotable_to: "T3",
         isolation: "cold",
       },
     },
     sections: [
       { title: "Role", content: "Cold-start security auditing.", order: 1 },
     ],
   };

   /** Agent config with both cognition and context */
   const fullAgentConfig: AgentConfig = {
     frontmatter: {
       name: "full-agent",
       description: "An agent with both cognition and context",
       cognition: {
         default_tier: "T2",
         promotable_to: "T3",
         memory_tags: ["architecture"],
       },
       context: {
         default_tier: "T1",
         promotable_to: "T2",
         isolation: "warm",
       },
     },
     sections: [
       { title: "Role", content: "Full-featured planning agent.", order: 1 },
     ],
   };

   /** Skill config */
   const skillConfig: SkillConfig = {
     frontmatter: {
       name: "test-skill",
       description: "A skill for running test suites",
     },
     sections: [
       {
         title: "Instructions",
         content: "Run `bun test` and report results.",
         order: 1,
       },
       { title: "Output", content: "Return pass/fail summary.", order: 2 },
     ],
   };

   /** Rule config */
   const ruleConfig: RuleConfig = {
     frontmatter: {
       description: "Enforce kebab-case file naming",
       globs: ["**/*.ts"],
       alwaysApply: true,
     },
     sections: [
       {
         title: "Rule",
         content: "All TypeScript files must use kebab-case names.",
         order: 1,
       },
     ],
   };

   // ---------------------------------------------------------------------------
   // Tests
   // ---------------------------------------------------------------------------

   describe("Plugin format compilation", () => {
     describe("compileAgentPlugin", () => {
       test("produces Claude-format markdown for agent without cognition or context", () => {
         const agent = new TestAgent(plainAgentConfig);
         const output = compileAgentPlugin(agent);

         // Should contain H1 heading with agent name
         expect(output).toContain("# test-agent");
         // Should contain description
         expect(output).toContain(
           "A simple test agent with no cognition config",
         );
         // Should contain H2 sections
         expect(output).toContain("## Purpose");
         expect(output).toContain("Execute unit tests and report results.");
         expect(output).toContain("## Constraints");
         expect(output).toContain("Never modify source files.");
         // Should NOT contain YAML frontmatter
         expect(output).not.toContain("---");
       });

       test("includes YAML frontmatter for agent with cognition config", () => {
         const agent = new TestAgent(cognitionAgentConfig);
         const output = compileAgentPlugin(agent);

         // Should start with YAML frontmatter
         expect(output).toMatch(/^---\n/);
         // Should contain cognition fields
         expect(output).toContain("name: cognitive-agent");
         expect(output).toContain("default_tier: T1");
         expect(output).toContain("promotable_to: T2");
         expect(output).toContain("testing");
         expect(output).toContain("debugging");
         // Should contain markdown body after frontmatter
         expect(output).toContain("# cognitive-agent");
         expect(output).toContain("## Role");
       });

       test("includes YAML frontmatter for agent with context config", () => {
         const agent = new TestAgent(contextAgentConfig);
         const output = compileAgentPlugin(agent);

         // Should start with YAML frontmatter
         expect(output).toMatch(/^---\n/);
         // Should contain context fields
         expect(output).toContain("name: context-agent");
         expect(output).toContain("default_tier: T0");
         expect(output).toContain("promotable_to: T3");
         expect(output).toContain("isolation: cold");
         // Should contain markdown body
         expect(output).toContain("# context-agent");
         expect(output).toContain("Cold-start security auditing.");
       });

       test("includes both cognition and context in frontmatter when both present", () => {
         const agent = new TestAgent(fullAgentConfig);
         const output = compileAgentPlugin(agent);

         // Should have YAML frontmatter
         expect(output).toMatch(/^---\n/);
         expect(output).toContain("name: full-agent");
         // Cognition fields
         expect(output).toContain("architecture");
         // Context fields
         expect(output).toContain("isolation: warm");
         // Markdown body
         expect(output).toContain("# full-agent");
       });
     });

     describe("compileSkillPlugin", () => {
       test("produces markdown with description frontmatter", () => {
         const skill = new TestSkill(skillConfig);
         const output = compileSkillPlugin(skill);

         // Should start with YAML frontmatter containing description
         expect(output).toMatch(/^---\n/);
         expect(output).toContain(
           "description: A skill for running test suites",
         );
         // Should contain H1 heading with skill name
         expect(output).toContain("# test-skill");
         // Should contain description in body too
         expect(output).toContain("A skill for running test suites");
         // Should contain H2 sections
         expect(output).toContain("## Instructions");
         expect(output).toContain("Run `bun test` and report results.");
         expect(output).toContain("## Output");
         expect(output).toContain("Return pass/fail summary.");
       });
     });

     describe("compileRulePlugin", () => {
       test("produces Claude-format markdown", () => {
         const rule = new TestRule(ruleConfig);
         const output = compileRulePlugin(rule);

         // Should contain H1 heading with rule description
         expect(output).toContain("# Enforce kebab-case file naming");
         // Should contain H2 sections
         expect(output).toContain("## Rule");
         expect(output).toContain(
           "All TypeScript files must use kebab-case names.",
         );
         // Rules do not emit YAML frontmatter in Claude format
         expect(output).not.toContain("---");
       });
     });

     describe("parity with Claude format functions", () => {
       test("agent output matches compileAgentClaude for plain agent", () => {
         const agent = new TestAgent(plainAgentConfig);
         const pluginOutput = compileAgentPlugin(agent);
         const claudeOutput = compileAgentClaude(agent);
         expect(pluginOutput).toBe(claudeOutput);
       });

       test("agent output matches compileAgentClaude for cognition agent", () => {
         const agent = new TestAgent(cognitionAgentConfig);
         const pluginOutput = compileAgentPlugin(agent);
         const claudeOutput = compileAgentClaude(agent);
         expect(pluginOutput).toBe(claudeOutput);
       });

       test("agent output matches compileAgentClaude for context agent", () => {
         const agent = new TestAgent(contextAgentConfig);
         const pluginOutput = compileAgentPlugin(agent);
         const claudeOutput = compileAgentClaude(agent);
         expect(pluginOutput).toBe(claudeOutput);
       });

       test("agent output matches compileAgentClaude for full agent", () => {
         const agent = new TestAgent(fullAgentConfig);
         const pluginOutput = compileAgentPlugin(agent);
         const claudeOutput = compileAgentClaude(agent);
         expect(pluginOutput).toBe(claudeOutput);
       });

       test("skill output extends compileSkillClaude with description frontmatter", () => {
         const skill = new TestSkill(skillConfig);
         const pluginOutput = compileSkillPlugin(skill);
         const claudeOutput = compileSkillClaude(skill);

         // Plugin output should contain the full Claude body
         expect(pluginOutput).toContain(claudeOutput);
         // But also include YAML frontmatter that Claude format lacks
         expect(pluginOutput).toMatch(/^---\n/);
         expect(pluginOutput).toContain("description:");
       });

       test("rule output matches compileRuleClaude", () => {
         const rule = new TestRule(ruleConfig);
         const pluginOutput = compileRulePlugin(rule);
         const claudeOutput = compileRuleClaude(rule);
         expect(pluginOutput).toBe(claudeOutput);
       });
     });
   });
   ```

**Verification:**

- [ ] `bun test src/compilers/plugin.compiler.test.ts` passes (16 tests)
- [ ] No imports from `plugin.compiler.ts` or `claude.compiler.ts`
- [ ] No `new PluginCompiler()` or `new ClaudeCompiler()` calls
- [ ] Parity tests still validate that plugin agent/rule output matches Claude output

---

### Task 6: Run full test suite

**Goal:** Verify all compiler tests pass and no regressions in the broader test suite.

**Steps:**

1. Run `bun test __tests__/src/compilers/` to verify all 3 rewritten test files pass.
2. Run `bun test src/compilers/plugin.compiler.test.ts` to verify the plugin test passes.
3. Run `bun test` to verify the full test suite passes (including drift checks that exercise compilers indirectly).

**Verification:**

- [ ] All compiler tests pass (4 + 5 + 5 + 16 = 30 tests)
- [ ] Full test suite passes with no regressions

---

## Success Criteria

- [ ] `src/compilers/compile.ts` exists with all 13 public exports
- [ ] `buildAgentFrontmatter()` is an internal helper (not exported), eliminating the ClaudeCompiler/PluginCompiler duplication (CLEAN-02)
- [ ] Per-format functions (`compileAgentPlugin`, etc.) do NOT accept a `format` parameter (CLEAN-02)
- [ ] All 4 test files rewritten to use functional API with zero class imports
- [ ] All tests pass: `bun test`
- [ ] Old class files still exist on disk (not deleted until Wave 2)

## Execution Rules

1. **Read before edit:** Always read each file before modifying it to verify current content matches expectations.
2. **Test after each task:** Run the relevant test file after each task, then the full suite after all tasks complete.
3. **Behavioral equivalence:** The new functional module must produce byte-identical output to the old class-based compilers for the same inputs. The drift check (`check-drift.test.ts`) validates this end-to-end.
4. **No consumer migration yet:** Build scripts and `index.ts` still import from the old class files during Wave 1. Consumer migration happens in Wave 2.
5. **Preserve test entity classes:** `TestAgent extends BaseAgentImpl` etc. in test files are out of scope for this refactor. They are used to instantiate abstract entity base classes, not compiler classes.
