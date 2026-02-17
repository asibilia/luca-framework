#!/usr/bin/env bun

import { mkdir, readdir } from "fs/promises";
import path from "path";

interface AgentData {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  color?: string;
  disableModelInvocation?: boolean;
  content: string;
}

async function parseAgentMarkdown(filePath: string): Promise<AgentData> {
  const content = await Bun.file(filePath).text();

  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error(`No frontmatter found in ${filePath}`);
  }

  const frontmatter = frontmatterMatch[1]!;
  const frontmatterLines = frontmatter.split("\n");

  const parsedFrontmatter: Record<string, any> = {};
  for (const line of frontmatterLines) {
    if (line.trim()) {
      const colonIndex = line.indexOf(":");
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim();
        const rawValue = line.substring(colonIndex + 1).trim();
        let value: any = rawValue;

        // Handle arrays
        if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
          value = rawValue
            .slice(1, -1)
            .split(",")
            .map((v) => v.trim().replace(/"/g, "").replace(/'/g, ""));
        } else if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
          value = rawValue.slice(1, -1);
        } else if (rawValue === "true") {
          value = true;
        } else if (rawValue === "false") {
          value = false;
        } else if (!isNaN(Number(rawValue))) {
          value = Number(rawValue);
        }

        parsedFrontmatter[key] = value;
      }
    }
  }

  // Extract content after frontmatter
  const contentWithoutFrontmatter = content
    .substring(frontmatterMatch[0].length)
    .trim();

  return {
    name: parsedFrontmatter.name,
    description: parsedFrontmatter.description,
    tools: parsedFrontmatter.tools
      ? parsedFrontmatter.tools.split(", ").map((t: string) => t.trim())
      : undefined,
    model: parsedFrontmatter.model,
    color: parsedFrontmatter.color,
    disableModelInvocation: parsedFrontmatter["disable-model-invocation"],
    content: contentWithoutFrontmatter,
  };
}

function generateAgentTsContent(agentData: AgentData): string {
  // Split content into sections based on headers or markers
  const sections: Array<{ title: string; content: string }> = [];

  // Simple approach: treat the whole content as one section for now
  // In a more sophisticated implementation, we'd parse for <section> tags or headers
  sections.push({
    title: "role",
    content: agentData.content,
  });

  const className = `${agentData.name.charAt(0).toUpperCase() + agentData.name.slice(1).replace(/-/g, "")}Agent`;
  const configName = `${agentData.name.replace(/-/g, "")}Config`;

  return `/**
 * ${agentData.name} Agent - ${agentData.description}
 */
import { BaseAgentImpl } from '../base/base-agent';
import { AgentConfig } from '../types/agent.types';

// Define the ${agentData.name} agent configuration
const ${configName}: AgentConfig = {
  frontmatter: {
    name: '${agentData.name}',
    description: \`${agentData.description}\`,
    ${agentData.tools ? `tools: [${agentData.tools.map((t) => `'${t}'`).join(", ")}],` : ""}
    ${agentData.color ? `color: '${agentData.color}',` : ""}
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

export class ${className} extends BaseAgentImpl {
  constructor() {
    super(${configName});
  }
}
`;
}

async function generateAgentsFromCursor() {
  const cursorAgentsDir = path.join(process.cwd(), ".cursor", "agents");
  const srcAgentsDir = path.join(process.cwd(), "src", "agents", "general");

  // Create the general agents directory if it doesn't exist
  await mkdir(srcAgentsDir, { recursive: true });

  // Read all .md files from .cursor/agents
  const agentFiles = await readdir(cursorAgentsDir);
  const mdFiles = agentFiles.filter((file) => file.endsWith(".md"));

  console.log(`Found ${mdFiles.length} agent files in .cursor/agents`);

  for (const file of mdFiles) {
    try {
      const filePath = path.join(cursorAgentsDir, file);
      console.log(`Processing ${filePath}...`);

      const agentData = await parseAgentMarkdown(filePath);
      const tsFileName = file.replace(".md", ".agent.ts");
      const tsFilePath = path.join(srcAgentsDir, tsFileName);

      const tsContent = generateAgentTsContent(agentData);
      await Bun.write(tsFilePath, tsContent);

      console.log(`Generated ${tsFilePath}`);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
}

if (import.meta.main) {
  generateAgentsFromCursor()
    .then(() => console.log("Agent generation completed"))
    .catch((error) => console.error("Error:", error));
}

export { generateAgentsFromCursor };
