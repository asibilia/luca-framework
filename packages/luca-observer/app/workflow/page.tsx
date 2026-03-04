"use client";

import { PageContainer } from "~/components/layout/page-container";
import { StateDiagram } from "~/components/workflow/state-diagram";
import { TransitionLog } from "~/components/workflow/transition-log";
import { WorkflowContextPanel } from "~/components/workflow/workflow-context-panel";
import { useWorkflowState } from "~/hooks/use-workflow-state";
import { useLedger } from "~/hooks/use-ledger";

/**
 * Workflow page — state machine visualization and transition log.
 *
 * Displays a CSS-only state diagram with the current state highlighted,
 * a context panel showing session/phase/complexity metadata, and a
 * scrollable transition log from the session ledger.
 *
 * Subscribes to SpacetimeDB tables for real-time updates.
 */
export default function WorkflowPage() {
  const { data: workflowState, loading: stateLoading } = useWorkflowState();
  const { entries, loading: ledgerLoading } = useLedger(50);

  const currentState = workflowState?.workflow_state ?? "idle";

  return (
    <PageContainer
      title="Workflow"
      subtitle="State machine visualization and transition log"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            State Diagram
          </p>
          {stateLoading ? (
            <div className="flex h-48 items-center justify-center">
              <p className="font-mono text-xs text-muted-foreground animate-pulse">
                Loading state...
              </p>
            </div>
          ) : (
            <StateDiagram currentState={currentState} />
          )}
        </div>

        <WorkflowContextPanel state={workflowState} />
      </div>

      <div>
        <p className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Transition Log
        </p>
        {ledgerLoading ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="font-mono text-xs text-muted-foreground animate-pulse">
              Loading ledger...
            </p>
          </div>
        ) : (
          <TransitionLog entries={entries} />
        )}
      </div>
    </PageContainer>
  );
}
