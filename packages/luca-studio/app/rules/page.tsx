"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useSetAtom } from "jotai";
import { Loader2, Shield } from "lucide-react";

import { EntityTree } from "~/components/editor/entity-tree";
import { DiffPreview } from "~/components/shared/diff-preview";
import { NavigationGuard } from "~/components/feedback/navigation-guard";
import { SaveBar } from "~/components/feedback/save-bar";
import { RuleTabContainer } from "~/components/rules/rule-tab-container";
import { Skeleton } from "~/components/ui/skeleton";
import { useDirtyTitle } from "~/hooks/use-dirty-title";
import { useEditMode } from "~/hooks/use-edit-mode";
import { useEntityConflict } from "~/hooks/use-entity-conflict";
import { useRuleDetail } from "~/hooks/use-rule-detail";
import { useRuleList } from "~/hooks/use-rule-list";
import { useRuleSave } from "~/hooks/use-rule-save";
import { useUndo } from "~/hooks/use-undo";
import { ruleHistoryAtom } from "~/stores/entity-atoms";
import {
  entitySidebarAtom,
  layoutContextAtom,
  setGlobalSaveCallbackAtom,
} from "~/stores/layout";

import type { EntityItem } from "~/components/editor/entity-tree";

/**
 * Rules browser page.
 *
 * Three-column layout: EntityTree (left) | Tab editor (center).
 * Supports browsing all rules, viewing config/source tabs, editing
 * configuration, and saving changes with ETag concurrency.
 *
 * CRITICAL: Rules use `general/` and `profiles/{language}/` subdirectories,
 * which differs from agents/skills. The directory extraction handles two
 * path levels for profiles/ entries.
 */
export default function RulesPage() {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const setLayoutContext = useSetAtom(layoutContextAtom);
  const setEntitySidebar = useSetAtom(entitySidebarAtom);

  // Set editor layout context on mount (collapses NavRail)
  useEffect(() => {
    setLayoutContext("editor");
    return () => {
      setLayoutContext("dashboard");
    };
  }, [setLayoutContext]);

  // Fetch rule list
  const { rules, loading: listLoading } = useRuleList();

  // Fetch selected rule detail
  const { detail, loading: detailLoading, etag } = useRuleDetail(selectedName);

  // Undo/redo for the selected rule's draft
  const { undo, redo } = useUndo(ruleHistoryAtom(selectedName ?? "__noop__"));

  // Map API summaries to EntityTree items
  // CRITICAL: Rules use profiles/{language}/ subdirectories that need two-level extraction
  const entityItems: EntityItem[] = useMemo(() => {
    return rules.map((rule) => {
      const pathParts = rule.filePath.split("/");
      const srcIdx = pathParts.indexOf("rules");
      let directory = "unknown/";

      if (srcIdx >= 0 && srcIdx + 1 < pathParts.length) {
        const subdir = pathParts[srcIdx + 1];
        if (subdir === "profiles" && srcIdx + 2 < pathParts.length) {
          // Two-level: profiles/{language}/
          directory = `profiles/${pathParts[srcIdx + 2]}/`;
        } else {
          // Single-level: general/
          directory = `${subdir}/`;
        }
      }

      return {
        name: rule.name,
        directory,
        type: "rule" as const,
      };
    });
  }, [rules]);

  // Push entity tree into the LayoutShell entity sidebar slot
  useEffect(() => {
    setEntitySidebar(
      <div className="flex h-full flex-col pt-2">
        <div className="px-2 pb-1.5">
          <h2 className="text-xs font-semibold text-muted-foreground">Rules</h2>
        </div>
        {listLoading ? (
          <div className="space-y-1 px-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : (
          <EntityTree
            entities={entityItems}
            selectedName={selectedName}
            onSelect={setSelectedName}
            className="flex-1 overflow-y-auto"
          />
        )}
      </div>,
    );
    return () => setEntitySidebar(null);
  }, [
    entityItems,
    listLoading,
    selectedName,
    setSelectedName,
    setEntitySidebar,
  ]);

  // Save/discard integration
  const { save, discard } = useRuleSave(selectedName, etag);

  // Edit mode for the selected entity
  const entityKey = selectedName ? `rule:${selectedName}` : "";
  const editMode = useEditMode(entityKey, discard);

  // Browser tab title signal
  useDirtyTitle("rule:");

  const handleSave = useCallback(async () => {
    await save();
    editMode.forceExit();
  }, [save, editMode]);

  const handleDiscard = useCallback(() => {
    discard();
    editMode.forceExit();
  }, [discard, editMode]);

  // Conflict resolution via shared hook
  const {
    entityConflict,
    handleAcceptLocal,
    handleAcceptServer,
    handleDismissConflict,
  } = useEntityConflict({
    entityKey,
    endpoint: "/api/entities/rules",
    name: selectedName,
    metadata: detail?.metadata ?? {},
    discard,
  });

  // Register save callback for centralized Cmd+S shortcut
  const setSaveCallback = useSetAtom(setGlobalSaveCallbackAtom);
  useEffect(() => {
    setSaveCallback(() => save());
    return () => setSaveCallback(null);
  }, [save, setSaveCallback]);

  return (
    <div className="flex h-full flex-col">
      {/* Conflict resolution dialog */}
      {entityConflict && (
        <DiffPreview
          localContent={entityConflict.localContent}
          serverContent={entityConflict.serverContent}
          onAcceptLocal={handleAcceptLocal}
          onAcceptServer={handleAcceptServer}
          onDismiss={handleDismissConflict}
        />
      )}

      {/* Editor area (entity tree is rendered via entitySidebarAtom in LayoutShell) */}
      <div className="flex h-full flex-col overflow-hidden">
        {!selectedName ? (
          <EmptyState />
        ) : detailLoading ? (
          <LoadingState />
        ) : detail ? (
          <RuleTabContainer
            name={selectedName}
            detail={detail}
            isEditing={editMode.isEditing}
            onEnterEdit={editMode.enterEdit}
            onExitEdit={editMode.exitEdit}
          />
        ) : (
          <EmptyState />
        )}

        {/* Save bar scoped to rule entities -- only visible in edit mode */}
        {editMode.isEditing && (
          <SaveBar
            onSave={handleSave}
            onDiscard={handleDiscard}
            entityFilter="rule:"
          />
        )}

        {/* Navigation guard for unsaved changes */}
        <NavigationGuard
          when={editMode.isEditing && editMode.isDirty}
          showDialog={editMode.showExitConfirm}
          onConfirm={editMode.confirmExit}
          onCancel={editMode.cancelExit}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Shield className="size-10 opacity-30" />
      <p className="text-sm">Select a rule to view its configuration</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: Loading state
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <p className="text-sm">Loading rule configuration...</p>
    </div>
  );
}
