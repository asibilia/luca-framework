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
import { existsSync } from "fs";
import { join } from "path";

import { sendFollowUp } from "./__helpers/follow-up";
import { createRegistry } from "./__helpers/registry";
import { createJsonResponse, createTextResponse } from "./__helpers/response";
import { sanitizeName } from "./__helpers/sanitize";
import { readAgentDef, spawnPiSubprocess } from "./__helpers/spawn";
import {
  subagentRegistry,
  nextSubagentId,
} from "./__helpers/subagent-registry";

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
        (name) => !existsSync(join(agentsDir, `${sanitizeName(name)}.md`)),
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
      "Dispatch a task to an agent team. Returns each agent's role description, tool restrictions, and persona context so the LLM can simulate multi-agent review. " +
      "When background=true, spawns each team member as a background subagent instead of returning metadata.",
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
        background: {
          type: "boolean",
          description:
            "When true, spawn each team member as a background subagent (default: false)",
        },
      },
      required: ["team", "task"],
    },
    async execute(
      _toolCallId: string,
      params: { team: string; task: string; background?: boolean },
    ) {
      const teamDef = teams.get(params.team);
      if (!teamDef) {
        const available = teams.keys().join(", ");
        return createTextResponse(
          `Team "${params.team}" not found. Available: ${available}`,
        );
      }

      // Background mode: spawn each agent as a subagent
      if (params.background) {
        const spawned: Array<{
          agent: string;
          subagent_id: string;
          status: string;
        }> = [];

        for (const agentName of teamDef.agents) {
          const agentDef = readAgentDef(cwd, agentName);
          if (!agentDef) {
            spawned.push({
              agent: agentName,
              subagent_id: "",
              status: "not_found",
            });
            continue;
          }

          const subId = nextSubagentId("team", sanitizeName(agentName));
          const teamName = teamDef.name;
          const state = spawnPiSubprocess({
            id: subId,
            agentName,
            task: params.task,
            cwd,
            model: agentDef.model,
            tools: agentDef.tools,
            systemPrompt: agentDef.systemPrompt,
            source: "luca-teams",
            onComplete: (info) => {
              sendFollowUp(pi, {
                customType: "team-result",
                content: `Team "${teamName}" member "${info.agent}" ${info.status} (${(info.elapsed / 1000).toFixed(1)}s).`,
                details: {
                  team: teamName,
                  subagent_id: info.id,
                  agent: info.agent,
                  status: info.status,
                  exit_code: info.exitCode,
                  elapsed_ms: info.elapsed,
                },
              });
            },
          });

          subagentRegistry.set(subId, state);
          spawned.push({
            agent: agentName,
            subagent_id: subId,
            status: "running",
          });
        }

        return createJsonResponse({
          team: teamDef.name,
          task: params.task,
          background: true,
          spawned_count: spawned.filter((s) => s.status === "running").length,
          agents: spawned,
          instructions:
            "Team members spawned as background subagents. Use luca_subagent_list to monitor progress and luca_subagent_result to check individual outputs.",
        });
      }

      // Standard mode: return agent metadata for LLM simulation
      const dispatches: Array<{
        agent: string;
        description: string;
        tools: string[];
        model: string;
        persona: string;
      }> = [];

      for (const agentName of teamDef.agents) {
        const def = readAgentDef(cwd, agentName);
        const persona = def?.systemPrompt ?? "No persona file found";

        dispatches.push({
          agent: agentName,
          description: def?.frontmatter?.description ?? "Unknown agent",
          tools: def?.frontmatter?.tools ?? [],
          model: def?.frontmatter?.model ?? "default",
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
