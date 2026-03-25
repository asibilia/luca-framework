import { SlidersHorizontal } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";

/**
 * Config page stub.
 *
 * Will display the project's .planning/config.json configuration with
 * editable sections for workflow, harness, complexity, gates, and
 * parallelization settings. Content coming in a future phase.
 */
export default function ConfigPage() {
  return (
    <PageContainer title="Config" subtitle="Project configuration viewer">
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
        <SlidersHorizontal className="size-12 opacity-30" />
        <p className="font-mono text-sm">Under construction</p>
        <p className="max-w-md text-center text-xs text-muted-foreground/60">
          This page will display the project configuration from
          .planning/config.json with editable sections for workflow, harness,
          complexity, gates, and parallelization settings.
        </p>
      </div>
    </PageContainer>
  );
}
