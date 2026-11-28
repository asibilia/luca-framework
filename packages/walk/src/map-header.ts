import type { DraftComment } from './drafts-file'
import type { GitHubThread } from './github-conversation'
import type { LineCounts } from './load-pull-request'
import type { WalkState } from './walk-place'
import { escapeHtml } from './webview-html'

import type { Story } from '../../engine/src/story/story-schema'

/**
 * The "you are here" header and where-to-look strip for the flow Map
 * panel (#776, section 4, from mockup C).
 */

export type MapStopState = 'done' | 'current' | 'left' | 'unchanged'
export type MapWalkState = Omit<WalkState, 'stop_ids'>

const NUMBER_FORMAT = new Intl.NumberFormat('en-US')

/** Formats an integer with en-US grouping (e.g. 6,153). */
export const formatNumber = ({ value }: { value: number }): string =>
    NUMBER_FORMAT.format(value)

/** Picks the singular or plural word for `count`. */
export const plural = ({
    count,
    one,
    many,
}: {
    count: number
    one: string
    many: string
}): string => (count === 1 ? one : many)

/** True when at least one stop is to walk and every stop to walk is done. */
export const isAllWalked = ({ state }: { state: MapWalkState }): boolean => {
    if (state.to_walk_stop_ids.length === 0) return false
    const done = new Set(state.done_stop_ids)
    return state.to_walk_stop_ids.every((id) => done.has(id))
}

/** Computes each stop's visual state (`current`, `done`, `unchanged`, `left`). */
export const stopStatesOf = ({
    story,
    state,
}: {
    story: Story
    state: MapWalkState
}): Map<string, MapStopState> => {
    const to_walk = new Set(state.to_walk_stop_ids)
    const done = new Set(state.done_stop_ids)
    const no_current =
        isAllWalked({ state }) || state.to_walk_stop_ids.length === 0
    const states = new Map<string, MapStopState>()
    for (const stop of story.stops) {
        if (!no_current && state.current_stop_id === stop.id) {
            states.set(stop.id, 'current')
        } else if (done.has(stop.id)) {
            states.set(stop.id, 'done')
        } else if (!to_walk.has(stop.id)) {
            states.set(stop.id, 'unchanged')
        } else {
            states.set(stop.id, 'left')
        }
    }
    return states
}

