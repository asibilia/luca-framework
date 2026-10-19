/**
 * The log line for a resume's config reload (#516): what a `config_reloaded`
 * changed, or why a `config_reload_refused` kept the run's own config.
 */
import type { JournalRecord } from '../journal/journal-record'

/** A value of a reloaded config field in a log line; `null` is "none". */
const fieldValue = (value: string | number | string[] | null): string => {
    if (value === null) return 'none'
    if (Array.isArray(value)) return `[${value.join(', ')}]`
    return String(value)
}

/**
 * The log line for a resume's `config_reloaded` or `config_reload_refused`
 * (#516).
 *
 * @example
 * configReloadText({ reload }) // 'config reloaded: prepare changed (make rom -> make rom-cached)'
 */
export const configReloadText = ({
    reload,
}: {
    reload: JournalRecord
}): string => {
    switch (reload.kind) {
        case 'config_reloaded':
            return `config reloaded: ${reload.content.changes
                .map(
                    ({ field, from, to }) =>
                        `${field} changed (${fieldValue(from)} -> ${fieldValue(to)})`
                )
                .join(', ')}`
        case 'config_reload_refused':
            return `kept the run's config, as the repo's can't be used: ${reload.content.reason}`
        default:
            return reload.kind
    }
}
