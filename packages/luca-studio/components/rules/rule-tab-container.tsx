'use client'

import { RuleConfigForm } from '~/components/rules/rule-config-form'
import { EntityTabContainer } from '~/components/shared/entity-tab-container'
import type { EntityDetail } from '~/lib/entity-route-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RuleTabContainerProps = {
    /** Kebab-case rule name. */
    name: string
    /** Full rule detail from the API. */
    detail: EntityDetail
    /** Whether the entity is in edit mode. */
    isEditing?: boolean
    /** Callback to enter edit mode. */
    onEnterEdit?: () => void
    /** Callback to exit edit mode. */
    onExitEdit?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around EntityTabContainer for rules.
 *
 * Configures the shared tab container with:
 * - 2 tabs: Configure, Source (no Prompt or Compiled)
 * - RuleConfigForm as the config form component
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
    return (
        <EntityTabContainer
            name={name}
            detail={detail}
            entityType="rule"
            isEditing={isEditing}
            onEnterEdit={onEnterEdit}
            onExitEdit={onExitEdit}
            configForm={RuleConfigForm}
        />
    )
}
