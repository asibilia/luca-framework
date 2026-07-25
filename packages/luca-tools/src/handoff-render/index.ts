/**
 * Public surface for handoff-envelope rendering helpers.
 *
 * Subpath export: `@alecsibilia/luca-tools/handoff-render`.
 *
 * Consumed by luca-cli's `luca handoff list` / `accept` triage views and by
 * luca-tools' own SessionStart inbox notice — the two places untrusted,
 * sender-authored envelope text is rendered for an agent or human to read.
 */
export {
    toSingleLine,
    capCodePoints,
    CONTROL_CHAR_RE,
} from './to-single-line.ts'
