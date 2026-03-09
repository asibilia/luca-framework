"use client";

import { EmptyState } from "~/components/shared/empty-state";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { SessionCard } from "~/components/sessions/session-card";

import type { SessionInfo } from "~/hooks/use-session-explorer";
import type { MuninnEntityEngram } from "~/lib/muninn-types";

/**
 * Renders a list of workflow sessions as collapsible cards.
 *
 * Displays a count header, renders a SessionCard for each session,
 * and shows an EmptyState when no sessions are available.
 * Each SessionCard is wrapped in an ErrorBoundary for resilience.
 *
 * @param sessions - Array of parsed session metadata objects
 * @param onFetchDetail - Callback passed to each card for detail expansion
 */
export function SessionList({
  sessions,
  onFetchDetail,
}: {
  sessions: SessionInfo[];
  onFetchDetail: (concept: string) => Promise<MuninnEntityEngram[]>;
}) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No Sessions"
        message="MuninnDB session data will appear here once workflows are executed."
      />
    );
  }

  const count = sessions.length;

  return (
    <div
      role="region"
      aria-label="Session explorer"
      className="flex flex-col rounded-lg border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Sessions
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            Workflow Session History
          </p>
        </div>
        <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {count} {count === 1 ? "session" : "sessions"}
        </span>
      </div>
      <div className="max-h-[36rem] overflow-y-auto">
        {sessions.map((session) => (
          <ErrorBoundary
            key={session.concept}
            name={`Session:${session.session_id}`}
          >
            <SessionCard session={session} onFetchDetail={onFetchDetail} />
          </ErrorBoundary>
        ))}
      </div>
    </div>
  );
}
