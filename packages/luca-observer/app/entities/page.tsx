"use client";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";

/**
 * Entities index page (placeholder).
 *
 * Displays a message directing users to navigate to entity deep-dive
 * pages from other views (Knowledge Graph, Memory, etc.).
 */
export default function EntitiesPage() {
  return (
    <PageContainer title="Entities" subtitle="Entity Browser">
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-mono text-sm text-muted-foreground">
          Navigate to an entity from the Knowledge Graph, Memory Explorer, or
          Decision Trail to view its deep-dive page.
        </p>
      </div>
      <EmptyState message="Select an entity from another view to get started." />
    </PageContainer>
  );
}
