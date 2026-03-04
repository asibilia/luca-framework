"use client";

import { PageContainer } from "~/components/layout/page-container";
import { OverviewCards } from "~/components/dashboard/overview-cards";
import { RecentEvents } from "~/components/dashboard/recent-events";
import { useEventStream } from "~/hooks/use-event-stream";

/**
 * Dashboard overview page.
 *
 * Shows real-time overview cards and live event feed.
 */
export default function DashboardPage() {
  const { events, connected, clear } = useEventStream();

  return (
    <PageContainer
      title="Dashboard"
      subtitle="Real-time workflow observability"
      actions={
        <span
          className={`inline-flex items-center gap-1.5 font-mono text-xs ${
            connected ? "text-success" : "text-destructive"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "bg-success" : "bg-destructive"
            }`}
          />
          {connected ? "Live" : "Disconnected"}
        </span>
      }
    >
      <OverviewCards events={events} />
      <RecentEvents events={events} onClear={clear} />
    </PageContainer>
  );
}
