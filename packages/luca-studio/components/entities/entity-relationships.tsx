"use client";

import { EmptyState } from "~/components/shared/empty-state";

/**
 * Safely extract a string field from an unknown object.
 *
 * @param obj - Unknown value to extract from
 * @param key - Property name to look for
 * @returns String value or null if not extractable
 */
function safeString(obj: unknown, key: string): string | null {
  if (obj && typeof obj === "object" && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return null;
}

/**
 * Entity relationships display.
 *
 * Renders the raw relationship data from MuninnDB for an entity.
 * Since the shape varies (unknown[]), fields are extracted safely.
 *
 * @param relationships - Raw relationship array from MuninnDB
 * @param entityName - The entity name (for display context)
 */
export function EntityRelationships({
  relationships,
  entityName,
}: {
  relationships: unknown[];
  entityName: string;
}) {
  if (relationships.length === 0) {
    return (
      <EmptyState
        message={`No relationships found for "${entityName}". Relationships are discovered in the Knowledge Graph.`}
      />
    );
  }

  // Filter to items where we can extract at least one displayable field
  const displayable = relationships
    .map((item) => ({
      concept: safeString(item, "concept"),
      id: safeString(item, "id"),
      type: safeString(item, "type"),
      target: safeString(item, "target"),
    }))
    .filter((d) => d.concept || d.id || d.type || d.target);

  if (displayable.length === 0) {
    return (
      <EmptyState message="Relationship data could not be parsed for display." />
    );
  }

  return (
    <div>
      <p className="font-mono text-xs text-muted-foreground mb-3">
        {displayable.length} relationship{displayable.length !== 1 ? "s" : ""}
      </p>
      <div className="space-y-0">
        {displayable.map((rel, i) => (
          <div
            key={rel.id ?? i}
            className="flex flex-col gap-0.5 border-b border-border py-2 last:border-b-0"
          >
            {rel.concept && (
              <p className="font-mono text-sm font-medium text-foreground">
                {rel.concept}
              </p>
            )}
            {rel.target && (
              <p className="text-sm text-muted-foreground">
                Target: {rel.target}
              </p>
            )}
            <div className="flex items-center gap-3">
              {rel.type && (
                <span className="font-mono text-xs text-muted-foreground/60">
                  {rel.type}
                </span>
              )}
              {rel.id && (
                <span className="font-mono text-xs text-muted-foreground/60">
                  {rel.id}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
