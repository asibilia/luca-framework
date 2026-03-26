"use client";

import { useCallback, useMemo } from "react";

import { useAtom, useSetAtom } from "jotai";

import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { markDirtyAtom } from "~/stores/dirty-tracking";
import { skillDraftAtom } from "~/stores/entity-atoms";

import type { EntityDetail } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SkillConfigFormProps = {
  /** Kebab-case skill name. */
  name: string;
  /** Full skill detail from the API. */
  detail: EntityDetail;
  /** Whether the form is in edit mode. When false, fields render as read-only text. */
  isEditing?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Structured configuration form for the Skill Configure tab.
 *
 * Reads from and writes to `skillDraftAtom(name)`. Shows identity fields
 * (name, description) and metadata (variable name, config type, factory).
 * Triggers `markDirtyAtom` on every field change.
 *
 * @param name - Skill name for draft atom lookup and dirty tracking.
 * @param detail - Full entity detail providing initial values.
 *
 * @example
 * ```tsx
 * <SkillConfigForm name="git-commit" detail={skillDetail} />
 * ```
 */
export function SkillConfigForm({
  name,
  detail,
  isEditing,
}: SkillConfigFormProps) {
  const [draft, setDraft] = useAtom(skillDraftAtom(name));
  const markDirty = useSetAtom(markDirtyAtom);
  const entityKey = `skill:${name}`;

  // Parse raw config text to extract editable fields
  const parsedConfig = useMemo(() => {
    return parseSkillConfig(detail.rawConfigText);
  }, [detail.rawConfigText]);

  // Merge parsed config with any draft overrides
  const currentValues = useMemo(() => {
    return {
      description: (draft.description as string) ?? parsedConfig.description,
      enabled:
        draft.enabled !== undefined
          ? (draft.enabled as boolean)
          : parsedConfig.enabled,
    };
  }, [draft, parsedConfig]);

  const updateField = useCallback(
    (field: string, value: unknown) => {
      setDraft((prev) => ({ ...prev, [field]: value }));
      markDirty(entityKey);
    },
    [setDraft, markDirty, entityKey],
  );

  return (
    <div className="space-y-4">
      {/* Identity section */}
      <div className="rounded-md border px-3 py-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground">Identity</h4>

        <div className="space-y-1">
          <label
            htmlFor={`${name}-name`}
            className="text-xs font-medium text-muted-foreground"
          >
            Name
          </label>
          <Input
            id={`${name}-name`}
            value={name}
            readOnly
            className="h-8 bg-muted/30 font-mono text-xs"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor={`${name}-description`}
            className="text-xs font-medium text-muted-foreground"
          >
            Description
          </label>
          {isEditing ? (
            <textarea
              id={`${name}-description`}
              value={currentValues.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Skill description..."
            />
          ) : (
            <p className="text-sm text-foreground">
              {currentValues.description || "No description"}
            </p>
          )}
        </div>
      </div>

      {/* Configuration section */}
      <div className="rounded-md border px-3 py-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground">
          Configuration
        </h4>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Enabled
          </label>
          {isEditing ? (
            <button
              type="button"
              role="switch"
              aria-checked={currentValues.enabled}
              onClick={() => updateField("enabled", !currentValues.enabled)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                currentValues.enabled ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform",
                  currentValues.enabled ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          ) : (
            <Badge
              variant={currentValues.enabled ? "default" : "secondary"}
              className="text-xs"
            >
              {currentValues.enabled ? "Enabled" : "Disabled"}
            </Badge>
          )}
        </div>
      </div>

      {/* Metadata section */}
      <div className="rounded-md border px-3 py-3 space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground">Metadata</h4>

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Variable Name
          </span>
          <p className="font-mono text-xs text-muted-foreground">
            {detail.metadata.varName}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Config Type
          </span>
          <p className="font-mono text-xs text-muted-foreground">
            {detail.metadata.configType}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Factory Function
          </span>
          <p className="font-mono text-xs text-muted-foreground">
            {detail.metadata.factoryFn}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config parser
// ---------------------------------------------------------------------------

/**
 * Parse skill config fields from the raw config text.
 *
 * Extracts known fields using regex extraction. This is a best-effort parse
 * for display -- the source of truth remains the raw config text.
 */
function parseSkillConfig(rawConfigText: string): {
  description: string;
  enabled: boolean;
} {
  const extractString = (key: string): string => {
    const match = rawConfigText.match(
      new RegExp(`${key}\\s*:\\s*["'\`]([^"'\`]*?)["'\`]`),
    );
    return match?.[1] ?? "";
  };

  const extractBool = (key: string): boolean => {
    const match = rawConfigText.match(
      new RegExp(`${key}\\s*:\\s*(true|false)`),
    );
    return match ? match[1] === "true" : true;
  };

  return {
    description: extractString("description"),
    enabled: extractBool("enabled"),
  };
}
