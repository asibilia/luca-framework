/**
 * Luca Agent Teams Extension for Pi
 *
 * Provides dispatcher pattern for agent teams. Reads agent persona files
 * from .pi/agents/, enables defining teams of agents for parallel review
 * or collaborative work, and injects role-specific context when dispatching.
 *
 * Source: src/hooks/pi-extensions/luca-teams.ts
 * Deployed to: .pi/extensions/luca-teams.ts
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

import type { AgentFrontmatter } from "./__helpers/frontmatter";
import { parseFrontmatter } from "./__helpers/frontmatter";
import { createRegistry } from "./__helpers/registry";
import { createJsonResponse, createTextResponse } from "./__helpers/response";

/** Team definition. */
interface TeamDef {
  name: string;
  description: string;
  agents: string[];
}

/** Max characters to include from an agent persona (prevents huge payloads). */
const MAX_PERSONA_LENGTH = 2000;

/**
 * Pi extension: Agent team dispatch and multi-agent review.
 *
 * Registers tools for listing, defining, and dispatching tasks to
 * agent teams. Each team member's role description, tool restrictions,
 * and persona context are returned for simulated multi-agent review.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaTeams(pi: any) {
  const cwd = process.cwd();
  const agentsDir = join(cwd, ".pi", "agents");

  /** Registered teams. */
  const teams = createRegistry<TeamDef>("teams");

  // Pre-define standard teams
  teams.set("code-review", {
    name: "code-review",
    description:
      "Code review team: architecture, simplification, and DX analysis",
    agents: ["code-architect", "code-simplifier", "dx-advocate"],
  });
  teams.set("research", {
    name: "research",
    description:
      "Research team: phase research, project research, and synthesis",
    agents: [
      "lu-phase-researcher",
      "lu-project-researcher",
      "lu-research-synthesizer",
    ],
  });
  teams.set("quality", {
    name: "quality",
    description:
      "Quality assurance team: PR review, integration, plan check, and testing",
    agents: [
      "lu-pr-reviewer",
      "lu-integration-checker",
      "lu-plan-checker",
      "lu-test-writer",
    ],
  });
  teams.set("security", {
    name: "security",
    description: "Security and performance audit team",
    agents: ["security-auditor", "performance-auditor"],
  });

  /**
   * Parse agent info from a .pi/agents/*.md file.
   *
   * Reads the file, extracts YAML frontmatter using the shared parser,
   * and returns structured agent information.
   *
   * @param filePath - Absolute path to the agent .md file
   * @returns Parsed agent info, or null if file missing or has no frontmatter
   */
  function parseAgentFile(filePath: string): AgentFrontmatter | null {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf-8");
    return parseFrontmatter(content);
  }

  /**
   * Read the full content of an agent persona file (after frontmatter).
   *
   * Returns the markdown body of the agent file, stripping the YAML
   * frontmatter block. Used by team dispatch to inject role-specific
   * context into the LLM prompt.
   *
   * @param agentName - Agent identifier (matches filename in .pi/agents/)
   * @returns Persona markdown content, or null if file not found
   */
  function readAgentPersona(agentName: string): string | null {
    const filePath = join(agentsDir, `${agentName}.md`);
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf-8");
    // Strip frontmatter, return body
    return content.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
  }

  // Tool: List available teams
  pi.registerTool({
    name: "luca_list_teams",
    label: "List Agent Teams",
    description:
      "List all registered agent teams with their member agents and descriptions.",
    parameters: {},
    async execute() {
      const teamList = teams.values().map((t) => ({
        name: t.name,
        description: t.description,
        agents: t.agents,
      }));
      return createJsonResponse(teamList);
    },
  });

  // Tool: Define a custom team
  pi.registerTool({
    name: "luca_define_team",
    label: "Define Agent Team",
    description:
      "Define a custom agent team by specifying a name, description, and list of agent names.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Team name (e.g., 'frontend-review')",
        },
        description: {
          type: "string",
          description: "What this team does",
        },
        agents: {
          type: "string",
          description:
            "Comma-separated agent names (e.g., 'code-architect,dx-advocate,ui')",
        },
      },
      required: ["name", "description", "agents"],
    },
    async execute(
      _toolCallId: string,
      params: {
        name: string;
        description: string;
        agents: string;
      },
    ) {
      const agentNames = params.agents
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      // Validate agents exist
      const missing = agentNames.filter(
        (name) => !existsSync(join(agentsDir, `${name}.md`)),
      );
      if (missing.length > 0) {
        return createTextResponse(`Agent(s) not found: ${missing.join(", ")}`);
      }

      teams.set(params.name, {
        name: params.name,
        description: params.description,
        agents: agentNames,
      });

      return createTextResponse(
        `Team "${params.name}" defined with ${agentNames.length} agents: ${agentNames.join(", ")}`,
      );
    },
  });

  // Tool: Dispatch work to a team
  pi.registerTool({
    name: "luca_dispatch_team",
    label: "Dispatch to Team",
    description:
      "Dispatch a task to an agent team. Returns each agent's role description, tool restrictions, and persona context so the LLM can simulate multi-agent review.",
    parameters: {
      type: "object",
      properties: {
        team: {
          type: "string",
          description: "Team name to dispatch to",
        },
        task: {
          type: "string",
          description: "Task description or context for the team",
        },
      },
      required: ["team", "task"],
    },
    async execute(_toolCallId: string, params: { team: string; task: string }) {
      const teamDef = teams.get(params.team);
      if (!teamDef) {
        const available = teams.keys().join(", ");
        return createTextResponse(
          `Team "${params.team}" not found. Available: ${available}`,
        );
      }

      // Build dispatch context for each agent
      const dispatches: Array<{
        agent: string;
        description: string;
        tools: string[];
        model: string;
        persona: string;
      }> = [];

      for (const agentName of teamDef.agents) {
        const info = parseAgentFile(join(agentsDir, `${agentName}.md`));
        const persona = readAgentPersona(agentName) ?? "No persona file found";

        dispatches.push({
          agent: agentName,
          description: info?.description ?? "Unknown agent",
          tools: info?.tools ?? [],
          model: info?.model ?? "default",
          persona:
            persona.length > MAX_PERSONA_LENGTH
              ? persona.slice(0, MAX_PERSONA_LENGTH) + "\n\n[truncated]"
              : persona,
        });
      }

      const result = {
        team: teamDef.name,
        task: params.task,
        agents: dispatches,
        instructions:
          "Review the task from each agent's perspective. Apply each agent's role constraints and expertise. Synthesize findings into a unified response.",
      };

      return createJsonResponse(result);
    },
  });
}
