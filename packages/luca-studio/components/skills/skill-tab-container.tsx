"use client";

import { SkillConfigForm } from "~/components/skills/skill-config-form";
import { EntityTabContainer } from "~/components/shared/entity-tab-container";

import type { EntityDetail } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SkillTabContainerProps = {
  /** Kebab-case skill name. */
  name: string;
  /** Full skill detail from the API. */
  detail: EntityDetail;
  /** Whether the entity is in edit mode. */
  isEditing?: boolean;
  /** Callback to enter edit mode. */
  onEnterEdit?: () => void;
  /** Callback to exit edit mode. */
  onExitEdit?: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around EntityTabContainer for skills.
 *
 * Configures the shared tab container with:
 * - 3 tabs: Configure, Source, Compiled
 * - SkillConfigForm as the config form component
 *
 * @param name - Skill name for dirty tracking key lookup.
 * @param detail - Full entity detail from the API.
 */
export function SkillTabContainer({
  name,
  detail,
  isEditing,
  onEnterEdit,
  onExitEdit,
}: SkillTabContainerProps) {
  return (
    <EntityTabContainer
      name={name}
      detail={detail}
      entityType="skill"
      isEditing={isEditing}
      onEnterEdit={onEnterEdit}
      onExitEdit={onExitEdit}
      configForm={SkillConfigForm}
      hasCompiledTab
    />
  );
}
