'use client'

import { useCallback, useMemo } from 'react'

import { useAtom, useSetAtom } from 'jotai'

import { Badge } from '~/components/ui/badge'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import type { EntityDetail } from '~/lib/entity-route-helpers'
import { markDirtyAtom } from '~/stores/dirty-tracking'
import { ruleDraftAtom } from '~/stores/entity-atoms'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RuleConfigFormProps = {
    /** Kebab-case rule name. */
    name: string
    /** Full rule detail from the API. */
    detail: EntityDetail
    /** Whether the form is in edit mode. When false, fields render as read-only text. */
    isEditing?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Structured configuration form for the Rule Configure tab.
 *
 * Reads from and writes to `ruleDraftAtom(name)`. Shows identity fields
 * (name, description), rule-specific fields (glob patterns, alwaysApply
 * toggle, enabled toggle), and metadata. Triggers `markDirtyAtom` on
 * every field change.
 *
 * @param name - Rule name for draft atom lookup and dirty tracking.
 * @param detail - Full entity detail providing initial values.
 *
 * @example
 * ```tsx
 * <RuleConfigForm name="no-classes" detail={ruleDetail} />
 * ```
 */
export function RuleConfigForm({
    name,
    detail,
    isEditing,
}: RuleConfigFormProps) {
    const [draft, setDraft] = useAtom(ruleDraftAtom(name))
    const markDirty = useSetAtom(markDirtyAtom)
    const entityKey = `rule:${name}`

    // Parse raw config text to extract editable fields
    const parsedConfig = useMemo(() => {
        return parseRuleConfig(detail.rawConfigText)
    }, [detail.rawConfigText])

    // Merge parsed config with any draft overrides
    const currentValues = useMemo(() => {
        return {
            description:
                (draft.description as string) ?? parsedConfig.description,
            globs: (draft.globs as string) ?? parsedConfig.globs,
            alwaysApply:
                draft.alwaysApply !== undefined
                    ? (draft.alwaysApply as boolean)
                    : parsedConfig.alwaysApply,
            enabled:
                draft.enabled !== undefined
                    ? (draft.enabled as boolean)
                    : parsedConfig.enabled,
        }
    }, [draft, parsedConfig])

    const updateField = useCallback(
        (field: string, value: unknown) => {
            setDraft((prev) => ({ ...prev, [field]: value }))
            markDirty(entityKey)
        },
        [setDraft, markDirty, entityKey]
    )

    return (
        <div className="space-y-4">
            {/* Identity section */}
            <div className="space-y-3 rounded-md border px-3 py-3">
                <h4 className="text-xs font-medium text-muted-foreground">
                    Identity
                </h4>

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
                            onChange={(e) =>
                                updateField('description', e.target.value)
                            }
                            rows={3}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="Rule description..."
                        />
                    ) : (
                        <p className="text-sm text-foreground">
                            {currentValues.description || 'No description'}
                        </p>
                    )}
                </div>
            </div>

            {/* Rule-specific section */}
            <div className="space-y-3 rounded-md border px-3 py-3">
                <h4 className="text-xs font-medium text-muted-foreground">
                    Rule Settings
                </h4>

                <div className="space-y-1">
                    <label
                        htmlFor={`${name}-globs`}
                        className="text-xs font-medium text-muted-foreground"
                    >
                        Glob Patterns
                    </label>
                    {isEditing ? (
                        <>
                            <Input
                                id={`${name}-globs`}
                                value={currentValues.globs}
                                onChange={(e) =>
                                    updateField('globs', e.target.value)
                                }
                                className="h-8 font-mono text-xs"
                                placeholder="path/to/files/*.ext, other/**/*"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Comma-separated glob patterns for file matching
                            </p>
                        </>
                    ) : (
                        <p className="font-mono text-xs text-foreground">
                            {currentValues.globs || 'None'}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-sm font-medium">
                            Always Apply
                        </span>
                        <p className="text-xs text-muted-foreground">
                            Apply this rule regardless of file match
                        </p>
                    </div>
                    {isEditing ? (
                        <Switch
                            checked={currentValues.alwaysApply}
                            onCheckedChange={(checked) =>
                                updateField('alwaysApply', checked)
                            }
                        />
                    ) : (
                        <Badge
                            variant={
                                currentValues.alwaysApply
                                    ? 'default'
                                    : 'secondary'
                            }
                            className="text-xs"
                        >
                            {currentValues.alwaysApply ? 'Yes' : 'No'}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-sm font-medium">Enabled</span>
                        <p className="text-xs text-muted-foreground">
                            Whether this rule is active
                        </p>
                    </div>
                    {isEditing ? (
                        <Switch
                            checked={currentValues.enabled}
                            onCheckedChange={(checked) =>
                                updateField('enabled', checked)
                            }
                        />
                    ) : (
                        <Badge
                            variant={
                                currentValues.enabled ? 'default' : 'secondary'
                            }
                            className="text-xs"
                        >
                            {currentValues.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                    )}
                </div>
            </div>

            {/* Metadata section */}
            <div className="space-y-3 rounded-md border px-3 py-3">
                <h4 className="text-xs font-medium text-muted-foreground">
                    Metadata
                </h4>

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
    )
}

// ---------------------------------------------------------------------------
// Config parser
// ---------------------------------------------------------------------------

/**
 * Parse rule config fields from the raw config text.
 *
 * Extracts known fields using regex extraction. This is a best-effort parse
 * for display -- the source of truth remains the raw config text.
 */
function parseRuleConfig(rawConfigText: string): {
    description: string
    globs: string
    alwaysApply: boolean
    enabled: boolean
} {
    const extractString = (key: string): string => {
        const match = rawConfigText.match(
            new RegExp(`${key}\\s*:\\s*["'\`]([^"'\`]*?)["'\`]`)
        )
        return match?.[1] ?? ''
    }

    const extractBool = (key: string, defaultVal: boolean): boolean => {
        const match = rawConfigText.match(
            new RegExp(`${key}\\s*:\\s*(true|false)`)
        )
        return match ? match[1] === 'true' : defaultVal
    }

    return {
        description: extractString('description'),
        globs: extractString('globs'),
        alwaysApply: extractBool('alwaysApply', false),
        enabled: extractBool('enabled', true),
    }
}
