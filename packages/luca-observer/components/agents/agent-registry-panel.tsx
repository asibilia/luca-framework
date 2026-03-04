"use client";

import { SectionHeader } from "~/components/layout/section-header";

/**
 * Known agent registry organized by category.
 *
 * Static list derived from the Luca framework agent definitions.
 * Categories match the plan specification.
 */
const AGENT_REGISTRY: {
  category: string;
  color: string;
  agents: string[];
}[] = [
  {
    category: "Orchestration",
    color: "info",
    agents: ["lu-router", "lu-executor", "lu-planner"],
  },
  {
    category: "Code",
    color: "accent",
    agents: ["code-developer", "code-architect", "code-simplifier"],
  },
  {
    category: "Review",
    color: "warning",
    agents: ["dx-advocate", "security-auditor", "performance-auditor", "ui"],
  },
  {
    category: "Research",
    color: "event-convergence",
    agents: [
      "lu-discuss-researcher",
      "lu-phase-researcher",
      "lu-project-researcher",
    ],
  },
  {
    category: "Verification",
    color: "event-harness",
    agents: ["lu-verifier", "lu-test-writer", "lu-debugger"],
  },
  {
    category: "Planning",
    color: "event-state",
    agents: ["lu-pm-planner", "lu-roadmapper", "lu-roadmap-architect"],
  },
  {
    category: "Memory",
    color: "event-memory",
    agents: ["lu-cognition", "lu-learner"],
  },
];

/**
 * Panel listing all known Luca framework agents by category.
 *
 * Displays every agent from the framework registry, grouped by
 * functional category. Active agents (those that have been invoked
 * in the current session) are highlighted with an invocation count
 * badge. Inactive agents appear muted.
 *
 * @param activeAgents - Array of agent names that have recorded events
 * @param agentInvocationCounts - Map of agent name to invocation count
 */
export function AgentRegistryPanel({
  activeAgents,
  agentInvocationCounts,
}: {
  activeAgents: string[];
  agentInvocationCounts: Record<string, number>;
}) {
  const activeSet = new Set(activeAgents);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Agent Registry"
        actions={
          <span className="font-mono text-xs text-muted-foreground">
            {activeAgents.length} /{" "}
            {AGENT_REGISTRY.reduce((sum, c) => sum + c.agents.length, 0)} active
          </span>
        }
      />

      <div className="max-h-96 overflow-y-auto rounded-lg border border-border p-3">
        <div className="flex flex-col gap-4">
          {AGENT_REGISTRY.map((category) => (
            <div key={category.category} className="flex flex-col gap-1.5">
              <h3
                className="font-mono text-xs font-semibold uppercase tracking-wider"
                style={{ color: `var(--color-${category.color})` }}
              >
                {category.category}
              </h3>
              <div className="flex flex-col gap-0.5">
                {category.agents.map((agent) => {
                  const isActive = activeSet.has(agent);
                  const count = agentInvocationCounts[agent];

                  return (
                    <div
                      key={agent}
                      className={`flex items-center justify-between rounded px-2 py-1 font-mono text-xs ${
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isActive ? "bg-success" : "bg-muted-foreground/30"
                          }`}
                        />
                        <span>{agent}</span>
                      </div>
                      {isActive && count !== undefined && count > 0 && (
                        <span
                          className="inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs"
                          style={{
                            borderColor: `var(--color-${category.color})`,
                            color: `var(--color-${category.color})`,
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
