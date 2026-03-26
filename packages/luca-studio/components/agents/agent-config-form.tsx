"use client";

import { useCallback, useMemo, useState } from "react";

import { useAtom, useSetAtom } from "jotai";
import { ChevronRight } from "lucide-react";

import { ModelRoutingDisplay } from "~/components/agents/model-routing-display";
import { ValidationBanner } from "~/components/feedback/validation-banner";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { markDirtyAtom } from "~/stores/dirty-tracking";
import { agentDraftAtom } from "~/stores/entity-atoms";

import type { EntityDetail } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentConfigFormProps = {
  /** Kebab-case agent name. */
  name: string;
  /** Full agent detail from the API. */
  detail: EntityDetail;
  /** Whether the form is in edit mode. When false, fields render as read-only text. */
  isEditing?: boolean;
};

// ---------------------------------------------------------------------------
// Internal: CollapsibleSection
// ---------------------------------------------------------------------------

/**
 * Simple collapsible section with a chevron indicator.
 */
function CollapsibleSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex h-9 w-full items-center gap-2 rounded-t-md px-3 text-sm font-medium hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
        {title}
      </button>
      {open && <div className="space-y-3 border-t px-3 py-3">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: FormField
// ---------------------------------------------------------------------------

/**
 * Labeled form field wrapper.
 */
function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Structured configuration form for the Agent Configure tab.
 *
 * Reads from and writes to `agentDraftAtom(name)`. Organizes fields into
 * collapsible sections: Identity, Model Configuration, Routing, and Metadata.
 * Triggers `markDirtyAtom` on every field change.
 *
 * @param name - Agent name for draft atom lookup and dirty tracking.
 * @param detail - Full entity detail providing initial values.
 *
 * @example
 * ```tsx
 * <AgentConfigForm name="lu-router" detail={agentDetail} />
 * ```
 */
export function AgentConfigForm({
  name,
  detail,
  isEditing,
}: AgentConfigFormProps) {
  const [draft, setDraft] = useAtom(agentDraftAtom(name));
  const markDirty = useSetAtom(markDirtyAtom);
  const entityKey = `agent:${name}`;

  // Parse raw config text to extract editable fields
  const parsedConfig = useMemo(() => {
    return parseAgentConfig(detail.rawConfigText);
  }, [detail.rawConfigText]);

  // Merge parsed config with any draft overrides
  const currentValues = useMemo(() => {
    return {
      description: (draft.description as string) ?? parsedConfig.description,
      enabled:
        draft.enabled !== undefined
          ? (draft.enabled as boolean)
          : parsedConfig.enabled,
      modelTier: (draft.modelTier as string) ?? parsedConfig.modelTier,
      purpose: (draft.purpose as string) ?? parsedConfig.purpose,
      stage: (draft.stage as string) ?? parsedConfig.stage,
      routingPreset:
        (draft.routingPreset as string) ?? parsedConfig.routingPreset,
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
      {/* Validation banner */}
      <ValidationBanner entityKey={entityKey} />

      {/* Identity section */}
      <CollapsibleSection title="Identity" defaultOpen>
        <FormField label="Name" htmlFor={`${name}-name`}>
          <Input
            id={`${name}-name`}
            value={name}
            readOnly
            className="h-8 bg-muted/30 font-mono text-xs"
          />
        </FormField>

        <FormField label="Description" htmlFor={`${name}-description`}>
          {isEditing ? (
            <textarea
              id={`${name}-description`}
              value={currentValues.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Agent description..."
            />
          ) : (
            <p className="text-sm text-foreground">
              {currentValues.description || "No description"}
            </p>
          )}
        </FormField>
      </CollapsibleSection>

      {/* Model Configuration section */}
      <CollapsibleSection title="Model Configuration" defaultOpen>
        <FormField label="Enabled">
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
        </FormField>

        <FormField label="Model Tier" htmlFor={`${name}-model-tier`}>
          {isEditing ? (
            <select
              id={`${name}-model-tier`}
              value={currentValues.modelTier}
              onChange={(e) => updateField("modelTier", e.target.value)}
              className="h-8 w-full rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Not specified</option>
              <option value="fast">fast (haiku/lightweight)</option>
              <option value="balanced">balanced (sonnet/standard)</option>
              <option value="capable">capable (opus/deep analysis)</option>
            </select>
          ) : (
            <Badge variant="secondary" className="font-mono text-xs">
              {currentValues.modelTier || "Not specified"}
            </Badge>
          )}
        </FormField>
      </CollapsibleSection>

      {/* Routing section */}
      <CollapsibleSection title="Routing" defaultOpen={false}>
        <ModelRoutingDisplay routingPreset={currentValues.routingPreset} />
      </CollapsibleSection>

      {/* Metadata section */}
      <CollapsibleSection title="Metadata" defaultOpen={false}>
        <FormField label="Purpose" htmlFor={`${name}-purpose`}>
          {isEditing ? (
            <Input
              id={`${name}-purpose`}
              value={currentValues.purpose}
              onChange={(e) => updateField("purpose", e.target.value)}
              className="h-8 text-sm"
              placeholder="Agent purpose..."
            />
          ) : (
            <p className="text-sm text-foreground">
              {currentValues.purpose || "Not specified"}
            </p>
          )}
        </FormField>

        <FormField label="Stage">
          <Badge variant="secondary" className="font-mono text-xs">
            {currentValues.stage || "production"}
          </Badge>
        </FormField>

        <FormField label="Variable Name">
          <span className="font-mono text-xs text-muted-foreground">
            {detail.metadata.varName}
          </span>
        </FormField>

        <FormField label="Config Type">
          <span className="font-mono text-xs text-muted-foreground">
            {detail.metadata.configType}
          </span>
        </FormField>

        <FormField label="Factory Function">
          <span className="font-mono text-xs text-muted-foreground">
            {detail.metadata.factoryFn}
          </span>
        </FormField>
      </CollapsibleSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config parser
// ---------------------------------------------------------------------------

/**
 * Parse agent config fields from the raw config text.
 *
 * Extracts known fields like description, enabled, model_tier, purpose, and
 * stage from the raw TypeScript config object text using regex extraction.
 * This is a best-effort parse for display -- the source of truth remains
 * the raw config text for round-trip writes.
 */
function parseAgentConfig(rawConfigText: string): {
  description: string;
  enabled: boolean;
  modelTier: string;
  purpose: string;
  stage: string;
  routingPreset: string;
} {
  const extractString = (key: string): string => {
    // Match both quoted strings and template literals
    const quotedMatch = rawConfigText.match(
      new RegExp(`${key}\\s*:\\s*["'\`]([^"'\`]*?)["'\`]`),
    );
    if (quotedMatch) return quotedMatch[1] ?? "";
    return "";
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
    modelTier: extractString("model_tier") || extractString("modelTier"),
    purpose: extractString("purpose"),
    stage: extractString("stage"),
    routingPreset:
      extractString("model_routing") || extractString("modelRouting"),
  };
}
