import type { DraftComment } from './drafts-file'
import type { GitHubThread } from './github-conversation'
import type { LineCounts } from './load-pull-request'
import {
    countText,
    formatNumber,
    linkLine,
    stopFilesOf,
    type MapModel,
} from './map-model'
import { escapeHtml } from './webview-html'

import type {
    StoryNoiseKind,
    StoryStop,
} from '../../engine/src/story/story-parts'
import type { Story } from '../../engine/src/story/story-schema'

/**
 * Lanes, stop boxes, inline SVG walk-line/link layer, off-canvas links,
 * and per-stop side panels for the flow Map panel (#776, section 4).
 */

const renderBox = ({
    stop,
    group_id,
    story,
    model,
    line_counts,
    drafts,
    github_threads,
}: {
    stop: StoryStop
    group_id: string
    story: Story
    model: MapModel
    line_counts: LineCounts | null
    drafts: DraftComment[]
    github_threads: GitHubThread[]
}): string => {
    const stop_state = model.stop_states.get(stop.id) ?? 'left'
    const look_here = story.summary.feedback_wanted.stop_id === stop.id
    const files = stopFilesOf({ stop })
    const lines = model.stop_lines.get(stop.id) ?? 0
    const max_blast = stop.changes.reduce(
        (max, change) => Math.max(max, change.blast_radius.dependents_total),
        0
    )
    const untested = stop.changes.some((change) => !change.proof.covered)
    const flag_count = stop.changes.reduce(
        (sum, change) => sum + change.flags.length,
        0
    )
    const first_files = new Set(
        files.filter((path) => model.first_stop_by_path.get(path) === stop.id)
    )
    const draft_count = drafts.filter(
        (draft) => draft.path !== null && first_files.has(draft.path)
    ).length
    const thread_count = github_threads.filter((thread) =>
        first_files.has(thread.path)
    ).length

    const badges: string[] = []
    if (stop_state === 'current') {
        badges.push('<span class="badge badge-current">You are here</span>')
    }
    if (look_here) {
        badges.push('<span class="badge badge-look">Look here</span>')
    }

    const metrics: string[] = []
    if (line_counts !== null && lines > 0) {
        metrics.push(
            `<span class="metric">+${countText({ count: lines, one: 'line', many: 'lines' })}</span>`
        )
    }
    if (max_blast > 0) {
        metrics.push(
            `<span class="metric">blast ${formatNumber({ value: max_blast })}</span>`
        )
    }
    if (untested) {
        metrics.push('<span class="metric metric-warn">untested</span>')
    }
    if (flag_count > 0) {
        metrics.push(
            `<span class="metric metric-flag">${countText({ count: flag_count, one: 'flag', many: 'flags' })}</span>`
        )
    }
    if (draft_count > 0) {
        metrics.push(
            `<span class="metric">${countText({ count: draft_count, one: 'draft', many: 'drafts' })}</span>`
        )
    }
    if (thread_count > 0) {
        metrics.push(
            `<span class="metric">${countText({ count: thread_count, one: 'thread', many: 'threads' })}</span>`
        )
    }

    const bar_html =
        line_counts !== null && model.max_lines > 0
            ? `<div class="bar-track"><div class="bar-fill" data-bar style="width:${Math.round((100 * Math.log(1 + lines)) / Math.log(1 + model.max_lines))}%"></div></div>`
            : ''

    const subtitle =
        stop.kind === 'loose_ends'
            ? countText({ count: files.length, one: 'file', many: 'files' })
            : (stop.path ?? '')

    let loose_html = ''
    if (stop.kind === 'loose_ends') {
        const normal_files = files.filter(
            (path) => (model.noise_by_path.get(path) ?? null) === null
        )
        const noise_files = files
            .map((path) => ({
                path,
                kind: model.noise_by_path.get(path) ?? null,
            }))
            .filter(
                (entry): entry is { path: string; kind: StoryNoiseKind } =>
                    entry.kind !== null
            )
        const normal_list =
            normal_files.length === 0
                ? ''
                : `<ul class="loose-files">${normal_files
                      .map((path) => `<li>${escapeHtml({ text: path })}</li>`)
                      .join('')}</ul>`
        let noise_list = ''
        if (noise_files.length > 0) {
            const noise_lines =
                line_counts === null
                    ? 0
                    : noise_files.reduce(
                          (sum, { path }) =>
                              sum +
                              (line_counts[path]?.added ?? 0) +
                              (line_counts[path]?.removed ?? 0),
                          0
                      )
            const files_text = countText({
                count: noise_files.length,
                one: 'file',
                many: 'files',
            })
            const summary_text =
                line_counts === null
                    ? files_text
                    : `${files_text}, ${countText({ count: noise_lines, one: 'line', many: 'lines' })}`
            noise_list = [
                `<details class="noise-fold" data-fold="noise-${escapeHtml({ text: stop.id })}">`,
                `<summary>${escapeHtml({ text: summary_text })}</summary>`,
                '<ul>',
                ...noise_files.map(
                    ({ path, kind }) =>
                        `<li data-noise="${escapeHtml({ text: kind })}">${escapeHtml({ text: path })}</li>`
                ),
                '</ul>',
                '</details>',
            ].join('\n')
        }
        loose_html = `${normal_list}${noise_list}`
    }

    const look_attr = look_here ? ' data-look-here="true"' : ''
    return [
        `<article class="stop-box" data-stop-id="${escapeHtml({ text: stop.id })}" data-group-id="${escapeHtml({ text: group_id })}" data-state="${stop_state}"${look_attr}>`,
        badges.length === 0
            ? ''
            : `<div class="box-badges">${badges.join(' ')}</div>`,
        `<div class="box-title">${escapeHtml({ text: stop.title })}</div>`,
        `<div class="box-file">${escapeHtml({ text: subtitle })}</div>`,
        metrics.length === 0
            ? ''
            : `<div class="box-metrics">${metrics.join(' ')}</div>`,
        bar_html,
        loose_html,
        '</article>',
    ]
        .filter((part) => part !== '')
        .join('\n')
}

