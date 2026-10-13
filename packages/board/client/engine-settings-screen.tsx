import { useState } from 'react'

import { useSettings, type PluginSurfaceProps } from '@getpaseo/plugin/client'
import {
    SettingsAction,
    SettingsCard,
    SettingsInput,
    SettingsSection,
} from '@getpaseo/plugin/client/ui'
import { Text, View } from 'react-native'

import { RUN_USAGE } from '../shared/board-state'
import { engineSettings, type EngineSettings } from '../shared/engine-settings'

/** A usage line as typed, or the saved one; `null` when it isn't 0 to 100. */
const lineOf = (typed: string | undefined, saved: number): number | null => {
    if (typed === undefined) return saved
    const line = Number(typed.trim())
    return typed.trim() !== '' && line >= 0 && line <= 100 ? line : null
}

/**
 * Settings → Plugins → luca-board: where the engine and Bun live on this
 * host, and the usage lines. Edits are a draft until Save.
 */
export const EngineSettingsScreen = ({ theme, layout }: PluginSurfaceProps) => {
    const settings = useSettings(engineSettings)
    const [draft, setDraft] = useState<
        Partial<Pick<EngineSettings, 'engine_path' | 'bun_path'>>
    >({})
    const [lineDraft, setLineDraft] = useState<{
        weekly_line?: string
        five_hour_line?: string
    }>({})
    const muted = { color: theme.colors.foregroundMuted, fontSize: 13 }
    const danger = { color: theme.colors.statusDanger, fontSize: 13 }
    const gap = { gap: layout.compact ? 12 : 16 }

    if (settings.status === 'loading') {
        return <Text style={muted}>Loading the engine settings…</Text>
    }
    if (settings.status === 'error') {
        return (
            <Text style={danger}>
                Couldn't read the settings: {settings.error}
            </Text>
        )
    }
    if (settings.status === 'invalid') {
        return (
            <View style={gap}>
                <Text style={danger}>
                    The saved engine settings are invalid: {settings.error}
                </Text>
                <SettingsCard>
                    <SettingsAction
                        label="Reset to defaults"
                        actionLabel="Reset"
                        onPress={() => void settings.reset()}
                        disabled={settings.saving}
                    />
                </SettingsCard>
            </View>
        )
    }

    const values: EngineSettings = { ...settings.values, ...draft }
    const lines = {
        weekly_line: lineOf(lineDraft.weekly_line, values.weekly_line),
        five_hour_line: lineOf(lineDraft.five_hour_line, values.five_hour_line),
    }
    const badLine = lines.weekly_line === null || lines.five_hour_line === null
    const dirty =
        values.engine_path !== settings.values.engine_path ||
        values.bun_path !== settings.values.bun_path ||
        lines.weekly_line !== settings.values.weekly_line ||
        lines.five_hour_line !== settings.values.five_hour_line
    const save = async () => {
        if (lines.weekly_line === null || lines.five_hour_line === null) return
        const saved = await settings.save(
            {
                engine_path: values.engine_path.trim(),
                bun_path: values.bun_path.trim(),
                weekly_line: lines.weekly_line,
                five_hour_line: lines.five_hour_line,
            },
            settings.revision
        )
        if (saved) {
            setDraft({})
            setLineDraft({})
        }
    }

    return (
        <View style={gap}>
            <SettingsSection title="Engine">
                <SettingsCard>
                    <SettingsInput
                        label="Engine path"
                        hint="The absolute path to the engine's luca-run.ts. Leave it empty to use an installed luca-run command (~/.bun/bin, /opt/homebrew/bin, or /usr/local/bin)."
                        placeholder="/Users/you/luca-framework/packages/engine/src/cli/luca-run.ts"
                        initialValue={settings.values.engine_path}
                        onChangeText={(engine_path) =>
                            setDraft((current) => ({ ...current, engine_path }))
                        }
                    />
                    <SettingsInput
                        label="Bun path"
                        hint="The absolute path to Bun, used with the engine path. Leave it empty to use LUCA_BUN, ~/.bun/bin/bun, /opt/homebrew/bin/bun, or /usr/local/bin/bun."
                        placeholder="/Users/you/.bun/bin/bun"
                        initialValue={settings.values.bun_path}
                        onChangeText={(bun_path) =>
                            setDraft((current) => ({ ...current, bun_path }))
                        }
                    />
                </SettingsCard>
            </SettingsSection>
            <SettingsSection title="Usage lines">
                <SettingsCard>
                    <SettingsInput
                        label="Weekly line (%)"
                        hint="Every Luca run pauses once the account's weekly window is this full, and carries on when it resets or the line is raised. Default 80."
                        placeholder="80"
                        initialValue={String(settings.values.weekly_line)}
                        onChangeText={(weekly_line) =>
                            setLineDraft((current) => ({
                                ...current,
                                weekly_line,
                            }))
                        }
                    />
                    <SettingsInput
                        label="5-hour line (%)"
                        hint="Every Luca run pauses once the account's 5-hour window is this full. Default 85."
                        placeholder="85"
                        initialValue={String(settings.values.five_hour_line)}
                        onChangeText={(five_hour_line) =>
                            setLineDraft((current) => ({
                                ...current,
                                five_hour_line,
                            }))
                        }
                    />
                    <SettingsAction
                        label={
                            badLine
                                ? 'A line must be a number from 0 to 100'
                                : dirty
                                  ? 'Unsaved changes'
                                  : 'Saved'
                        }
                        error={settings.saveError}
                        actionLabel={settings.saving ? 'Saving…' : 'Save'}
                        onPress={() => void save()}
                        disabled={!dirty || badLine || settings.saving}
                    />
                </SettingsCard>
            </SettingsSection>
            <Text style={muted}>
                Start a run in a chat with {RUN_USAGE}. The demo is a safe
                practice run. If /luca-run doesn't show up, run /reload-skills
                in that chat.
            </Text>
        </View>
    )
}
