#!/usr/bin/env bun

import { mkdir, readdir } from "node:fs/promises";
import path from "path";

import { parseFrontmatter } from "./parse-frontmatter";
import { toCamelCaseWithSuffix, toConfigName } from "./shared/naming-utils";

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
  const rawContent = await Bun.file(filePath).text();
  const { frontmatter, content } = parseFrontmatter(rawContent);

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    tools: frontmatter.tools
      ? frontmatter.tools.split(", ").map((t: string) => t.trim())
      : undefined,
    model: frontmatter.model,
    color: frontmatter.color,
    disableModelInvocation: frontmatter["disable-model-invocation"],
    content,
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

  const exportName = toCamelCaseWithSuffix(agentData.name, "Agent");
  const configName = toConfigName(agentData.name);

  return `/**
 * ${agentData.name} Agent - ${agentData.description}
 */
import { createAgent } from '~/agents/__helpers/create-agent';
import type { AgentConfig } from '~/agents/__schemas/agent.schemas';

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

export const ${exportName} = createAgent(${configName});
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
