/**
 * Inline page script for the flow Map panel (#776, section 4). Runs under
 * the same nonce after `webview-html.ts`'s shared script and reuses its
 * `vscode` handle without calling `acquireVsCodeApi()` again.
 */

export const MAP_SCRIPT = `
(() => {
    const boxes = () => Array.from(document.querySelectorAll('[data-stop-id][data-state]'))
    const panels = () => Array.from(document.querySelectorAll('[data-panel-for]'))
    const edges = () => Array.from(document.querySelectorAll('.link-edge[data-stop-ids]'))

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
        if (typeof vscode.setState === 'function') {
            vscode.setState({ selected_stop_id: stopId })
        }
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

    const saved = typeof vscode.getState === 'function' ? vscode.getState() : null
    if (saved && typeof saved.selected_stop_id === 'string') {
        selectStop(saved.selected_stop_id)
    }
    requestAnimationFrame(layoutLines)
    window.addEventListener('resize', layoutLines)
})()
`