/** Renders the CSS grid of lanes and their stop boxes. */
export const mapLanesHtml = ({
    story,
    model,
    line_counts,
    drafts,
    github_threads,
}: {
    story: Story
    model: MapModel
    line_counts: LineCounts | null
    drafts: DraftComment[]
    github_threads: GitHubThread[]
}): string => {
    type LaneSpec = {
        id: string
        title: string
        note: string | null
        stops: StoryStop[]
    }
    const walk_stops = story.stops.filter((stop) => stop.kind === 'walk')
    const loose_stop =
        story.stops.find((stop) => stop.kind === 'loose_ends') ?? null
    const lanes: LaneSpec[] =
        story.map.groups !== undefined
            ? story.map.groups.map((group) => ({
                  id: group.id,
                  title: group.title,
                  note: group.note,
                  stops: walk_stops.filter(
                      (stop) => stop.group_id === group.id
                  ),
              }))
            : [
                  {
                      id: 'changed-files',
                      title: 'Changed files',
                      note: null,
                      stops: walk_stops,
                  },
              ]
    if (loose_stop !== null) {
        lanes.push({
            id: 'loose-ends',
            title: 'Loose ends',
            note: null,
            stops: [loose_stop],
        })
    }

    return [
        `<div class="lanes" style="--lane-count:${lanes.length}">`,
        ...lanes.map((lane) =>
            [
                `<section class="lane" data-lane="${escapeHtml({ text: lane.id })}">`,
                `<h2 class="lane-title">${escapeHtml({ text: lane.title })}</h2>`,
                lane.note === null
                    ? ''
                    : `<p class="lane-note">${escapeHtml({ text: lane.note })}</p>`,
                '<div class="lane-boxes">',
                ...lane.stops.map((stop) =>
                    renderBox({
                        stop,
                        group_id: lane.id,
                        story,
                        model,
                        line_counts,
                        drafts,
                        github_threads,
                    })
                ),
                '</div>',
                '</section>',
            ]
                .filter((part) => part !== '')
                .join('\n')
        ),
        '</div>',
    ].join('\n')
}

/** Renders the inline SVG layer for the walk line and canvas links. */
export const mapSvgHtml = ({
    story,
    model,
}: {
    story: Story
    model: MapModel
}): string => {
    const segments: string[] = []
    for (let at = 0; at < story.stops.length - 1; at += 1) {
        const from = story.stops[at]
        const to = story.stops[at + 1]
        if (from === undefined || to === undefined) continue
        const from_state = model.stop_states.get(from.id)
        const to_state = model.stop_states.get(to.id)
        const walked =
            from_state === 'done' &&
            (to_state === 'done' || to_state === 'current')
        segments.push(
            `<path class="walk-seg" data-segment="${escapeHtml({ text: `${from.id}-${to.id}` })}" data-from-stop="${escapeHtml({ text: from.id })}" data-to-stop="${escapeHtml({ text: to.id })}" data-walked="${walked ? 'true' : 'false'}" d=""></path>`
        )
    }

    const edges = model.resolved_links
        .filter((resolved) => resolved.on_canvas)
        .map(
            (resolved) =>
                `<path class="link-edge" data-kind="${escapeHtml({ text: resolved.link.kind })}" data-stop-ids="${escapeHtml({ text: resolved.lit_stop_ids.join(' ') })}" data-from-stop="${escapeHtml({ text: resolved.from_first ?? '' })}" data-to-stop="${escapeHtml({ text: resolved.to_first ?? '' })}" d=""></path>`
        )

    return [
        '<svg class="flow-svg" aria-hidden="true">',
        ...edges,
        ...segments,
        '</svg>',
    ].join('\n')
}

