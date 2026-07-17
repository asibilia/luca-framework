/**
 * Apply bounded edits to a skill body. Edits whose `target` is not found (or is
 * empty where required) are skipped rather than applied blindly — the optimizer
 * only earns a change when its anchor actually matches the current document.
 */
import type { Edit } from './types.ts'

export type ApplyResult = {
    body: string
    applied: Edit[]
    skipped: Edit[]
}

/** Replace only the first occurrence of `needle` (no regex semantics). */
function replaceFirst(haystack: string, needle: string, repl: string): string {
    const idx = haystack.indexOf(needle)
    if (idx === -1) return haystack
    return haystack.slice(0, idx) + repl + haystack.slice(idx + needle.length)
}

export function applyEdits(body: string, edits: Edit[]): ApplyResult {
    let next = body
    const applied: Edit[] = []
    const skipped: Edit[] = []

    for (const edit of edits) {
        if (edit.op === 'append') {
            if (!edit.content.trim()) {
                skipped.push(edit)
                continue
            }
            next = `${next.trimEnd()}\n\n${edit.content.trim()}\n`
            applied.push(edit)
            continue
        }

        // The remaining ops all require an anchor that exists in the document.
        if (!edit.target || !next.includes(edit.target)) {
            skipped.push(edit)
            continue
        }

        if (edit.op === 'insert_after') {
            next = replaceFirst(
                next,
                edit.target,
                `${edit.target}\n${edit.content.trim()}`
            )
            applied.push(edit)
        } else if (edit.op === 'replace') {
            next = replaceFirst(next, edit.target, edit.content)
            applied.push(edit)
        } else {
            // delete
            next = replaceFirst(next, edit.target, '')
            applied.push(edit)
        }
    }

    return { body: next, applied, skipped }
}
