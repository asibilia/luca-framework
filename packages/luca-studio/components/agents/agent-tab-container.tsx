"use client";

import { useMemo } from "react";

import { AgentConfigForm } from "~/components/agents/agent-config-form";
import { EntityTabContainer } from "~/components/shared/entity-tab-container";

import type { EntityDetail } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentTabContainerProps = {
  /** Kebab-case agent name. */
  name: string;
  /** Full agent detail from the API. */
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
 * Thin wrapper around EntityTabContainer for agents.
 *
 * Configures the shared tab container with:
 * - 4 tabs: Configure, Prompt, Source, Compiled
 * - Agent-specific prompt content extraction from rawConfigText
 * - AgentConfigForm as the config form component
 *
 * @param name - Agent name for dirty tracking key lookup.
 * @param detail - Full entity detail from the API.
 */
export function AgentTabContainer({
  name,
  detail,
  isEditing,
  onEnterEdit,
  onExitEdit,
}: AgentTabContainerProps) {
  // Extract prompt-like content from rawConfigText
  const promptContent = useMemo(() => {
    // Try to find prompt, system_prompt, or systemPrompt in the raw config text
    const promptMatch = detail.rawConfigText.match(
      /(?:prompt|system_prompt|systemPrompt)\s*:\s*[`"']([^]*?)[`"']/,
    );
    if (promptMatch) return promptMatch[1];

    // Try template literal
    const templateMatch = detail.rawConfigText.match(
      /(?:prompt|system_prompt|systemPrompt)\s*:\s*`([^]*?)`/,
    );
    if (templateMatch) return templateMatch[1];

    return "No prompt content found in this agent's configuration.";
  }, [detail.rawConfigText]);

  return (
    <EntityTabContainer
      name={name}
      detail={detail}
      entityType="agent"
      isEditing={isEditing}
      onEnterEdit={onEnterEdit}
      onExitEdit={onExitEdit}
      configForm={AgentConfigForm}
      hasPromptTab
      hasCompiledTab
      promptContent={promptContent}
    />
  );
}
