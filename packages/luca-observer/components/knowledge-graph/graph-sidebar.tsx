"use client";

import { useCallback } from "react";
import { X } from "lucide-react";

import type { EntityType, GraphNode } from "~/lib/graph-types";
import { TYPE_COLORS } from "~/lib/graph-types";
import { relativeTime } from "~/lib/format";

// -- Constants ---------------------------------------------------------------

/** Maximum member names shown before truncation. */
const MAX_MEMBERS_SHOWN = 20;

// -- Types -------------------------------------------------------------------

export interface GraphSidebarProps {
  /** The selected node to display details for. */
  node: GraphNode;
  /** Close the sidebar. */
  onClose: () => void;
  /** Expand a cluster type (for cluster nodes). */
  onExpandCluster?: (type: string) => void;
  /** Member entity names when the node is a cluster (first N names). */
  memberNames?: string[];
}

// -- Component ---------------------------------------------------------------

/**
 * Right-side detail panel that appears when a graph node is selected.
 *
 * Shows different content for cluster supernodes (type badge, member count,
 * expand button, member list) vs individual nodes (entity name, type,
 * engram count, timestamps, memory link).
 *
 * Slides in from right with CSS transition.
 */
export function GraphSidebar({
  node,
  onClose,
  onExpandCluster,
  memberNames,
}: GraphSidebarProps) {
  const color = TYPE_COLORS[node.type as EntityType] ?? TYPE_COLORS.other;

  const handleExpand = useCallback(() => {
    onExpandCluster?.(node.type);
  }, [onExpandCluster, node.type]);

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card transition-transform duration-300 ease-out">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h3
            className="truncate font-mono text-sm font-semibold text-foreground"
            title={node.name}
          >
            {node.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {node.is_cluster ? (
          <ClusterContent
            node={node}
            color={color}
            memberNames={memberNames}
            onExpand={handleExpand}
          />
        ) : (
          <IndividualContent node={node} color={color} />
        )}
      </div>
    </div>
  );
}

// -- Cluster content ---------------------------------------------------------

function ClusterContent({
  node,
  color,
  memberNames,
  onExpand,
}: {
  node: GraphNode;
  color: string;
  memberNames?: string[];
  onExpand: () => void;
}) {
  const visibleMembers = memberNames?.slice(0, MAX_MEMBERS_SHOWN) ?? [];
  const hiddenCount = (memberNames?.length ?? 0) - visibleMembers.length;

  return (
    <div className="space-y-4">
      {/* Type badge */}
      <div>
        <SidebarLabel>Type</SidebarLabel>
        <TypeBadge type={node.type} color={color} />
      </div>

      {/* Member count */}
      <div>
        <SidebarLabel>Members</SidebarLabel>
        <p className="font-mono text-sm text-foreground">
          {node.child_count} {node.child_count === 1 ? "entity" : "entities"}
        </p>
      </div>

      {/* Total engrams */}
      <div>
        <SidebarLabel>Total Engrams</SidebarLabel>
        <p className="font-mono text-sm text-foreground">
          {node.engram_count.toLocaleString()}
        </p>
      </div>

      {/* Expand button */}
      <button
        type="button"
        onClick={onExpand}
        className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
      >
        Expand Cluster
      </button>

      {/* Member list */}
      {visibleMembers.length > 0 && (
        <div>
          <SidebarLabel>Entities</SidebarLabel>
          <ul className="space-y-1">
            {visibleMembers.map((name) => (
              <li
                key={name}
                className="truncate font-mono text-xs text-muted-foreground"
                title={name}
              >
                {name}
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <p className="mt-1 font-mono text-xs text-muted-foreground/60">
              and {hiddenCount} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// -- Individual content ------------------------------------------------------

function IndividualContent({
  node,
  color,
}: {
  node: GraphNode;
  color: string;
}) {
  return (
    <div className="space-y-4">
      {/* Type badge */}
      <div>
        <SidebarLabel>Type</SidebarLabel>
        <TypeBadge type={node.type} color={color} />
      </div>

      {/* Entity name */}
      <div>
        <SidebarLabel>Entity</SidebarLabel>
        <p
          className="truncate font-mono text-sm font-semibold text-foreground"
          title={node.name}
        >
          {node.name}
        </p>
      </div>

      {/* Engram count */}
      <div>
        <SidebarLabel>Engrams</SidebarLabel>
        <p className="font-mono text-sm text-foreground">
          {node.engram_count.toLocaleString()}
        </p>
      </div>

      {/* Timestamps */}
      {node.first_seen !== null && (
        <div>
          <SidebarLabel>First Seen</SidebarLabel>
          <p className="font-mono text-xs text-muted-foreground">
            {relativeTime(node.first_seen)}
          </p>
        </div>
      )}
      {node.last_seen !== null && (
        <div>
          <SidebarLabel>Last Seen</SidebarLabel>
          <p className="font-mono text-xs text-muted-foreground">
            {relativeTime(node.last_seen)}
          </p>
        </div>
      )}

      {/* Memory link */}
      <a
        href={`/memory?entity=${encodeURIComponent(node.name)}`}
        className="inline-block rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
      >
        View in Memory
      </a>
    </div>
  );
}

// -- Shared sub-components ---------------------------------------------------

function SidebarLabel({ children }: { children: string }) {
  return (
    <p className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground/60">
      {children}
    </p>
  );
}

function TypeBadge({ type, color }: { type: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs font-medium"
      style={{
        backgroundColor: color + "1a",
        color,
        border: `1px solid ${color}33`,
      }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {type}
    </span>
  );
}
