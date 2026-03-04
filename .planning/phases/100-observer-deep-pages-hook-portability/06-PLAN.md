---
id: "100-06"
title: "Agent activity page"
phase: 100
wave: 2
complexity: MODERATE
depends_on: ["100-01"]
tasks:
  - id: "100-06-1"
    title: "Create agent scorecard table component"
    goal: "Build a table showing per-agent invocation counts, total duration, last invoked timestamp, and activity sparkline"
    verify: "AgentScorecardTable renders all agents with key metrics; sorted by invocation count; handles empty data"
  - id: "100-06-2"
    title: "Create agent activity log component"
    goal: "Build a scrollable log of agent events showing event type, timestamp, duration, and status"
    verify: "AgentActivityLog renders chronological event list; filterable by agent; color-coded by event type"
  - id: "100-06-3"
    title: "Create agent registry panel component"
    goal: "Build a panel listing all known agents with their roles and invocation status (active/inactive)"
    verify: "AgentRegistryPanel renders agent list with role descriptions and status indicators"
  - id: "100-06-4"
    title: "Wire agents page with real data"
    goal: "Replace the stub agents page with scorecard table, activity log, and registry panel"
    verify: "Agents page shows real agent data; handles empty state; no stubs remain"
---

# 100-06: Agent Activity Page

## Goal

Replace the stub agents page with a real agent activity dashboard showing per-agent invocation counts, activity logs, and the agent registry. This page is the primary tool for understanding which agents are being invoked, how often, and their execution performance.

## Context

@packages/luca-observer/src/app/agents/page.tsx -- Current stub page
@packages/luca-observer/src/hooks/use-agent-activity.ts -- Agent activity polling hook (from 100-01)
@packages/luca-observer/src/lib/types.ts -- AgentActivitySnapshotSchema (from 100-01)
@packages/luca-observer/src/lib/constants.ts -- EVENT_TYPES
@packages/luca-observer/src/components/layout/page-container.tsx -- Page layout wrapper
@src/agents/general/ -- All agent files (lu-router, lu-executor, lu-verifier, etc.)
@src/agents/luca/ -- Luca-specific agents (lu-executor, lu-planner)

**Design principles:**

- Scorecard table shows per-agent performance metrics
- Activity log provides chronological event detail
- Agent registry lists all available agents (not just active ones)
- Color-coded by agent role category (router, executor, reviewer, etc.)
- All data from /api/agents route (SSE event-derived)
- Empty state with instructive message when no agent activity recorded

**Known agents (for registry panel):**

| Category      | Agents                                                            |
| ------------- | ----------------------------------------------------------------- |
| Orchestration | lu-router, lu-executor, lu-planner                                |
| Code          | code-developer, code-architect, code-simplifier                   |
| Review        | dx-advocate, security-auditor, performance-auditor, ui            |
| Research      | lu-discuss-researcher, lu-phase-researcher, lu-project-researcher |
| Verification  | lu-verifier, lu-test-writer, lu-debugger                          |
| Planning      | lu-pm-planner, lu-roadmapper, lu-roadmap-architect                |
| Memory        | lu-cognition, lu-learner                                          |

## Tasks

### Task 100-06-1: Create agent scorecard table component

Create `packages/luca-observer/src/components/agents/agent-scorecard-table.tsx`.

A table showing per-agent performance metrics derived from SSE events.

**Key features:**

- Columns: agent name, invocation count, total duration, avg duration, last invoked
- Sorted by invocation count (most active first)
- Duration formatted as human-readable (e.g., "2.5s", "1m 30s")
- Last invoked formatted as relative time (e.g., "5 min ago")
- Row click highlights agent in the activity log
- Empty state for no agent activity

**Props:**

```typescript
interface AgentScorecardTableProps {
  agents: AgentActivitySnapshot[];
  onSelectAgent?: (agentName: string) => void;
  selectedAgent?: string;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/agents/agent-scorecard-table.tsx`
- [ ] Renders all agents in a table sorted by invocation count
- [ ] Duration formatted as human-readable
- [ ] Empty state for no data
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-06-2: Create agent activity log component

Create `packages/luca-observer/src/components/agents/agent-activity-log.tsx`.

A scrollable log showing individual agent events in chronological order.

**Key features:**

- Each event shows: agent name, event type, timestamp, duration (if available), status (if available)
- Color-coded by event type using EVENT_TYPES constants
- Filterable by selected agent (when an agent is selected in the scorecard)
- Newest events first
- Max height with scroll
- Event count indicator

**Props:**

```typescript
interface AgentActivityLogProps {
  agents: AgentActivitySnapshot[];
  selectedAgent?: string;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/agents/agent-activity-log.tsx`
- [ ] Renders events chronologically (newest first)
- [ ] Filterable by agent name
- [ ] Color-coded event types
- [ ] Scrollable container
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-06-3: Create agent registry panel component

Create `packages/luca-observer/src/components/agents/agent-registry-panel.tsx`.

A panel listing all known agents from the Luca framework with their categories and whether they have been invoked in the current session.

**Key features:**

- Lists all known agents organized by category
- Category headers: Orchestration, Code, Review, Research, Verification, Planning, Memory
- Each agent shows: name, invocation status (active = has events, inactive = no events)
- Active agents show invocation count badge
- Color-coded by category
- Static list derived from constants (not API data)

**Props:**

```typescript
interface AgentRegistryPanelProps {
  activeAgents: string[];
  agentInvocationCounts: Record<string, number>;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/agents/agent-registry-panel.tsx`
- [ ] Lists all known agents organized by category
- [ ] Active agents highlighted with invocation count
- [ ] Inactive agents shown as muted
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-06-4: Wire agents page with real data

Replace the stub in `packages/luca-observer/src/app/agents/page.tsx`.

```typescript
"use client";

import { useState } from "react";

import { PageContainer } from "~/components/layout/page-container";
import { AgentScorecardTable } from "~/components/agents/agent-scorecard-table";
import { AgentActivityLog } from "~/components/agents/agent-activity-log";
import { AgentRegistryPanel } from "~/components/agents/agent-registry-panel";
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
            Agent activity will appear here when agents are invoked
            during workflow execution. Events are captured via SSE.
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
            <AgentActivityLog
              agents={agents}
              selectedAgent={selectedAgent}
            />
            <AgentRegistryPanel
              activeAgents={activeAgents}
              agentInvocationCounts={invocationCounts}
            />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
```

**Steps:**

1. Replace the entire content of `packages/luca-observer/src/app/agents/page.tsx`
2. Add "use client" directive
3. Wire useAgentActivity hook
4. Add local state for agent selection (links scorecard to activity log)
5. Show loading, empty, and data states

**Verify:**

- [ ] Agents page shows real data when available
- [ ] Empty state with instructive message when no agent activity
- [ ] Loading state during initial fetch
- [ ] Scorecard table, activity log, and registry all visible
- [ ] Agent selection in scorecard filters the activity log
- [ ] No stub/placeholder content remains
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Agents page fully functional with real data (no stubs)
- [ ] Scorecard table shows per-agent metrics
- [ ] Activity log shows chronological agent events
- [ ] Registry panel shows all known agents with active/inactive status
- [ ] Agent selection cross-filters between scorecard and activity log
- [ ] Page handles empty state gracefully
- [ ] All components follow observer design patterns
- [ ] `bunx --bun tsc --noEmit` passes
