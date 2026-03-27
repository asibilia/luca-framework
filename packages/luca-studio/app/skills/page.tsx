"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAtom, useSetAtom } from "jotai";
import { Hexagon, Loader2 } from "lucide-react";

import { EntityTree } from "~/components/editor/entity-tree";
import { DiffPreview } from "~/components/shared/diff-preview";
import { NavigationGuard } from "~/components/feedback/navigation-guard";
import { SaveBar } from "~/components/feedback/save-bar";
import { ResizableSplit } from "~/components/layout/resizable-split";
import { SkillTabContainer } from "~/components/skills/skill-tab-container";
import { Skeleton } from "~/components/ui/skeleton";
import { useDirtyTitle } from "~/hooks/use-dirty-title";
import { useEditMode } from "~/hooks/use-edit-mode";
import { useSkillDetail } from "~/hooks/use-skill-detail";
import { useSkillList } from "~/hooks/use-skill-list";
import { useSkillSave } from "~/hooks/use-skill-save";
import { useUndo } from "~/hooks/use-undo";
import { conflictAtom } from "~/stores/config-atoms";
import { skillHistoryAtom } from "~/stores/entity-atoms";
import { layoutContextAtom, setGlobalSaveCallbackAtom } from "~/stores/layout";

import type { EntityItem } from "~/components/editor/entity-tree";

/**
 * Skills browser page.
 *
 * Three-column layout: EntityTree (left) | Tab editor (center).
 * Supports browsing all skills, viewing config/source/compiled tabs,
 * editing configuration, and saving changes with ETag concurrency.
 *
 * Clones the established Agents page pattern with skill-specific atoms
 * and hooks.
 */
export default function SkillsPage() {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const setLayoutContext = useSetAtom(layoutContextAtom);
  const [conflict, setConflict] = useAtom(conflictAtom);

  // Set editor layout context on mount (collapses NavRail)
  useEffect(() => {
    setLayoutContext("editor");
    return () => {
      setLayoutContext("dashboard");
    };
  }, [setLayoutContext]);

  // Fetch skill list
  const { skills, loading: listLoading } = useSkillList();

  // Fetch selected skill detail
  const { detail, loading: detailLoading, etag } = useSkillDetail(selectedName);

  // Undo/redo for the selected skill's draft
  const { undo, redo } = useUndo(skillHistoryAtom(selectedName ?? "__noop__"));

  // Map API summaries to EntityTree items
  const entityItems: EntityItem[] = useMemo(() => {
    return skills.map((skill) => {
      // Derive directory from filePath: extract the subdir (general/ or luca/)
      const pathParts = skill.filePath.split("/");
      const srcIdx = pathParts.indexOf("skills");
      const directory =
        srcIdx >= 0 && srcIdx + 1 < pathParts.length
          ? `${pathParts[srcIdx + 1]}/`
          : "unknown/";
      return {
        name: skill.name,
        directory,
        type: "skill" as const,
      };
    });
  }, [skills]);

  // Save/discard integration
  const { save, discard } = useSkillSave(selectedName, etag);

  // Edit mode for the selected entity
  const entityKey = selectedName ? `skill:${selectedName}` : "";
  const editMode = useEditMode(entityKey, discard);

  // Browser tab title signal
  useDirtyTitle("skill:");

  const handleSave = useCallback(async () => {
    await save();
    editMode.forceExit();
  }, [save, editMode]);

  const handleDiscard = useCallback(() => {
    discard();
    editMode.forceExit();
  }, [discard, editMode]);

  // Conflict resolution: does the current conflict match this entity?
  const entityConflict =
    conflict && conflict.entityKey === entityKey ? conflict : null;

  const handleAcceptLocal = useCallback(async () => {
    if (!entityConflict) return;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "If-Match": entityConflict.serverEtag,
    };
    try {
      const res = await fetch(
        `/api/entities/skills/${encodeURIComponent(selectedName ?? "")}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            rawConfigText: entityConflict.localContent,
            metadata: {},
          }),
        },
      );
      if (res.ok) {
        setConflict(null);
      }
    } catch {
      // If force-overwrite fails, keep the conflict dialog open
    }
  }, [entityConflict, selectedName, setConflict]);

  const handleAcceptServer = useCallback(() => {
    setConflict(null);
    discard();
  }, [setConflict, discard]);

  const handleDismissConflict = useCallback(() => {
    setConflict(null);
  }, [setConflict]);

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
      <ResizableSplit
        orientation="horizontal"
        defaultFirstSize={20}
        minFirstSize={15}
        maxFirstSize={30}
      >
        {/* Left panel: Entity tree */}
        <div className="flex h-full flex-col border-r bg-muted/30 pt-2">
          <div className="px-2 pb-1.5">
            <h2 className="text-xs font-semibold text-muted-foreground">
              Skills
            </h2>
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
        </div>

        {/* Right panel: Editor area */}
        <div className="flex h-full flex-col overflow-hidden">
          {!selectedName ? (
            <EmptyState />
          ) : detailLoading ? (
            <LoadingState />
          ) : detail ? (
            <SkillTabContainer
              name={selectedName}
              detail={detail}
              isEditing={editMode.isEditing}
              onEnterEdit={editMode.enterEdit}
              onExitEdit={editMode.exitEdit}
            />
          ) : (
            <EmptyState />
          )}

          {/* Save bar scoped to skill entities -- only visible in edit mode */}
          {editMode.isEditing && (
            <SaveBar
              onSave={handleSave}
              onDiscard={handleDiscard}
              entityFilter="skill:"
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
      </ResizableSplit>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Hexagon className="size-10 opacity-30" />
      <p className="text-sm">Select a skill to view its configuration</p>
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
      <p className="text-sm">Loading skill configuration...</p>
    </div>
  );
}
