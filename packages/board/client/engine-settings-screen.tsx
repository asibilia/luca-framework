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

/**
 * Settings → Plugins → luca-board: where the engine and Bun live on this host.
 * Edits are a draft until Save.
 */
export const EngineSettingsScreen = ({ theme, layout }: PluginSurfaceProps) => {
    const settings = useSettings(engineSettings)
    const [draft, setDraft] = useState<Partial<EngineSettings>>({})
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
    const dirty =
        values.engine_path !== settings.values.engine_path ||
        values.bun_path !== settings.values.bun_path
    const save = async () => {
        const saved = await settings.save(
            {
                engine_path: values.engine_path.trim(),
                bun_path: values.bun_path.trim(),
            },
            settings.revision
        )
        if (saved) setDraft({})
    }

    return (
        <View style={gap}>
            <SettingsSection title="Engine">
                <SettingsCard>
                    <SettingsInput
                        label="Engine path"
                        hint="The absolute path to the engine's luca-run.ts. Leave it empty to use an installed luca-run command (~/.bun/bin, /opt/homebrew/bin, or /usr/local/bin)."
                        placeholder="/Users/you/luca-framework/packages/engine/src/luca-run.ts"
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
                    <SettingsAction
                        label={dirty ? 'Unsaved changes' : 'Saved'}
                        error={settings.saveError}
                        actionLabel={settings.saving ? 'Saving…' : 'Save'}
                        onPress={() => void save()}
                        disabled={!dirty || settings.saving}
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
