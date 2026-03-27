"use client";

import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the ConfigFormSection shared layout component.
 *
 * Renders a labeled form field with consistent styling across all entity
 * config forms. Supports text, boolean, and read-only display modes.
 */
export type ConfigFormSectionProps = {
  /** Field label text. */
  label: string;
  /** Current field value. */
  value: string | boolean;
  /** Whether the form is in edit mode. */
  isEditing?: boolean;
  /** Callback when the value changes. */
  onChange: (value: unknown) => void;
  /** Field type — determines the input widget. Defaults to "text". */
  type?: "text" | "boolean" | "readonly";
  /** Whether to render a textarea instead of a single-line input. Defaults to false. */
  multiline?: boolean;
  /** HTML `for` attribute for the label. */
  htmlFor?: string;
  /** Input placeholder text. */
  placeholder?: string;
  /** Whether the field is always read-only (regardless of edit mode). */
  readOnly?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Shared layout component for config form fields across entity types.
 *
 * Provides consistent rendering of labeled form fields with support for:
 * - **Text inputs**: Single-line (Input) or multiline (textarea)
 * - **Boolean inputs**: shadcn Switch in edit mode, Badge in read-only mode
 * - **Read-only display**: Static text or always-readonly Input
 *
 * Uses the same label styling (`text-xs font-medium text-muted-foreground`)
 * that was previously duplicated across all three entity config forms.
 *
 * @param label - Field label text displayed above the input.
 * @param value - Current field value (string or boolean).
 * @param isEditing - Whether the parent form is in edit mode.
 * @param onChange - Callback when the value changes.
 * @param type - Input type: "text" (default), "boolean", or "readonly".
 * @param multiline - Whether to use textarea for text fields.
 * @param htmlFor - HTML for attribute linking label to input.
 * @param placeholder - Placeholder text for text inputs.
 * @param readOnly - Force read-only regardless of edit mode.
 *
 * @example
 * ```tsx
 * <ConfigFormSection
 *   label="Description"
 *   value={currentValues.description}
 *   isEditing={isEditing}
 *   onChange={(v) => updateField("description", v)}
 *   multiline
 *   placeholder="Agent description..."
 * />
 * ```
 *
 * @example
 * ```tsx
 * <ConfigFormSection
 *   label="Enabled"
 *   value={currentValues.enabled}
 *   isEditing={isEditing}
 *   onChange={(v) => updateField("enabled", v)}
 *   type="boolean"
 * />
 * ```
 */
export function ConfigFormSection({
  label,
  value,
  isEditing,
  onChange,
  type = "text",
  multiline,
  htmlFor,
  placeholder,
  readOnly,
}: ConfigFormSectionProps) {
  const effectiveEditing = isEditing && !readOnly;

  // ---------------------------------------------------------------------------
  // Boolean field
  // ---------------------------------------------------------------------------

  if (type === "boolean") {
    const boolVal = typeof value === "boolean" ? value : false;

    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        {effectiveEditing ? (
          <div>
            <Switch
              checked={boolVal}
              onCheckedChange={(checked) => onChange(checked)}
            />
          </div>
        ) : (
          <Badge
            variant={boolVal ? "default" : "secondary"}
            className="text-xs"
          >
            {boolVal ? "Enabled" : "Disabled"}
          </Badge>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Text field (single-line or multiline)
  // ---------------------------------------------------------------------------

  const strVal = typeof value === "string" ? value : String(value);

  return (
    <div className="space-y-1">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      {effectiveEditing ? (
        multiline ? (
          <textarea
            id={htmlFor}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={placeholder}
          />
        ) : (
          <Input
            id={htmlFor}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 text-sm"
            placeholder={placeholder}
          />
        )
      ) : readOnly ? (
        <Input
          id={htmlFor}
          value={strVal}
          readOnly
          className="h-8 bg-muted/30 font-mono text-xs"
        />
      ) : (
        <p className="text-sm text-foreground">{strVal || "Not specified"}</p>
      )}
    </div>
  );
}
