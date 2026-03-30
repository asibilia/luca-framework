#!/usr/bin/env bun
/**
 * Prompt safety checker: scans agent-prompts.ts for forbidden tool call patterns.
 *
 * Agent prompt templates must not contain actual invocations of Agent(), Task(),
 * or Skill() — sub-agents are leaf workers. The AGENT_CONSTRAINT block that says
 * "You CANNOT call Agent(), Task(), or Skill()" is the only allowed mention.
 *
 * Only template literal content (backtick strings) is scanned — JSDoc comments
 * and regular code are ignored since they are not emitted as prompt text.
 *
 * Exit code 0 = clean, exit code 1 = violations found.
 *
 * @example
 * ```bash
 * bun ./scripts/check-prompt-safety.ts
 * ```
 */

const PROMPT_FILE = "src/skills/__helpers/agent-prompts.ts";

const file = await Bun.file(PROMPT_FILE).text();

// Extract all template literal bodies (content between backticks).
// This captures the actual prompt text that gets sent to sub-agents.
const templateLiterals: Array<{ content: string; startOffset: number }> = [];
let depth = 0;
let inTemplate = false;
let templateStart = -1;
let i = 0;

while (i < file.length) {
  const ch = file[i];
  const prev = i > 0 ? file[i - 1] : "";

  // Skip regular strings (single/double quotes)
  if ((ch === "'" || ch === '"') && prev !== "\\") {
    const quote = ch;
    i++;
    while (i < file.length && !(file[i] === quote && file[i - 1] !== "\\")) {
      i++;
    }
    i++;
    continue;
  }

  // Skip line comments
  if (ch === "/" && i + 1 < file.length && file[i + 1] === "/") {
    while (i < file.length && file[i] !== "\n") i++;
    continue;
  }

  // Skip block comments (including JSDoc)
  if (ch === "/" && i + 1 < file.length && file[i + 1] === "*") {
    i += 2;
    while (i + 1 < file.length && !(file[i] === "*" && file[i + 1] === "/")) {
      i++;
    }
    i += 2;
    continue;
  }

  // Template literal handling
  if (ch === "`" && prev !== "\\") {
    if (!inTemplate) {
      inTemplate = true;
      depth = 1;
      templateStart = i + 1;
    } else if (depth === 1) {
      // End of top-level template literal
      templateLiterals.push({
        content: file.slice(templateStart, i),
        startOffset: templateStart,
      });
      inTemplate = false;
      depth = 0;
    }
    i++;
    continue;
  }

  // Track ${...} nesting inside template literals
  if (inTemplate) {
    if (ch === "$" && i + 1 < file.length && file[i + 1] === "{") {
      depth++;
      i += 2;
      continue;
    }
    if (ch === "}" && depth > 1) {
      depth--;
      i++;
      continue;
    }
  }

  i++;
}

// The AGENT_CONSTRAINT content (says "You CANNOT call Agent(), Task(), or Skill()")
// is an allowed mention — it's the constraint itself, not an invocation.
const constraintPattern =
  /You CANNOT call Agent\(\),?\s*Task\(\),?\s*or Skill\(\)/;

// Forbidden patterns: actual invocation syntax inside prompt template content
const forbiddenPatterns = [
  { regex: /\bAgent\s*\(/g, label: "Agent(" },
  { regex: /\bTask\s*\(/g, label: "Task(" },
  { regex: /\bSkill\s*\(/g, label: "Skill(" },
];

const violations: Array<{ pattern: string; line: number; text: string }> = [];

for (const tpl of templateLiterals) {
  // Skip the AGENT_CONSTRAINT template literal itself
  if (constraintPattern.test(tpl.content)) continue;

  for (const { regex, label } of forbiddenPatterns) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(tpl.content)) !== null) {
      // Compute line number relative to the full file
      const absoluteOffset = tpl.startOffset + match.index;
      const beforeMatch = file.slice(0, absoluteOffset);
      const lineNumber = beforeMatch.split("\n").length;
      const lineText = file.split("\n")[lineNumber - 1]?.trim() ?? "";
      violations.push({
        pattern: label,
        line: lineNumber,
        text: lineText,
      });
    }
  }
}

if (violations.length > 0) {
  console.error(
    `FAIL: Found ${violations.length} forbidden tool call pattern(s) in ${PROMPT_FILE}:\n`,
  );
  for (const v of violations) {
    console.error(`  Line ${v.line}: ${v.pattern} → "${v.text}"`);
  }
  console.error(
    "\nSub-agent prompts must not invoke Agent(), Task(), or Skill().",
  );
  process.exit(1);
}

console.log(`PASS: No forbidden tool call patterns found in ${PROMPT_FILE}`);
process.exit(0);
