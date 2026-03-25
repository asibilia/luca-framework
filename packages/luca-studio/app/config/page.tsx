"use client";

import { useCallback } from "react";

import { AlertTriangle } from "lucide-react";

import { ComplexityTab } from "~/components/config/complexity-tab";
import { GatesTab } from "~/components/config/gates-tab";
import { HarnessTab } from "~/components/config/harness-tab";
import { SaveBar } from "~/components/feedback/save-bar";
import { PageContainer } from "~/components/layout/page-container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useConfigConflict } from "~/hooks/use-config-conflict";
import { useConfigHydration } from "~/hooks/use-config-hydration";
import { useConfigSave } from "~/hooks/use-config-save";

/**
 * Config page with three-tab editor for project configuration.
 *
 * Tabs:
 * - **Complexity Routing**: Model routing matrix and loop budgets
 * - **Gates**: Toggle grid for workflow gates with fail-closed semantics
 * - **Harness**: Check type toggles, command overrides, iteration limits
 *
 * Uses SSE conflict detection to warn when config.json changes externally
 * while the user has unsaved edits. A shared SaveBar at the bottom handles
 * save/discard with ETag concurrency.
 */
export default function ConfigPage() {
  // Hydrate config atom on mount
  useConfigHydration();

  // Save/discard integration
  const { save, discard } = useConfigSave();

  // SSE conflict detection
  const { hasConflict, dismissConflict } = useConfigConflict();

  const handleSave = useCallback(async () => {
    await save();
  }, [save]);

  const handleDiscard = useCallback(() => {
    discard();
    dismissConflict();
  }, [discard, dismissConflict]);

  return (
    <PageContainer title="Config" subtitle="Project configuration editor">
      {/* SSE conflict warning */}
      {hasConflict && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            Config changed externally. Discard your changes or force save.
          </span>
        </div>
      )}

      <Tabs defaultValue="complexity" className="space-y-4">
        <TabsList variant="line">
          <TabsTrigger value="complexity">Complexity Routing</TabsTrigger>
          <TabsTrigger value="gates">Gates</TabsTrigger>
          <TabsTrigger value="harness">Harness</TabsTrigger>
        </TabsList>

        <TabsContent value="complexity" className="pt-2">
          <ComplexityTab />
        </TabsContent>

        <TabsContent value="gates" className="pt-2">
          <GatesTab />
        </TabsContent>

        <TabsContent value="harness" className="pt-2">
          <HarnessTab />
        </TabsContent>
      </Tabs>

      {/* Save bar scoped to config entity */}
      <SaveBar
        onSave={handleSave}
        onDiscard={handleDiscard}
        entityFilter="config"
      />
    </PageContainer>
  );
}
