"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { TodoTracker } from "~/components/dashboard/todo-tracker";

/**
 * Dashboard overview page.
 *
 * Retains TodoTracker and links to Memory page while other views
 * are rebuilt with MuninnDB data sources.
 */
export default function DashboardPage() {
  return (
    <PageContainer title="Dashboard" subtitle="Luca workflow observability">
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Dashboard views are being rebuilt with MuninnDB data sources.
        </p>
        <a
          href="/memory"
          className="mt-2 inline-block font-mono text-sm text-primary underline hover:text-primary/80"
        >
          View Memory Dashboard
        </a>
      </div>
      <ErrorBoundary name="TodoTracker">
        <TodoTracker />
      </ErrorBoundary>
    </PageContainer>
  );
}
