/**
 * Base compiler for converting TypeScript definitions to target formats
 */
import type { BaseAgent } from "../agents/types/agent.types";
import type { BaseSkill } from "../skills/types/skill.types";
import type { BaseRule } from "../rules/types/rule.types";

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
