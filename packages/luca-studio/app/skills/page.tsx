import { Hexagon } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";

/**
 * Skills page stub.
 *
 * Will display registered Luca skills with their trigger patterns,
 * argument schemas, and usage statistics. Content coming in a future phase.
 */
export default function SkillsPage() {
  return (
    <PageContainer title="Skills" subtitle="Registered skill definitions">
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
        <Hexagon className="size-12 opacity-30" />
        <p className="font-mono text-sm">Under construction</p>
        <p className="max-w-md text-center text-xs text-muted-foreground/60">
          This page will display registered Luca skills, their trigger patterns,
          argument schemas, and usage statistics.
        </p>
      </div>
    </PageContainer>
  );
}
