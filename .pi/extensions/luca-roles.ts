/**
 * Luca Agent Roles Extension for Pi
 *
 * Enforces tool-restricted agent roles by reading persona files from
 * .pi/agents/, parsing YAML frontmatter for allowed tools, and blocking
 * unauthorized tool calls when a role is active.
 *
 * Source: src/hooks/pi-extensions/luca-roles.ts
 * Deployed to: .pi/extensions/luca-roles.ts
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

import type { AgentFrontmatter } from "./__helpers/frontmatter";
import { parseFrontmatter } from "./__helpers/frontmatter";
import { createJsonResponse, createTextResponse } from "./__helpers/response";
import { normalizeToolName } from "./__helpers/sanitize";

/** Parsed agent role from .pi/agents/*.md frontmatter. */
interface AgentRole extends AgentFrontmatter {
  tools: string[];
}

export default function lucaRoles(pi: any) {
  const cwd = process.cwd();
  const agentsDir = join(cwd, ".pi", "agents");

  /** Currently active role (null = unrestricted). */
  let activeRole: AgentRole | null = null;

  /**
   * Parse agent frontmatter and normalize tool names for role enforcement.
   */
  function parseAgentRole(content: string): AgentRole | null {
    const fm = parseFrontmatter(content);
    if (!fm) return null;
    return {
      ...fm,
      tools: fm.tools.map(normalizeToolName),
    };
  }

  /**
   * Load all available agent roles from .pi/agents/.
   */
  function loadRoles(): AgentRole[] {
    if (!existsSync(agentsDir)) return [];

    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    const roles: AgentRole[] = [];

    for (const file of files) {
      const content = readFileSync(join(agentsDir, file), "utf-8");
      const role = parseAgentRole(content);
      if (role) roles.push(role);
    }

    return roles;
  }

  // Tool: List available agent roles
  pi.registerTool({
    name: "luca_list_roles",
    label: "List Agent Roles",
    description:
      "List all available agent roles from .pi/agents/ with their tool restrictions and model preferences.",
    parameters: {},
    async execute() {
      const roles = loadRoles();
      const summary = roles.map((r) => ({
        name: r.name,
        description: r.description,
        tools: r.tools,
        model: r.model ?? "default",
      }));
      return createJsonResponse(summary);
    },
  });

  // Tool: Activate a specific agent role
  pi.registerTool({
    name: "luca_activate_role",
    label: "Activate Agent Role",
    description:
      "Activate an agent role to enforce its tool restrictions. Only tools listed in the role's frontmatter will be allowed. Use luca_deactivate_role to remove restrictions.",
    parameters: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description:
            "Agent role name to activate (e.g., lu-executor, code-architect, lu-verifier)",
        },
      },
      required: ["role"],
    },
    async execute(_toolCallId: string, params: { role: string }) {
      const roles = loadRoles();
      const normalizedRoleName = params.role.trim().toLowerCase();
      const role = roles.find(
        (r) => r.name.trim().toLowerCase() === normalizedRoleName,
      );

      if (!role) {
        const available = roles.map((r) => r.name).join(", ");
        return createTextResponse(
          `Role "${params.role}" not found. Available: ${available}`,
        );
      }

      activeRole = role;
      return createTextResponse(
        `Activated role "${role.name}" — allowed tools: ${role.tools.join(", ")}`,
      );
    },
  });

  // Tool: Deactivate current role
  pi.registerTool({
    name: "luca_deactivate_role",
    label: "Deactivate Role",
    description:
      "Deactivate the current agent role, removing all tool restrictions.",
    parameters: {},
    async execute() {
      const previous = activeRole?.name ?? "none";
      activeRole = null;
      return createTextResponse(
        `Deactivated role "${previous}" — all tools now unrestricted`,
      );
    },
  });

  // Tool: Get current active role
  pi.registerTool({
    name: "luca_active_role",
    label: "Get Active Role",
    description:
      "Get the currently active agent role and its tool restrictions.",
    parameters: {},
    async execute() {
      if (!activeRole) {
        return createJsonResponse({ active: false, role: null });
      }
      return createJsonResponse({
        active: true,
        role: activeRole.name,
        tools: activeRole.tools,
        model: activeRole.model ?? "default",
      });
    },
  });

  // Enforce tool restrictions via tool_call event
  pi.on("tool_call", async (event: any, _ctx: any) => {
    if (!activeRole) return; // No role active, allow all
    if (activeRole.tools.length === 0) return; // No restrictions defined

    const toolName = normalizeToolName(event.toolName || "");

    // Check if the tool is in the allowed list (normalized comparison)
    const allowed = activeRole.tools.some((t) => t === toolName);

    if (!allowed) {
      return {
        block: true,
        reason: `Role "${activeRole.name}" does not allow tool "${event.toolName}". Allowed: ${activeRole.tools.join(", ")}`,
      };
    }
  });
}
