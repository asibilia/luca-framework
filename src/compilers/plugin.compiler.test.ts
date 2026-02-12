/**
 * Tests for the PluginCompiler.
 *
 * Verifies that the plugin compiler produces Claude-format markdown for agents,
 * skills, and rules, and that its output matches ClaudeCompiler for the same
 * inputs (parity guarantee).
 */
import { describe, test, expect } from "bun:test";

import { PluginCompiler } from "./plugin.compiler";
import { ClaudeCompiler } from "./claude.compiler";
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
    { title: "Constraints", content: "Never modify source files.", order: 2 },
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
    { title: "Role", content: "Analyze test failures with recall.", order: 1 },
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

describe("PluginCompiler", () => {
  const pluginCompiler = new PluginCompiler();

  describe("compileAgent", () => {
    test("produces Claude-format markdown for agent without cognition or context", () => {
      const agent = new TestAgent(plainAgentConfig);
      const output = pluginCompiler.compileAgent(agent, "CLAUDE");

      // Should contain H1 heading with agent name
      expect(output).toContain("# test-agent");
      // Should contain description
      expect(output).toContain("A simple test agent with no cognition config");
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
      const output = pluginCompiler.compileAgent(agent, "CLAUDE");

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
      const output = pluginCompiler.compileAgent(agent, "CLAUDE");

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
      const output = pluginCompiler.compileAgent(agent, "CLAUDE");

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

  describe("compileSkill", () => {
    test("produces markdown with description frontmatter", () => {
      const skill = new TestSkill(skillConfig);
      const output = pluginCompiler.compileSkill(skill, "CLAUDE");

      // Should start with YAML frontmatter containing description
      expect(output).toMatch(/^---\n/);
      expect(output).toContain("description: A skill for running test suites");
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

  describe("compileRule", () => {
    test("produces Claude-format markdown", () => {
      const rule = new TestRule(ruleConfig);
      const output = pluginCompiler.compileRule(rule, "CLAUDE");

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

  describe("parity with ClaudeCompiler", () => {
    const claudeCompiler = new ClaudeCompiler();

    test("agent output matches ClaudeCompiler for plain agent", () => {
      const agent = new TestAgent(plainAgentConfig);
      const pluginOutput = pluginCompiler.compileAgent(agent, "CLAUDE");
      const claudeOutput = claudeCompiler.compileAgent(agent, "CLAUDE");
      expect(pluginOutput).toBe(claudeOutput);
    });

    test("agent output matches ClaudeCompiler for cognition agent", () => {
      const agent = new TestAgent(cognitionAgentConfig);
      const pluginOutput = pluginCompiler.compileAgent(agent, "CLAUDE");
      const claudeOutput = claudeCompiler.compileAgent(agent, "CLAUDE");
      expect(pluginOutput).toBe(claudeOutput);
    });

    test("agent output matches ClaudeCompiler for context agent", () => {
      const agent = new TestAgent(contextAgentConfig);
      const pluginOutput = pluginCompiler.compileAgent(agent, "CLAUDE");
      const claudeOutput = claudeCompiler.compileAgent(agent, "CLAUDE");
      expect(pluginOutput).toBe(claudeOutput);
    });

    test("agent output matches ClaudeCompiler for full agent", () => {
      const agent = new TestAgent(fullAgentConfig);
      const pluginOutput = pluginCompiler.compileAgent(agent, "CLAUDE");
      const claudeOutput = claudeCompiler.compileAgent(agent, "CLAUDE");
      expect(pluginOutput).toBe(claudeOutput);
    });

    test("skill output extends ClaudeCompiler with description frontmatter", () => {
      const skill = new TestSkill(skillConfig);
      const pluginOutput = pluginCompiler.compileSkill(skill, "CLAUDE");
      const claudeOutput = claudeCompiler.compileSkill(skill, "CLAUDE");

      // Plugin output should contain the full Claude body
      expect(pluginOutput).toContain(claudeOutput);
      // But also include YAML frontmatter that Claude format lacks
      expect(pluginOutput).toMatch(/^---\n/);
      expect(pluginOutput).toContain("description:");
    });

    test("rule output matches ClaudeCompiler", () => {
      const rule = new TestRule(ruleConfig);
      const pluginOutput = pluginCompiler.compileRule(rule, "CLAUDE");
      const claudeOutput = claudeCompiler.compileRule(rule, "CLAUDE");
      expect(pluginOutput).toBe(claudeOutput);
    });
  });
});
