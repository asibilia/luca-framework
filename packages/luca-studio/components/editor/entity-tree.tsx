"use client";

import type { MouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";

import { useAtomValue } from "jotai";
import groupBy from "lodash/groupBy";
import {
  Bot,
  ChevronRight,
  Copy,
  Hexagon,
  Plus,
  Search,
  Shield,
  Trash2,
} from "lucide-react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";

import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { dirtySetAtom } from "~/stores/dirty-tracking";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entity item in the tree. */
export type EntityItem = {
  name: string;
  directory: string;
  type: "agent" | "skill" | "rule";
};

/** Context menu action descriptor. */
export type ContextAction = {
  action: "new" | "duplicate" | "delete";
  entity?: EntityItem;
};

/** Props for the EntityTree component. */
export type EntityTreeProps = {
  /** Array of entities to display in the tree. */
  entities: EntityItem[];
  /** Currently selected entity name, or null. */
  selectedName: string | null;
  /** Called when an entity is clicked. */
  onSelect: (name: string) => void;
  /** Called when a context menu action is triggered. */
  onContextAction?: (action: ContextAction) => void;
  /** Additional CSS class names for the outer wrapper. */
  className?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the Lucide icon component for a given entity type.
 */
function entityIcon(type: EntityItem["type"]) {
  switch (type) {
    case "agent":
      return Bot;
    case "skill":
      return Hexagon;
    case "rule":
      return Shield;
  }
}

/**
 * Get the dirty-tracking key for an entity.
 *
 * Matches the convention in dirty-tracking.ts:
 *   - "agent:<name>" for agents
 *   - "skill:<name>" for skills
 *   - "rule:<name>" for rules
 */
function dirtyKey(entity: EntityItem): string {
  return `${entity.type}:${entity.name}`;
}

// ---------------------------------------------------------------------------
// Internal: ContextMenuWrapper
// ---------------------------------------------------------------------------

/**
 * Context menu wrapper for entity items and group headers.
 *
 * Shows New/Duplicate/Delete for entity items, and New only for
 * group headers and empty areas.
 */
function EntityContextMenu({
  entity,
  onAction,
  children,
}: {
  entity?: EntityItem;
  onAction?: (action: ContextAction) => void;
  children: React.ReactNode;
}) {
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>
        {children}
      </ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          className={cn(
            "z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          <ContextMenuPrimitive.Item
            className="flex h-7 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-xs outline-none focus:bg-accent focus:text-accent-foreground"
            onSelect={() => onAction?.({ action: "new", entity })}
          >
            <Plus className="size-3.5" />
            New
          </ContextMenuPrimitive.Item>
          {entity && (
            <>
              <ContextMenuPrimitive.Item
                className="flex h-7 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-xs outline-none focus:bg-accent focus:text-accent-foreground"
                onSelect={() => onAction?.({ action: "duplicate", entity })}
              >
                <Copy className="size-3.5" />
                Duplicate
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Separator className="my-1 h-px bg-border" />
              <ContextMenuPrimitive.Item
                className="flex h-7 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-xs text-destructive outline-none focus:bg-destructive/10 focus:text-destructive"
                onSelect={() => onAction?.({ action: "delete", entity })}
              >
                <Trash2 className="size-3.5" />
                Delete
              </ContextMenuPrimitive.Item>
            </>
          )}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Internal: CollapsibleGroup
// ---------------------------------------------------------------------------

/**
 * A collapsible directory group in the tree.
 */
function CollapsibleGroup({
  directory,
  entities,
  selectedName,
  dirtySet,
  onSelect,
  onContextAction,
}: {
  directory: string;
  entities: EntityItem[];
  selectedName: string | null;
  dirtySet: Set<string>;
  onSelect: (name: string) => void;
  onContextAction?: (action: ContextAction) => void;
}) {
  const [open, setOpen] = useState(true);

  const toggleOpen = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      setOpen((prev) => !prev);
    },
    [],
  );

  return (
    <div>
      {/* Group header */}
      <EntityContextMenu onAction={onContextAction}>
        <button
          type="button"
          onClick={toggleOpen}
          className="flex h-7 w-full items-center gap-1 rounded-sm px-1 text-xs font-semibold text-muted-foreground hover:bg-accent/50"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-150",
              open && "rotate-90",
            )}
          />
          <span className="truncate">{directory}</span>
          <span className="ml-auto text-[10px] tabular-nums opacity-60">
            {entities.length}
          </span>
        </button>
      </EntityContextMenu>

      {/* Entity items */}
      {open && (
        <div className="ml-3 border-l border-border pl-1">
          {entities.map((entity) => {
            const Icon = entityIcon(entity.type);
            const isSelected = entity.name === selectedName;
            const isDirty = dirtySet.has(dirtyKey(entity));

            return (
              <EntityContextMenu
                key={entity.name}
                entity={entity}
                onAction={onContextAction}
              >
                <button
                  type="button"
                  onClick={() => onSelect(entity.name)}
                  className={cn(
                    "flex h-7 w-full items-center gap-1.5 rounded-sm px-1.5 text-sm transition-colors",
                    "hover:bg-accent/50",
                    isSelected && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{entity.name}</span>
                  {isDirty && (
                    <span
                      className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-500"
                      aria-label="Unsaved changes"
                    />
                  )}
                </button>
              </EntityContextMenu>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Tree view component for browsing agents, skills, and rules.
 *
 * Groups entities by directory, supports search/filter, right-click context
 * menus, and dirty indicator dots for entities with unsaved changes.
 *
 * @example
 * ```tsx
 * <EntityTree
 *   entities={[
 *     { name: "lu-router", directory: "luca/", type: "agent" },
 *     { name: "git-commit", directory: "general/", type: "skill" },
 *   ]}
 *   selectedName="lu-router"
 *   onSelect={setSelected}
 *   onContextAction={handleAction}
 * />
 * ```
 */
export function EntityTree({
  entities,
  selectedName,
  onSelect,
  onContextAction,
  className,
}: EntityTreeProps) {
  const [filter, setFilter] = useState("");
  const dirtySet = useAtomValue(dirtySetAtom);

  // Filter entities by name
  const filteredEntities = useMemo(() => {
    if (!filter.trim()) return entities;
    const lower = filter.toLowerCase();
    return entities.filter((e) => e.name.toLowerCase().includes(lower));
  }, [entities, filter]);

  // Group filtered entities by directory
  const grouped = useMemo(
    () => groupBy(filteredEntities, "directory"),
    [filteredEntities],
  );

  // Sorted directory keys
  const directories = useMemo(
    () => Object.keys(grouped).sort(),
    [grouped],
  );

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {/* Search/filter input */}
      <div className="relative px-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Filter entities..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 pl-7 text-xs"
        />
      </div>

      {/* Tree body */}
      <EntityContextMenu onAction={onContextAction}>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
          {directories.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {filter ? "No matching entities" : "No entities"}
            </p>
          ) : (
            directories.map((dir) => (
              <CollapsibleGroup
                key={dir}
                directory={dir}
                entities={grouped[dir]!}
                selectedName={selectedName}
                dirtySet={dirtySet}
                onSelect={onSelect}
                onContextAction={onContextAction}
              />
            ))
          )}
        </div>
      </EntityContextMenu>
    </div>
  );
}
