import type { DraftComment } from './drafts-file'
import type { GitHubThread } from './github-conversation'
import { countText, formatNumber, type MapModel } from './map-model'
import { escapeHtml } from './webview-html'

import type { Story } from '../../engine/src/story/story-schema'

/**
 * The "you are here" header and where-to-look strip for the flow Map
 * panel (#776, section 4, from mockup C).
 */

/** Renders the Map panel's header and where-to-look callout. */
export const mapHeaderHtml = ({
    story,
    model,
    approved_files,
    drafts,
    github_threads,
}: {
    story: Story
    model: MapModel
    approved_files: string[]
    drafts: DraftComment[]
    github_threads: GitHubThread[]
}): string => {
    const {
        has_line_counts,
        all_walked,
        effective_current_id,
        to_walk_stops,
        done_to_walk,
        left_stops,
        stop_lines,
    } = model
    const current_index =
        effective_current_id === null
            ? -1
            : story.stops.findIndex((stop) => stop.id === effective_current_id)

    const total_lines = !has_line_counts
        ? 0
        : to_walk_stops.reduce(
              (sum, stop) => sum + (stop_lines.get(stop.id) ?? 0),
              0
          )
    const minutesFor = ({ stops }: { stops: Story['stops'] }): number => {
        if (has_line_counts && total_lines > 0) {
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
        status_line = `All ${countText({ count: to_walk_stops.length, one: 'stop', many: 'stops' })} walked`
    } else if (effective_current_id === null && done_to_walk === 0) {
        const mins = minutesFor({ stops: to_walk_stops })
        status_line = `Not started: ${countText({ count: to_walk_stops.length, one: 'stop', many: 'stops' })}, about ${countText({ count: mins, one: 'minute', many: 'minutes' })}`
    } else {
        const mins = minutesFor({ stops: left_stops })
        const left_text = `${countText({ count: left_stops.length, one: 'stop', many: 'stops' })} and about ${countText({ count: mins, one: 'minute', many: 'minutes' })} left`
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
        `${formatNumber({ value: done_to_walk })} of ${countText({ count: to_walk_stops.length, one: 'stop', many: 'stops' })} done`,
    ]
    if (approved_count > 0) {
        progress_parts.push(
            countText({
                count: approved_count,
                one: 'file looks good',
                many: 'files look good',
            })
        )
    }
    if (drafts.length > 0) {
        progress_parts.push(
            countText({ count: drafts.length, one: 'draft', many: 'drafts' })
        )
    }
    if (github_threads.length > 0) {
        progress_parts.push(
            countText({
                count: github_threads.length,
                one: 'thread',
                many: 'threads',
            })
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
