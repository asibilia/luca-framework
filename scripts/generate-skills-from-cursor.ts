#!/usr/bin/env bun

import { mkdir, readdir, stat, access } from "node:fs/promises";
import path from "path";

import { parseFrontmatter } from "./parse-frontmatter";
import { toCamelCaseWithSuffix, toConfigName } from "./shared/naming-utils";

interface SkillData {
  name: string;
  description: string;
  disableModelInvocation?: boolean;
  content: string;
}

async function parseSkillMarkdown(filePath: string): Promise<SkillData> {
  const rawContent = await Bun.file(filePath).text();
  const { frontmatter, content } = parseFrontmatter(rawContent);

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    disableModelInvocation: frontmatter["disable-model-invocation"],
    content,
  };
}

function generateSkillTsContent(skillData: SkillData): string {
  // Split content into sections based on headers or markers
  const sections: Array<{ title: string; content: string }> = [];

  // Simple approach: treat the whole content as one section for now
  // In a more sophisticated implementation, we'd parse for <section> tags or headers
  sections.push({
    title: "main",
    content: skillData.content,
  });

  const instanceName = toCamelCaseWithSuffix(skillData.name, "Skill");
  const configName = toConfigName(skillData.name);

  return `/**
 * ${skillData.name} Skill - ${skillData.description}
 */
import { createSkill } from '../base/base-skill';
import type { SkillConfig } from '../types/skill.schemas';

// Define the ${skillData.name} skill configuration
const ${configName}: SkillConfig = {
  frontmatter: {
    name: '${skillData.name}',
    description: \`${skillData.description}\`,
    ${skillData.disableModelInvocation !== undefined ? `'disable-model-invocation': ${skillData.disableModelInvocation},` : ""}
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

export const ${instanceName} = createSkill(${configName});
`;
}

async function generateSkillsFromCursor() {
  const cursorSkillsDir = path.join(process.cwd(), ".cursor", "skills");
  const srcSkillsDir = path.join(process.cwd(), "src", "skills", "general");

  // Create the general skills directory if it doesn't exist
  await mkdir(srcSkillsDir, { recursive: true });

  // Read all skill directories from .cursor/skills
  const skillDirs = await readdir(cursorSkillsDir);

  // Filter only directories (each skill has its own directory with SKILL.md)
  const validSkillDirs = [];
  for (const dir of skillDirs) {
    const dirPath = path.join(cursorSkillsDir, dir);
    const dirStat = await stat(dirPath);
    if (dirStat.isDirectory()) {
      validSkillDirs.push(dir);
    }
  }

  console.log(
    `Found ${validSkillDirs.length} skill directories in .cursor/skills`,
  );

  for (const dir of validSkillDirs) {
    try {
      const skillMdPath = path.join(cursorSkillsDir, dir, "SKILL.md");

      // Check if SKILL.md exists in the directory
      try {
        await access(skillMdPath);
      } catch {
        console.log(`SKILL.md not found in ${dir}, skipping...`);
        continue;
      }

      console.log(`Processing ${skillMdPath}...`);

      const skillData = await parseSkillMarkdown(skillMdPath);
      const tsFileName = dir + ".skill.ts";
      const tsFilePath = path.join(srcSkillsDir, tsFileName);

      const tsContent = generateSkillTsContent(skillData);
      await Bun.write(tsFilePath, tsContent);

      console.log(`Generated ${tsFilePath}`);
    } catch (error) {
      console.error(`Error processing skill ${dir}:`, error);
    }
  }
}

if (import.meta.main) {
  generateSkillsFromCursor()
    .then(() => console.log("Skill generation completed"))
    .catch((error) => console.error("Error:", error));
}

export { generateSkillsFromCursor };
