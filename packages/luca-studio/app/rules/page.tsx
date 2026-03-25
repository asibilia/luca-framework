import { Shield } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";

/**
 * Rules page stub.
 *
 * Will display registered Luca rules organized by profile, with their
 * enforcement scope, glob patterns, and activation status.
 * Content coming in a future phase.
 */
export default function RulesPage() {
  return (
    <PageContainer title="Rules" subtitle="Rule definitions and profiles">
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
        <Shield className="size-12 opacity-30" />
        <p className="font-mono text-sm">Under construction</p>
        <p className="max-w-md text-center text-xs text-muted-foreground/60">
          This page will display registered Luca rules organized by profile,
          including enforcement scope, glob patterns, and activation status.
        </p>
      </div>
    </PageContainer>
  );
}
