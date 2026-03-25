"use client";

import { useState } from "react";

import { Shield } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";
import { useUndo } from "~/hooks/use-undo";
import { ruleHistoryAtom } from "~/stores/entity-atoms";

/**
 * Rules page.
 *
 * Will display registered Luca rules organized by profile, with their
 * enforcement scope, glob patterns, and activation status.
 * Content coming in a future phase.
 *
 * Undo/redo is pre-wired via `useUndo(ruleHistoryAtom(selectedName))` so
 * Cmd+Z / Shift+Cmd+Z shortcuts are active as soon as the editor is built out.
 */
export default function RulesPage() {
  const [selectedName] = useState<string | null>(null);

  // Undo/redo for the selected rule's draft (wired ahead of editor build-out)
  useUndo(ruleHistoryAtom(selectedName ?? "__noop__"));

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
