#!/usr/bin/env bun

import { mkdir, readdir } from "node:fs/promises";
import path from "path";

import { parseFrontmatter } from "./parse-frontmatter";
import { toCamelCaseWithSuffix, toConfigName } from "./shared/naming-utils";

interface RuleData {
  description: string;
  globs?: string[];
  alwaysApply?: boolean;
  content: string;
}

async function parseRuleMarkdown(filePath: string): Promise<RuleData> {
  const rawContent = await Bun.file(filePath).text();
  const { frontmatter, content } = parseFrontmatter(rawContent, {
    fallbackDescription: true,
  });

  return {
    description: frontmatter.description || "Generic rule description",
    globs: frontmatter.globs
      ? Array.isArray(frontmatter.globs)
        ? frontmatter.globs
        : frontmatter.globs.split(", ")
      : undefined,
    alwaysApply: frontmatter.alwaysApply,
    content,
  };
}

function generateRuleTsContent(ruleData: RuleData): string {
  // Split content into sections based on headers or markers
  const sections: Array<{ title: string; content: string }> = [];

  // Simple approach: treat the whole content as one section for now
  // In a more sophisticated implementation, we'd parse for <section> tags or headers
  sections.push({
    title: "rule",
    content: ruleData.content,
  });

  const ruleName = ruleData.description
    .substring(0, 20)
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "");
  const configName = toConfigName(ruleName);
  const exportName = toCamelCaseWithSuffix(ruleName, "Rule");

  return `/**
 * ${ruleData.description}
 */
import { createRule } from '../base/base-rule';
import type { RuleConfig } from '../types/rule.schemas';

// Define the ${ruleName} rule configuration
const ${configName}: RuleConfig = {
  frontmatter: {
    description: \`${ruleData.description}\`,
    ${ruleData.globs ? `globs: [${ruleData.globs.map((g) => `'${g}'`).join(", ")}],` : ""}
    ${ruleData.alwaysApply !== undefined ? `alwaysApply: ${ruleData.alwaysApply},` : ""}
  },
  sections: [
    ${sections
      .map(
        (section, index) => `{
      title: '${section.title}',
      content: \`${section.content.replace(/`/g, "\\`")}\`,
      order: ${index + 1}
    }`,
      )
      .join(",\n    ")}
  ]
};

export const ${exportName} = createRule(${configName});
`;
}

async function generateRulesFromCursor() {
  const cursorRulesDir = path.join(process.cwd(), ".cursor", "rules");
  const srcRulesDir = path.join(process.cwd(), "src", "rules", "general");

  // Create the general rules directory if it doesn't exist
  await mkdir(srcRulesDir, { recursive: true });

  // Read all .mdc files from .cursor/rules
  const ruleFiles = await readdir(cursorRulesDir);
  const mdcFiles = ruleFiles.filter((file) => file.endsWith(".mdc"));

  console.log(`Found ${mdcFiles.length} rule files in .cursor/rules`);

  for (const file of mdcFiles) {
    try {
      const filePath = path.join(cursorRulesDir, file);
      console.log(`Processing ${filePath}...`);

      const ruleData = await parseRuleMarkdown(filePath);
      const tsFileName = file.replace(".mdc", ".rule.ts");
      const tsFilePath = path.join(srcRulesDir, tsFileName);

      const tsContent = generateRuleTsContent(ruleData);
      await Bun.write(tsFilePath, tsContent);

      console.log(`Generated ${tsFilePath}`);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  // Also process any rules in subdirectories (like taskmaster/)
  const allItems = await readdir(cursorRulesDir, { withFileTypes: true });
  const subdirs = allItems
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const subdir of subdirs) {
    const subDirPath = path.join(cursorRulesDir, subdir);
    const subFiles = await readdir(subDirPath);
    const subMdcFiles = subFiles.filter((file) => file.endsWith(".mdc"));

    for (const file of subMdcFiles) {
      try {
        const filePath = path.join(subDirPath, file);
        console.log(`Processing ${filePath}...`);

        const ruleData = await parseRuleMarkdown(filePath);
        const tsFileName = `${subdir}-${file.replace(".mdc", ".rule.ts")}`;
        const tsFilePath = path.join(srcRulesDir, tsFileName);

        const tsContent = generateRuleTsContent(ruleData);
        await Bun.write(tsFilePath, tsContent);

        console.log(`Generated ${tsFilePath}`);
      } catch (error) {
        console.error(`Error processing ${subdir}/${file}:`, error);
      }
    }
  }
}

if (import.meta.main) {
  generateRulesFromCursor()
    .then(() => console.log("Rule generation completed"))
    .catch((error) => console.error("Error:", error));
}

export { generateRulesFromCursor };
