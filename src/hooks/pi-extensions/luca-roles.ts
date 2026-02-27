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

/** Parsed agent role from .pi/agents/*.md frontmatter. */
interface AgentRole {
  name: string;
  description: string;
  tools: string[];
  model?: string;
}

export default function lucaRoles(pi: any) {
  const cwd = process.cwd();
  const agentsDir = join(cwd, ".pi", "agents");

  /** Currently active role (null = unrestricted). */
  let activeRole: AgentRole | null = null;

  /**
   * Parse YAML frontmatter from a .pi/agents/*.md file.
   * Extracts name, description, tools, and model fields.
   */
  function parseFrontmatter(content: string): AgentRole | null {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const fm = fmMatch[1];
    const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
    const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
    const model = fm.match(/^model:\s*(.+)$/m)?.[1]?.trim();

    // Parse tools array (YAML list format)
    const tools: string[] = [];
    const toolsMatch = fm.match(/^tools:\n((?:\s+-\s+.+\n?)*)/m);
    if (toolsMatch) {
      const toolLines = toolsMatch[1].match(/^\s+-\s+(.+)$/gm);
      if (toolLines) {
        for (const line of toolLines) {
          const toolName = line.replace(/^\s+-\s+/, "").trim();
          if (toolName) tools.push(toolName);
        }
      }
    }

    if (!name) return null;
    return { name, description, tools, model };
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
      const role = parseFrontmatter(content);
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
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
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
      const role = roles.find((r) => r.name === params.role);

      if (!role) {
        const available = roles.map((r) => r.name).join(", ");
        return {
          content: [
            {
              type: "text",
              text: `Role "${params.role}" not found. Available: ${available}`,
            },
          ],
        };
      }

      activeRole = role;
      return {
        content: [
          {
            type: "text",
            text: `Activated role "${role.name}" — allowed tools: ${role.tools.join(", ")}`,
          },
        ],
      };
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
      return {
        content: [
          {
            type: "text",
            text: `Deactivated role "${previous}" — all tools now unrestricted`,
          },
        ],
      };
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ active: false, role: null }, null, 2),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                active: true,
                role: activeRole.name,
                tools: activeRole.tools,
                model: activeRole.model ?? "default",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });

  // Enforce tool restrictions via tool_call event
  pi.on("tool_call", async (event: any, _ctx: any) => {
    if (!activeRole) return; // No role active, allow all
    if (activeRole.tools.length === 0) return; // No restrictions defined

    const toolName = (event.toolName || "").toLowerCase();

    // Check if the tool is in the allowed list (case-insensitive)
    const allowed = activeRole.tools.some((t) => t.toLowerCase() === toolName);

    if (!allowed) {
      return {
        block: true,
        reason: `Role "${activeRole.name}" does not allow tool "${event.toolName}". Allowed: ${activeRole.tools.join(", ")}`,
      };
    }
  });
}
