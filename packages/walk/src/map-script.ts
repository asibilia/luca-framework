/**
 * Inline page script for the flow Map panel (#776, section 4). Runs under
 * the same nonce after `webview-html.ts`'s shared script and reuses its
 * `vscode` handle without calling `acquireVsCodeApi()` again.
 *
 * A redraw replaces the whole page, so the script keeps what the owner
 * set in `vscode.setState`: the picked stop, the scroll position, and
 * which `<details>` folds (by `data-fold`) are open. It re-measures the
 * lines whenever the canvas changes size (a fold opening, a resize).
 */

export const MAP_SCRIPT = `
(() => {
    const boxes = () => Array.from(document.querySelectorAll('[data-stop-id][data-state]'))
    const panels = () => Array.from(document.querySelectorAll('[data-panel-for]'))
    const edges = () => Array.from(document.querySelectorAll('.link-edge[data-stop-ids]'))

    const readState = () => {
        const saved = typeof vscode.getState === 'function' ? vscode.getState() : null
        return saved && typeof saved === 'object' ? saved : {}
    }
    const saveState = (part) => {
        if (typeof vscode.setState !== 'function') return
        vscode.setState({ ...readState(), ...part })
    }

    const selectStop = (stopId) => {
        if (!stopId) return
        for (const box of boxes()) {
            box.toggleAttribute('data-selected', box.getAttribute('data-stop-id') === stopId)
        }
        for (const panel of panels()) {
            panel.hidden = panel.getAttribute('data-panel-for') !== stopId
        }
        for (const edge of edges()) {
            const ids = (edge.getAttribute('data-stop-ids') || '').split(' ').filter(Boolean)
            edge.classList.toggle('lit', ids.includes(stopId))
        }
        saveState({ selected_stop_id: stopId })
    }

    const layoutLines = () => {
        const stage = document.querySelector('.canvas-stage')
        const svg = document.querySelector('.flow-svg')
        if (!stage || !svg) return
        const base = stage.getBoundingClientRect()
        svg.setAttribute('width', String(Math.max(1, Math.ceil(base.width))))
        svg.setAttribute('height', String(Math.max(1, Math.ceil(base.height))))

        const centers = new Map()
        for (const box of boxes()) {
            const id = box.getAttribute('data-stop-id')
            if (!id) continue
            const rect = box.getBoundingClientRect()
            centers.set(id, {
                x: rect.left - base.left + rect.width / 2,
                y: rect.top - base.top + rect.height / 2,
            })
        }

        const curve = (a, b) => {
            const dx = (b.x - a.x) * 0.4
            return 'M ' + a.x + ' ' + a.y + ' C ' + (a.x + dx) + ' ' + a.y + ', ' + (b.x - dx) + ' ' + b.y + ', ' + b.x + ' ' + b.y
        }

        for (const seg of document.querySelectorAll('[data-segment]')) {
            const from = centers.get(seg.getAttribute('data-from-stop'))
            const to = centers.get(seg.getAttribute('data-to-stop'))
            seg.setAttribute('d', from && to ? curve(from, to) : '')
        }

        for (const edge of edges()) {
            const from = centers.get(edge.getAttribute('data-from-stop'))
            const to = centers.get(edge.getAttribute('data-to-stop'))
            edge.setAttribute('d', from && to ? curve(from, to) : '')
        }
    }

    document.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null
        if (!target) return
        const actionBtn = target.closest('[data-stop-action]')
        if (actionBtn) {
            const action = actionBtn.getAttribute('data-stop-action')
            const stop_id = actionBtn.getAttribute('data-stop-id')
            if (action && stop_id) {
                vscode.postMessage({ type: 'stop_action', action, stop_id })
            }
            return
        }
        const selectBtn = target.closest('[data-select-stop]')
        if (selectBtn) {
            const stopId = selectBtn.getAttribute('data-select-stop')
            if (stopId) {
                selectStop(stopId)
                const box = boxes().find(
                    (item) => item.getAttribute('data-stop-id') === stopId
                )
                if (box && typeof box.scrollIntoView === 'function') {
                    box.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                }
            }
            return
        }
        if (target.closest('.noise-fold')) return
        const box = target.closest('[data-stop-id][data-state]')
        if (box) {
            selectStop(box.getAttribute('data-stop-id'))
        }
    })

    document.addEventListener('toggle', (event) => {
        const fold = event.target instanceof Element ? event.target.closest('details[data-fold]') : null
        if (!fold) return
        const open = Array.from(document.querySelectorAll('details[data-fold]'))
            .filter((details) => details.open)
            .map((details) => details.getAttribute('data-fold'))
        saveState({ open_details: open })
    }, true)

    let scrollQueued = false
    window.addEventListener('scroll', () => {
        if (scrollQueued) return
        scrollQueued = true
        requestAnimationFrame(() => {
            scrollQueued = false
            saveState({ scroll_x: window.scrollX, scroll_y: window.scrollY })
        })
    })

    const saved = readState()
    if (Array.isArray(saved.open_details)) {
        for (const details of document.querySelectorAll('details[data-fold]')) {
            if (saved.open_details.includes(details.getAttribute('data-fold'))) {
                details.open = true
            }
        }
    }
    if (typeof saved.selected_stop_id === 'string') {
        selectStop(saved.selected_stop_id)
    }
    requestAnimationFrame(() => {
        layoutLines()
        if (typeof saved.scroll_x === 'number' && typeof saved.scroll_y === 'number') {
            window.scrollTo(saved.scroll_x, saved.scroll_y)
        }
    })
    const stage = document.querySelector('.canvas-stage')
    if (stage && typeof ResizeObserver === 'function') {
        new ResizeObserver(() => layoutLines()).observe(stage)
    }
    window.addEventListener('resize', layoutLines)
})()
`
