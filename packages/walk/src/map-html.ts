import type { DraftComment } from './drafts-file'
import type { GitHubThread } from './github-conversation'
import type { LineCounts } from './load-pull-request'
import {
    buildMapModel,
    linkLine,
    mapLanesHtml,
    mapOffCanvasHtml,
    mapPanelsHtml,
    mapSvgHtml,
} from './map-boxes'
import { mapHeaderHtml, type MapWalkState } from './map-header'
import { MAP_SCRIPT } from './map-script'
import { page } from './webview-html'

import type { Story } from '../../engine/src/story/story-schema'

/**
 * The flow Map panel (#776, section 4): mockup A (lanes, stop boxes,
 * walk line, links, side panels) with mockup C's "you are here" header.
 */

export { linkLine }

export type MapHtmlInput = {
    story: Story
    line_counts: LineCounts | null
    state: MapWalkState
    approved_files: string[]
    drafts: DraftComment[]
    github_threads: GitHubThread[]
}

const STYLE = `<style>
:root { color-scheme: light dark; }
body { margin: 0; padding: 12px; font-family: var(--vscode-font-family, sans-serif); font-size: var(--vscode-font-size, 13px); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
.map-header { border: 1px solid var(--vscode-panel-border, #666); border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; background: var(--vscode-sideBar-background, transparent); }
.status-line { font-weight: 600; font-size: 1.05em; }
.progress-line { opacity: 0.85; margin-top: 4px; }
.where-to-look { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
.map-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 12px; align-items: start; }
.canvas-stage { position: relative; }
.flow-svg { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: visible; }
.walk-seg { fill: none; stroke: var(--vscode-textLink-foreground, #3794ff); stroke-width: 2; }
.walk-seg[data-walked="false"] { stroke-dasharray: 4 4; opacity: 0.65; }
.link-edge { fill: none; stroke: var(--vscode-descriptionForeground, #888); stroke-width: 1.5; opacity: 0.2; }
.link-edge.lit { stroke: var(--vscode-focusBorder, #007acc); stroke-width: 2; opacity: 0.9; }
.lanes { position: relative; display: grid; grid-template-columns: repeat(var(--lane-count, 1), minmax(0, 1fr)); gap: 12px; align-items: start; }
.lane { border: 1px solid var(--vscode-panel-border, #666); border-radius: 6px; padding: 8px; background: var(--vscode-sideBar-background, transparent); }
.lane-title { position: relative; z-index: 2; margin: 0 0 4px; font-size: 1em; }
.lane-note { position: relative; z-index: 2; margin: 0 0 8px; opacity: 0.8; font-size: 0.9em; }
.lane-boxes { display: flex; flex-direction: column; gap: 8px; }
.stop-box { position: relative; z-index: 2; border: 1px solid var(--vscode-panel-border, #666); border-radius: 5px; padding: 8px; cursor: pointer; background: var(--vscode-editor-background); }
.stop-box[data-state="current"] { border-color: var(--vscode-focusBorder, #007acc); box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007acc); }
.stop-box[data-state="done"] { opacity: 0.8; }
.stop-box[data-state="unchanged"] { opacity: 0.55; }
.stop-box[data-selected] { outline: 2px solid var(--vscode-textLink-foreground, #3794ff); }
.box-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
.badge { display: inline-block; border: 1px solid var(--vscode-panel-border, #666); border-radius: 3px; padding: 1px 5px; font-size: 0.8em; }
.box-title { font-weight: 600; }
.box-file { opacity: 0.8; font-size: 0.9em; word-break: break-all; }
.box-metrics { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; font-size: 0.85em; }
.bar-track { height: 4px; border-radius: 2px; background: var(--vscode-panel-border, #444); margin-top: 6px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--vscode-textLink-foreground, #3794ff); }
.loose-files { margin: 6px 0 0; padding-left: 16px; font-size: 0.85em; }
.noise-fold { margin-top: 6px; font-size: 0.85em; }
.off-canvas { margin-top: 12px; }
.side-panel { border: 1px solid var(--vscode-panel-border, #666); border-radius: 6px; padding: 10px; background: var(--vscode-sideBar-background, transparent); }
.panel-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.link-btn { background: none; border: none; padding: 0; color: var(--vscode-textLink-foreground, #3794ff); cursor: pointer; text-decoration: underline; font: inherit; }
.muted { opacity: 0.75; }
@media (max-width: 900px) {
    .map-layout { grid-template-columns: 1fr; }
    .lanes { grid-template-columns: 1fr; }
}
</style>`

/** The flow Map panel's HTML. */
export const mapHtml = ({
    story,
    line_counts,
    state,
    approved_files,
    drafts,
    github_threads,
}: MapHtmlInput): string => {
    const model = buildMapModel({ story, line_counts, state })
    const header = mapHeaderHtml({
        story,
        line_counts,
        state,
        stop_lines: model.stop_lines,
        approved_files,
        drafts,
        github_threads,
    })
    const lanes = mapLanesHtml({
        story,
        model,
        line_counts,
        drafts,
        github_threads,
    })
    const svg = mapSvgHtml({ story, model })
    const off_canvas = mapOffCanvasHtml({ model })
    const panels = mapPanelsHtml({ story, model })

    return page({
        title: `Map of #${story.pr_number}`,
        body: [
            STYLE,
            header,
            '<div class="map-layout">',
            '<div class="map-main">',
            '<div class="canvas-stage">',
            svg,
            lanes,
            '</div>',
            off_canvas,
            '</div>',
            panels,
            '</div>',
        ]
            .filter((part) => part !== '')
            .join('\n'),
        script: MAP_SCRIPT,
    })
}
