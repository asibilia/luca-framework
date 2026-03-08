"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { OverviewCards } from "~/components/dashboard/overview-cards";
import { RecentEvents } from "~/components/dashboard/recent-events";
import { RecentTransitions } from "~/components/dashboard/recent-transitions";
import { TodoTracker } from "~/components/dashboard/todo-tracker";
import { useEventStream } from "~/hooks/use-event-stream";
import { useLedger } from "~/hooks/use-ledger";

/**
 * Dashboard overview page.
 *
 * Shows real-time overview cards, live event feed, and recent
 * state machine transitions from the session ledger.
 */
export default function DashboardPage() {
  const { events, connected, clear } = useEventStream();
  const { entries: ledgerEntries } = useLedger(20);

  return (
    <PageContainer
      title="Dashboard"
      subtitle="Real-time workflow observability"
      actions={
        <span
          role="status"
          aria-label={
            connected
              ? "Connection status: live"
              : "Connection status: disconnected"
          }
          className={`inline-flex items-center gap-1.5 font-mono text-xs ${
            connected ? "text-success" : "text-destructive"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "bg-success" : "bg-destructive"
            }`}
          />
          {connected ? "Live" : "Disconnected"}
        </span>
      }
    >
      <ErrorBoundary name="OverviewCards">
        <OverviewCards events={events} />
      </ErrorBoundary>
      <ErrorBoundary name="TodoTracker">
        <TodoTracker />
      </ErrorBoundary>
      <div className="grid gap-6 lg:grid-cols-2">
        <ErrorBoundary name="RecentEvents">
          <RecentEvents events={events} onClear={clear} />
        </ErrorBoundary>
        <ErrorBoundary name="RecentTransitions">
          <RecentTransitions entries={ledgerEntries} />
        </ErrorBoundary>
      </div>
    </PageContainer>
  );
}
