"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useSetAtom } from "jotai";
import { Loader2, Shield } from "lucide-react";

import { EntityTree } from "~/components/editor/entity-tree";
import { SaveBar } from "~/components/feedback/save-bar";
import { ResizableSplit } from "~/components/layout/resizable-split";
import { RuleTabContainer } from "~/components/rules/rule-tab-container";
import { Skeleton } from "~/components/ui/skeleton";
import { useRuleDetail } from "~/hooks/use-rule-detail";
import { useRuleList } from "~/hooks/use-rule-list";
import { useRuleSave } from "~/hooks/use-rule-save";
import { useUndo } from "~/hooks/use-undo";
import { layoutContextAtom } from "~/stores/layout";
import { ruleHistoryAtom } from "~/stores/entity-atoms";

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
  const { canUndo, canRedo, undo, redo } = useUndo(
    ruleHistoryAtom(selectedName ?? "__noop__"),
  );

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

  // Save/discard integration
  const { save, discard } = useRuleSave(selectedName, etag);

  const handleSave = useCallback(async () => {
    await save();
  }, [save]);

  const handleDiscard = useCallback(() => {
    discard();
  }, [discard]);

  // Cmd+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  return (
    <div className="flex h-full flex-col">
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
              Rules
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
            <RuleTabContainer name={selectedName} detail={detail} />
          ) : (
            <EmptyState />
          )}

          {/* Save bar scoped to rule entities */}
          <SaveBar
            onSave={handleSave}
            onDiscard={handleDiscard}
            entityFilter="rule:"
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
