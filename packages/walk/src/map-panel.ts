import type { Shown } from './load-pull-request'
import { mapHtml } from './map-html'
import type { WalkHost } from './walk-host'
import { page, paragraph } from './webview-html'

/**
 * Opening and live-redrawing the Map panel (#776, section 4): builds the
 * render input from `Shown`, opens the panel on `Show the map`, and
 * refreshes it in place when the walk, approved files, drafts, or loaded
 * pull request change.
 */

const noStoryMapText = ({ pr_number }: { pr_number: number }): string =>
    `#${pr_number} has no story, so it has no map. Use "Write the story" for a guided walk.`

const noStoryMapHtml = ({ pr_number }: { pr_number: number }): string =>
    page({
        title: `Map of #${pr_number}`,
        body: paragraph({ text: noStoryMapText({ pr_number }) }),
    })

const mapHtmlFor = ({ now }: { now: Shown }): string | null => {
    if (now.walk === null || now.walk.story === null) return null
    return mapHtml({
        story: now.walk.story,
        line_counts: now.line_counts,
        state: now.walk.state(),
        approved_files: now.feedback.approvedFiles(),
        drafts: now.feedback.comments(),
        github_threads: now.github_threads,
    })
}

/** Opens the Map panel for `now`, or shows why there is no map. */
export const showMapPanel = async ({
    host,
    now,
}: {
    host: WalkHost
    now: Shown
}): Promise<void> => {
    if (now.walk === null) {
        await host.showMessage({
            kind: 'error',
            text: `#${now.ref.number} has no story to walk. Use "Browse the diff" to read the plain diff.`,
        })
        return
    }
    const html = mapHtmlFor({ now })
    if (html === null) {
        await host.showMessage({
            kind: 'error',
            text: noStoryMapText({ pr_number: now.ref.number }),
        })
        return
    }
    await host.showPanel({
        id: 'map',
        title: `Map of #${now.ref.number}`,
        html,
    })
}

/** Redraws the Map panel if it is open, without revealing or opening it. */
export const refreshMapPanel = async ({
    host,
    now,
}: {
    host: WalkHost
    now: Shown
}): Promise<void> => {
    const html =
        mapHtmlFor({ now }) ?? noStoryMapHtml({ pr_number: now.ref.number })
    await host.refreshPanel({ id: 'map', html })
}