/** Renders the closed `<details>` list of links that do not sit on the canvas. */
export const mapOffCanvasHtml = ({ model }: { model: MapModel }): string => {
    const off = model.resolved_links.filter((resolved) => !resolved.on_canvas)
    if (off.length === 0) return ''
    return [
        '<details class="off-canvas" data-fold="off-canvas">',
        `<summary>Off the canvas: ${countText({ count: off.length, one: 'link', many: 'links' })}</summary>`,
        '<ul>',
        ...off.map((resolved) => {
            const extra = resolved.outside
                ? ' <span class="badge">not in this PR</span>'
                : ''
            return `<li data-kind="${escapeHtml({ text: resolved.link.kind })}" data-stop-ids="${escapeHtml({ text: resolved.lit_stop_ids.join(' ') })}">${escapeHtml({ text: linkLine({ link: resolved.link }) })}${extra}</li>`
        }),
        '</ul>',
        '</details>',
    ].join('\n')
}

const reachedFromHtml = ({
    stop,
    model,
}: {
    stop: StoryStop
    model: MapModel
}): string => {
    if (stop.kind === 'loose_ends') return ''
    for (const change of stop.changes) {
        const from_id = change.how_we_got_here.from_change_id
        if (from_id === null) continue
        const origin = model.stop_by_change_id.get(from_id)
        if (origin !== undefined && origin.stop.id !== stop.id) {
            return `<p class="reached-from">Reached from: <button type="button" class="link-btn" data-select-stop="${escapeHtml({ text: origin.stop.id })}">Stop ${formatNumber({ value: origin.index + 1 })}: ${escapeHtml({ text: origin.stop.title })}</button></p>`
        }
    }
    return '<p class="reached-from">Reached from: Start here</p>'
}

/** Renders the hidden side panel for every stop in `story`. */
export const mapPanelsHtml = ({
    story,
    model,
}: {
    story: Story
    model: MapModel
}): string => {
    const panels = story.stops.map((stop, index) => {
        const lit = model.resolved_links.filter((resolved) =>
            resolved.lit_stop_ids.includes(stop.id)
        )
        const connections_html =
            lit.length === 0
                ? '<p class="muted">No links.</p>'
                : `<ul class="connections">${lit
                      .map((resolved) => {
                          const extra = resolved.outside
                              ? ' <span class="badge">not in this PR</span>'
                              : ''
                          return `<li data-connection>${escapeHtml({ text: linkLine({ link: resolved.link }) })}${extra}</li>`
                      })
                      .join('')}</ul>`

        const changes_html = `<ul class="changes">${stop.changes
            .map((change) => {
                const span =
                    change.start_line === change.end_line
                        ? `line ${formatNumber({ value: change.start_line })}`
                        : `lines ${formatNumber({ value: change.start_line })} to ${formatNumber({ value: change.end_line })}`
                return `<li>${escapeHtml({ text: `${change.title} · ${span}` })}</li>`
            })
            .join('')}</ul>`

        const sid = escapeHtml({ text: stop.id })
        return [
            `<section class="side-panel" data-panel-for="${sid}" hidden>`,
            `<h3>Stop ${formatNumber({ value: index + 1 })}: ${escapeHtml({ text: stop.title })}</h3>`,
            `<p class="why-here">${escapeHtml({ text: stop.why_here })}</p>`,
            reachedFromHtml({ stop, model }),
            '<h4>Connections</h4>',
            connections_html,
            '<h4>Changes</h4>',
            changes_html,
            '<div class="panel-actions">',
            `<button type="button" data-stop-action="open" data-stop-id="${sid}">Open in diff</button>`,
            `<button type="button" data-stop-action="mark_looks_good" data-stop-id="${sid}">This stop looks good</button>`,
            `<button type="button" data-stop-action="walk_next" data-stop-id="${sid}">Walk to the next stop</button>`,
            '</div>',
            '</section>',
        ]
            .filter((part) => part !== '')
            .join('\n')
    })
    return `<aside class="side-panels">${panels.join('\n')}</aside>`
}
