import { randomBytes } from 'node:crypto'

/**
 * The HTML every Luca Walk webview shows (#752, section 4): text from a
 * story or from GitHub is always escaped, and every page has a Content
 * Security Policy that runs only its own inline script, by nonce.
 */

const ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
}

/**
 * Text made safe to put in HTML.
 *
 * @example
 * escapeHtml({ text: '<b>' }) // '&lt;b&gt;'
 */
export const escapeHtml = ({ text }: { text: string }): string =>
    text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char)

/** A button that sends `{ type: 'button', id }` to the app. */
export const button = ({ id, label }: { id: string; label: string }) =>
    `<button data-id="${escapeHtml({ text: id })}">${escapeHtml({ text: label })}</button>`

/** A paragraph of text. */
export const paragraph = ({ text }: { text: string }) =>
    `<p>${escapeHtml({ text })}</p>`

/** A paragraph that starts with a bold label. */
export const labelled = ({ label, text }: { label: string; text: string }) =>
    `<p><strong>${escapeHtml({ text: label })}</strong> ${escapeHtml({ text })}</p>`

const SCRIPT = `
const vscode = acquireVsCodeApi()
document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    const pressed = target ? target.closest('[data-id]') : null
    if (pressed) {
        vscode.postMessage({ type: 'button', id: pressed.getAttribute('data-id') })
    }
})
`

/**
 * A whole page: `body` is HTML the caller already escaped.
 *
 * @example
 * page({ title: 'Summary of #12', body: paragraph({ text: 'Hello' }) })
 */
export const page = ({ title, body }: { title: string; body: string }) => {
    const nonce = randomBytes(16).toString('base64')
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8">',
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">`,
        `<title>${escapeHtml({ text: title })}</title>`,
        '</head>',
        '<body>',
        body,
        `<script nonce="${nonce}">${SCRIPT}</script>`,
        '</body>',
        '</html>',
    ].join('\n')
}
