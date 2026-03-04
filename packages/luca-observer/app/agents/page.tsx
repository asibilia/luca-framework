"use client";

import { useState } from "react";

import { PageContainer } from "~/components/layout/page-container";
import { AgentScorecardTable } from "~/components/agents/agent-scorecard-table";
import { AgentActivityLog } from "~/components/agents/agent-activity-log";
import { AgentRegistryPanel } from "~/components/agents/agent-registry-panel";
import { ToolCallAnalytics } from "~/components/agents/tool-call-analytics";
import { useAgentActivity } from "~/hooks/use-agent-activity";

export default function AgentsPage() {
  const { agents, loading } = useAgentActivity();
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>();

  const activeAgents = agents.map((a) => a.agent_name);
  const invocationCounts = Object.fromEntries(
    agents.map((a) => [a.agent_name, a.invocation_count]),
  );

  return (
    <PageContainer
      title="Agents"
      subtitle="Agent activity, scorecards, and model routing"
    >
      {loading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground animate-pulse">
            Loading agent data...
          </p>
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-mono text-lg font-bold text-muted-foreground">
            No Agent Activity
          </p>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            Agent activity will appear here when agents are invoked during
            workflow execution. Events are captured via SSE.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <AgentScorecardTable
            agents={agents}
            onSelectAgent={setSelectedAgent}
            selectedAgent={selectedAgent}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <AgentActivityLog agents={agents} selectedAgent={selectedAgent} />
            <AgentRegistryPanel
              activeAgents={activeAgents}
              agentInvocationCounts={invocationCounts}
            />
          </div>
          <ToolCallAnalytics />
        </div>
      )}
    </PageContainer>
  );
}