/** Renders the Map panel's header and where-to-look callout. */
export const mapHeaderHtml = ({
    story,
    line_counts,
    state,
    stop_lines,
    approved_files,
    drafts,
    github_threads,
}: {
    story: Story
    line_counts: LineCounts | null
    state: MapWalkState
    stop_lines: Map<string, number>
    approved_files: string[]
    drafts: DraftComment[]
    github_threads: GitHubThread[]
}): string => {
    const to_walk_set = new Set(state.to_walk_stop_ids)
    const done_set = new Set(state.done_stop_ids)
    const all_walked = isAllWalked({ state })
    const to_walk_stops = story.stops.filter((stop) => to_walk_set.has(stop.id))
    const no_current = all_walked || to_walk_stops.length === 0
    const effective_current_id = no_current ? null : state.current_stop_id
    const current_index =
        effective_current_id === null
            ? -1
            : story.stops.findIndex((stop) => stop.id === effective_current_id)

    const done_to_walk = to_walk_stops.filter(
        (stop) => done_set.has(stop.id) && stop.id !== effective_current_id
    ).length
    const left_stops = to_walk_stops.filter(
        (stop) => !done_set.has(stop.id) || stop.id === effective_current_id
    )

    const total_lines =
        line_counts === null
            ? 0
            : to_walk_stops.reduce(
                  (sum, stop) => sum + (stop_lines.get(stop.id) ?? 0),
                  0
              )
    const minutesFor = ({ stops }: { stops: Story['stops'] }): number => {
        if (line_counts !== null && total_lines > 0) {
            const subset_lines = stops.reduce(
                (sum, stop) => sum + (stop_lines.get(stop.id) ?? 0),
                0
            )
            return Math.max(
                1,
                Math.round(
                    (story.summary.review_minutes * subset_lines) / total_lines
                )
            )
        }
        return Math.max(
            1,
            Math.round(
                (story.summary.review_minutes * stops.length) /
                    Math.max(1, to_walk_stops.length)
            )
        )
    }

    let status_line: string
    if (to_walk_stops.length === 0) {
        status_line = 'Nothing new to walk'
    } else if (all_walked) {
        status_line = `All ${formatNumber({ value: to_walk_stops.length })} ${plural({ count: to_walk_stops.length, one: 'stop', many: 'stops' })} walked`
    } else if (effective_current_id === null && done_to_walk === 0) {
        const mins = minutesFor({ stops: to_walk_stops })
        status_line = `Not started: ${formatNumber({ value: to_walk_stops.length })} ${plural({ count: to_walk_stops.length, one: 'stop', many: 'stops' })}, about ${formatNumber({ value: mins })} ${plural({ count: mins, one: 'minute', many: 'minutes' })}`
    } else {
        const mins = minutesFor({ stops: left_stops })
        const left_text = `${formatNumber({ value: left_stops.length })} ${plural({ count: left_stops.length, one: 'stop', many: 'stops' })} and about ${formatNumber({ value: mins })} ${plural({ count: mins, one: 'minute', many: 'minutes' })} left`
        status_line =
            current_index >= 0
                ? `Stop ${formatNumber({ value: current_index + 1 })} of ${formatNumber({ value: story.stops.length })} · ${left_text}`
                : left_text
    }

    const map_paths = new Set(story.map.files.map(({ path }) => path))
    const approved_count = [...new Set(approved_files)].filter((path) =>
        map_paths.has(path)
    ).length
    const progress_parts = [
        `${formatNumber({ value: done_to_walk })} of ${formatNumber({ value: to_walk_stops.length })} ${plural({ count: to_walk_stops.length, one: 'stop', many: 'stops' })} done`,
    ]
    if (approved_count > 0) {
        progress_parts.push(
            `${formatNumber({ value: approved_count })} ${plural({ count: approved_count, one: 'file looks good', many: 'files look good' })}`
        )
    }
    if (drafts.length > 0) {
        progress_parts.push(
            `${formatNumber({ value: drafts.length })} ${plural({ count: drafts.length, one: 'draft', many: 'drafts' })}`
        )
    }
    if (github_threads.length > 0) {
        progress_parts.push(
            `${formatNumber({ value: github_threads.length })} ${plural({ count: github_threads.length, one: 'thread', many: 'threads' })}`
        )
    }

    const { feedback_wanted } = story.summary
    const source_badge =
        feedback_wanted.source === 'author' ? 'Author' : 'Guessed'
    const pinned_stop_id = feedback_wanted.stop_id ?? null
    const pinned_index =
        pinned_stop_id === null
            ? -1
            : story.stops.findIndex((stop) => stop.id === pinned_stop_id)
    const pinned_stop = pinned_index >= 0 ? story.stops[pinned_index] : null
    const pin_html =
        pinned_stop !== null && pinned_stop !== undefined
            ? `<button type="button" class="link-btn" data-select-stop="${escapeHtml({ text: pinned_stop.id })}">Stop ${formatNumber({ value: pinned_index + 1 })}: ${escapeHtml({ text: pinned_stop.title })}</button>`
            : '<span class="muted">Not tied to a stop.</span>'

    return [
        '<header class="map-header">',
        `<div class="status-line">${escapeHtml({ text: status_line })}</div>`,
        `<div class="progress-line">${escapeHtml({ text: progress_parts.join(' · ') })}</div>`,
        '<div class="where-to-look">',
        `<span class="badge badge-source">${source_badge}</span>`,
        `<span class="ask-text">${escapeHtml({ text: feedback_wanted.text })}</span>`,
        pin_html,
        '</div>',
        '</header>',
    ].join('\n')
}
