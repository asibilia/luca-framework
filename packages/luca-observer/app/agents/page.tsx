"use client";

import { useState } from "react";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
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
        <EmptyState message="Loading agent data..." />
      ) : agents.length === 0 ? (
        <EmptyState
          title="No Agent Activity"
          message="Agent activity will appear here when agents are invoked during workflow execution. Events stream in real-time via SpacetimeDB."
        />
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
