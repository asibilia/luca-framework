export type WritePathClass =
    | 'code'
    | 'planning-general'
    | 'planning-audit'
    | 'denied'

export interface ClassifyResult {
    class: WritePathClass
    /** Human-readable reason when class === 'denied'. */
    reason?: string
}

export interface ClassifyOptions {
    /** User home directory, for detecting absolute paths under ~/.claude/ or ~/.luca/. */
    homedir?: string
}

// Patterns matched against the leading directory segments of a path.
const SYSTEM_DIR_PATTERN = /^\/(etc|usr|var|System|bin|sbin)(\/|$)/
const GIT_DIR_PATTERN = /(^|\/)\.git(\/|$)/
const HOME_DENIED_SUBDIRS = ['.claude', '.luca']

// Audit file pattern: .luca/phases/<NN-slug>/audits/<reviewer>.md
const AUDIT_PATH_PATTERN =
    /^\.luca\/phases\/[0-9]{2}-[a-z][a-z0-9-]*\/audits\/[a-z][a-z0-9-]*\.md$/

/**
 * Classify a write-target path into one of four classes used by the
 * stage-gate matrix.
 *
 *   - 'code': normal project file (src/, packages/, package.json, …)
 *   - 'planning-general': .luca/ artifact other than an audit file
 *   - 'planning-audit': .luca/phases/<slug>/audits/<reviewer>.md
 *   - 'denied': must never be written regardless of phase
 *               (.git/, ~/.claude/, ~/.luca/, /etc/, /usr/, /var/, /System/, /bin/, /sbin/)
 *
 * Pass `homedir` to detect absolute paths under the user home that
 * resolve to denied subdirectories.
 */
export function classifyWritePath(
    path: string,
    opts: ClassifyOptions = {},
): ClassifyResult {
    // 1. Always-denied: .git/ anywhere in the path
    if (GIT_DIR_PATTERN.test(path)) {
        return { class: 'denied', reason: 'writes under .git/ are never allowed' }
    }

    // 2. Always-denied: system dirs
    if (SYSTEM_DIR_PATTERN.test(path)) {
        return {
            class: 'denied',
            reason: 'writes under system directories (/etc, /usr, /var, /System, /bin, /sbin) are never allowed',
        }
    }

    // 3. Always-denied: user-home tooling dirs
    for (const subdir of HOME_DENIED_SUBDIRS) {
        if (path.startsWith(`~/${subdir}/`) || path === `~/${subdir}`) {
            return {
                class: 'denied',
                reason: `writes under ~/${subdir}/ are never allowed`,
            }
        }
        if (opts.homedir) {
            const abs = `${opts.homedir.replace(/\/$/, '')}/${subdir}`
            if (path.startsWith(`${abs}/`) || path === abs) {
                return {
                    class: 'denied',
                    reason: `writes under ${abs}/ (user tooling dir) are never allowed`,
                }
            }
        }
    }

    // 4. .luca/ artifacts
    if (path.startsWith('.luca/') || path === '.luca') {
        if (AUDIT_PATH_PATTERN.test(path)) {
            return { class: 'planning-audit' }
        }
        return { class: 'planning-general' }
    }

    // 5. Default: code
    return { class: 'code' }
}
