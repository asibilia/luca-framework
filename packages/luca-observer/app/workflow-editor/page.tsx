"use client";

import dynamic from "next/dynamic";

import { ErrorBoundary } from "~/components/shared/error-boundary";
import { PageContainer } from "~/components/layout/page-container";

// -- Dynamic import (SSR-safe) -----------------------------------------------

/**
 * WorkflowCanvas loaded via next/dynamic with ssr: false to prevent
 * SSR crashes from React Flow's DOM and browser-only APIs.
 */
const WorkflowCanvas = dynamic(
  () =>
    import("~/components/workflow-editor/workflow-canvas").then(
      (m) => m.WorkflowCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <p className="font-mono text-xs text-muted-foreground">
          Loading workflow editor...
        </p>
      </div>
    ),
  },
);

// -- Page component ----------------------------------------------------------

/**
 * Workflow Editor page.
 *
 * Renders a React Flow v12 graph visualizing the 7-stage Luca autopilot
 * pipeline: Entry → Classify → Discuss → Plan → Execute → Verify → Learn
 * (cyclic back to Classify).
 *
 * The canvas is loaded dynamically with ssr: false to avoid SSR crashes.
 * The container has explicit height so React Flow has non-zero dimensions.
 */
export default function WorkflowEditorPage() {
  return (
    <PageContainer
      title="Workflow Editor"
      subtitle="Visual workflow graph editor"
    >
      {/* 12rem accounts for PageContainer header (~4rem) + outer padding (~4rem) + bottom breathing room (~4rem). */}
      <div className="h-[calc(100vh-12rem)] rounded-lg border border-border/30">
        <ErrorBoundary name="WorkflowCanvas">
          <WorkflowCanvas />
        </ErrorBoundary>
      </div>
    </PageContainer>
  );
}
