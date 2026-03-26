"use client";

import { useMemo, useState } from "react";

import { useAtomValue } from "jotai";
import { Pencil, X } from "lucide-react";

import { RuleConfigForm } from "~/components/rules/rule-config-form";
import { DirtyIndicator } from "~/components/feedback/dirty-indicator";
import { ShikiCodeBlock } from "~/components/shared/shiki-code-block";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import { dirtySetAtom } from "~/stores/dirty-tracking";

import type { EntityDetail } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RuleTabContainerProps = {
  /** Kebab-case rule name. */
  name: string;
  /** Full rule detail from the API. */
  detail: EntityDetail;
  /** Whether the entity is in edit mode. */
  isEditing?: boolean;
  /** Callback to enter edit mode. */
  onEnterEdit?: () => void;
  /** Callback to exit edit mode. */
  onExitEdit?: () => void;
};

// ---------------------------------------------------------------------------
// Tab identifiers
// ---------------------------------------------------------------------------

const TAB_IDS = {
  configure: "configure",
  source: "source",
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Two-tab editor container for rule configuration.
 *
 * Tabs:
 * - **Configure**: Structured form for rule config fields (description,
 *   globs, alwaysApply, enabled).
 * - **Source**: Shiki-highlighted TypeScript source of the raw config.
 *
 * No Compiled tab for rules (simpler output than agents/skills).
 *
 * Shows a `DirtyIndicator` on the Configure tab header when the rule
 * draft has unsaved changes.
 *
 * @param name - Rule name for dirty tracking key lookup.
 * @param detail - Full entity detail from the API.
 */
export function RuleTabContainer({
  name,
  detail,
  isEditing,
  onEnterEdit,
  onExitEdit,
}: RuleTabContainerProps) {
  const [activeTab, setActiveTab] = useState<string>(TAB_IDS.configure);
  const dirtySet = useAtomValue(dirtySetAtom);
  const isDirty = dirtySet.has(`rule:${name}`);

  // Reconstruct approximate source for the Source tab
  const sourceContent = useMemo(() => {
    return `${detail.metadata.prefix}{${detail.rawConfigText}}${detail.metadata.suffix}`;
  }, [detail]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className={cn(
        "flex h-full flex-col overflow-hidden",
        isEditing ? "bg-card" : "bg-background",
      )}
    >
      {/* Edit mode accent bar */}
      {isEditing && <div className="h-0.5 shrink-0 bg-primary" />}

      <div className="shrink-0 border-b px-4">
        {/* Mode header */}
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {isEditing ? (
              <>
                Editing: <span className="text-foreground">{name}</span>
                {isDirty && (
                  <span className="ml-1 text-amber-500">(edited)</span>
                )}
              </>
            ) : (
              name
            )}
          </span>
          <div className="flex items-center gap-1">
            {!isEditing && onEnterEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={onEnterEdit}
                aria-label="Enter edit mode"
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {isEditing && onExitEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={onExitEdit}
                aria-label="Exit edit mode"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        <TabsList variant="line" className="h-9">
          <TabsTrigger value={TAB_IDS.configure} className="gap-1.5">
            Configure
            <DirtyIndicator isDirty={isDirty} size="sm" />
          </TabsTrigger>
          <TabsTrigger value={TAB_IDS.source}>Source</TabsTrigger>
        </TabsList>
      </div>

      {/* Configure tab */}
      <TabsContent
        value={TAB_IDS.configure}
        className="flex-1 overflow-y-auto p-4"
      >
        <RuleConfigForm name={name} detail={detail} isEditing={isEditing} />
      </TabsContent>

      {/* Source tab */}
      <TabsContent
        value={TAB_IDS.source}
        className="flex-1 overflow-y-auto p-4"
      >
        <ShikiCodeBlock code={sourceContent} language="typescript" />
      </TabsContent>
    </Tabs>
  );
}
