"use client";

import { useState } from "react";

import { Hexagon } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";
import { useUndo } from "~/hooks/use-undo";
import { skillHistoryAtom } from "~/stores/entity-atoms";

/**
 * Skills page.
 *
 * Will display registered Luca skills with their trigger patterns,
 * argument schemas, and usage statistics. Content coming in a future phase.
 *
 * Undo/redo is pre-wired via `useUndo(skillHistoryAtom(selectedName))` so
 * Cmd+Z / Shift+Cmd+Z shortcuts are active as soon as the editor is built out.
 */
export default function SkillsPage() {
  const [selectedName] = useState<string | null>(null);

  // Undo/redo for the selected skill's draft (wired ahead of editor build-out)
  useUndo(skillHistoryAtom(selectedName ?? "__noop__"));

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
