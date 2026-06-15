import { isAbsolute, relative } from 'node:path'

import {
    PHASE_SLUG_RE,
    REVIEWER_NAME_RE,
    TMP_FILE_RE,
    TMP_PREVIEW_FILE_RE,
} from '../constants.ts'

export type WritePathClass =
    | 'code'
    | 'planning-general'
    | 'planning-audit'
    // Inert ephemeral scratch — an OS-temp-dir file or a sanctioned in-repo
    // preview (`.luca/tmp/previews/<name>`). Touches neither the repo nor
    // pipeline state, so the stage-gate allows it in ANY pipelineStep
    // (the matrix is bypassed for this class — see the hook).
    | 'ephemeral'
    | 'denied'

export interface ClassifyResult {
    class: WritePathClass
    /** Human-readable reason when class === 'denied'. */
    reason?: string
}

export interface ClassifyOptions {
    /** User home directory, for detecting absolute paths under ~/.claude/ or ~/.luca/. */
    homedir?: string
    /**
     * Project root. When provided, an absolute `path` under it is normalized
     * to its repo-relative form before the `.luca/` contract check — Claude
     * Code passes ABSOLUTE `file_path`s (e.g. `/repo/.luca/phases/…`), but the
     * `.luca/` contract (and `phasePathFor`) are repo-relative. Without this,
     * a legal artifact write classifies as `code` and the matrix wrongly
     * blocks it. The always-denied checks still run on the original path.
     */
    cwd?: string
    /**
     * Absolute OS-temp-dir prefixes to treat as ephemeral scratch (in
     * addition to the universal `/tmp` and `/private/tmp`). Callers pass
     * `os.tmpdir()` / `$TMPDIR` so platform-specific temp roots are covered
     * — notably macOS's per-user `/var/folders/…/T`, which would otherwise be
     * hard-denied by the `/var` system-dir rule. A write under any of these
     * (that is not a legacy `/tmp/luca-*` payload) classifies as `ephemeral`.
     */
    tmpdirs?: string[]
}

// Patterns matched against the leading directory segments of a path.
const SYSTEM_DIR_PATTERN = /^\/(etc|usr|var|System|bin|sbin)(\/|$)/
const GIT_DIR_PATTERN = /(^|\/)\.git(\/|$)/
const HOME_DENIED_SUBDIRS = ['.claude', '.luca']

// Legacy shared-tmp handoff payloads: `/tmp/luca-*` (e.g.
// `/tmp/luca-checks-07.json`) was the pre-v13 staging convention for
// LLM→CLI `--file` payloads. The OS tmp dir is GLOBAL, so two repos
// running pipelines concurrently overwrite each other's payloads. The
// canonical replacement is repo-scoped `.luca/tmp/<kebab-name>.json`
// (TMP_PATH_PATTERN below); writes to the legacy location are denied
// outright so a model reverting to old habits gets redirected instead
// of silently corrupting another project's run. `/private/tmp` is
// macOS's physical location for `/tmp` (a symlink), so both spellings
// are covered.
const SHARED_TMP_LUCA_PATTERN = /^\/(private\/)?tmp\/luca-/

// Universal POSIX temp roots, always treated as ephemeral scratch (`/tmp`
// is a symlink to `/private/tmp` on macOS, so both spellings are covered).
// Platform-specific roots (macOS `/var/folders/…/T`, a custom `$TMPDIR`)
// arrive via ClassifyOptions.tmpdirs.
const BUILTIN_TMP_PREFIXES = ['/tmp/', '/private/tmp/']

/**
 * Is `path` a write into a genuine OS temp directory? Such writes are inert
 * scratch (browser previews, screenshots, generated HTML) — they touch
 * neither the repo tree nor `.luca/` pipeline state — so they are allowed in
 * any pipelineStep. The caller-supplied `tmpdirs` extend the universal
 * `/tmp` roots with the platform temp dir (`os.tmpdir()` / `$TMPDIR`).
 *
 * The legacy `/tmp/luca-*` collision denial is checked BEFORE this in
 * `classifyWritePath`, so a luca-namespaced handoff payload stays denied
 * even though it lives under `/tmp`.
 */
function isEphemeralOsTemp(path: string, tmpdirs: readonly string[]): boolean {
    const p = path.replace(/\\/g, '/')
    if (!p.startsWith('/')) return false
    const prefixes = [...BUILTIN_TMP_PREFIXES]
    for (const dir of tmpdirs) {
        if (!dir) continue
        const norm = dir.replace(/\\/g, '/').replace(/\/+$/, '')
        if (norm.startsWith('/')) prefixes.push(`${norm}/`)
    }
    return prefixes.some((prefix) => p.startsWith(prefix))
}

// Audit file pattern: .luca/phases/<NN-slug>/audits/<reviewer>.md
//
// Built from the canonical PHASE_SLUG_RE + REVIEWER_NAME_RE (anchors
// stripped) so this pattern can never drift looser than the .luca/
// contract — e.g. it rejects trailing dashes that a hand-written
// `[a-z0-9-]*` would have allowed.
const reAnchorless = (re: RegExp): string =>
    re.source.replace(/^\^/, '').replace(/\$$/, '')

/**
 * Canonical audit-file path pattern: `.luca/phases/<NN-slug>/audits/<reviewer>.md`.
 *
 * Exported so the v13 stage-gate hook's artifact-path gate can recognise
 * the variable audit-file path for the `review` step (audit filenames are
 * per-reviewer, so they have no single fixed canonical path).
 */
export const AUDIT_PATH_PATTERN = new RegExp(
    `^\\.luca/phases/${reAnchorless(PHASE_SLUG_RE)}/audits/${reAnchorless(
        REVIEWER_NAME_RE
    )}\\.md$`
)

/**
 * Canonical scratch-handoff path pattern: `.luca/tmp/<kebab-name>.json`.
 *
 * Exported so the v13 stage-gate hook can recognise an ephemeral
 * CLI-handoff payload and allow it in ANY pipelineStep — these
 * repo-scoped files (LLM orchestrator → `luca` CLI via `--file`) are not
 * pipeline artifacts and replace the old shared global `/tmp/luca-*.json`
 * paths that collided across repos.
 */
export const TMP_PATH_PATTERN = new RegExp(
    `^\\.luca/tmp/${reAnchorless(TMP_FILE_RE)}$`
)

/**
 * Resolve a write-target path to its `.luca/`-contract-relative form,
 * robust to the hook's `cwd` NOT being the repo root.
 *
 * Claude Code passes ABSOLUTE `file_path`s; the `.luca/` contract (and
 * `phasePathFor` / `AUDIT_PATH_PATTERN`) are repo-relative. The naive
 * `relative(cwd, path)` only works when `cwd` IS the repo root — when a
 * subagent/harness invokes the hook with `cwd` set to a subdirectory,
 * `relative()` yields `../../.luca/phases/…`, which fails the `.luca/`
 * prefix check, mis-classifies a legal artifact write as `code`, and the
 * matrix wrongly blocks it (the REVIEWING/PLANNING block in the v13 run
 * report). To be cwd-independent we fall back to locating the `.luca/`
 * path segment directly.
 *
 * Returns the path unchanged when it is not under any `.luca/` directory.
 *
 * Cross-platform: the `.luca/` prefix checks and fallback regex are POSIX
 * (`/`). On Windows, Claude Code passes `C:\…\.luca\…` and `relative()`
 * returns `..\.luca\…`, neither of which would match — so both the input and
 * the `relative()` result are normalized to forward slashes first. (Backslash
 * is vanishingly rare in POSIX paths, so this normalization is safe there.)
 */
export function toLucaRelative(path: string, cwd?: string): string {
    const p = path.replace(/\\/g, '/')
    // Preferred: cwd-relative normalization, used only when it actually
    // lands inside `.luca/` (i.e. cwd really is the repo root).
    if (cwd && isAbsolute(path)) {
        const r = relative(cwd, path).replace(/\\/g, '/')
        if (r === '.luca' || r.startsWith('.luca/')) return r
    } else if (p === '.luca' || p.startsWith('.luca/')) {
        return p
    }
    // Fallback: recover the contract-relative portion by locating the
    // `.luca/` path segment (segment-anchored so `src/foo.luca/…` can't
    // match). Handles absolute paths from any cwd and `../../.luca/…` forms.
    const seg = p.match(/(?:^|\/)(\.luca\/.*)$/)
    if (seg) return seg[1]!
    if (/(?:^|\/)\.luca$/.test(p)) return '.luca'
    return p
}

/**
 * Classify a write-target path into one of four classes used by the
 * stage-gate matrix.
 *
 *   - 'code': normal project file (src/, packages/, package.json, …)
 *   - 'planning-general': .luca/ artifact other than an audit file
 *   - 'planning-audit': .luca/phases/<slug>/audits/<reviewer>.md
 *   - 'ephemeral': inert OS-temp scratch or `.luca/tmp/previews/<name>`
 *                  (browser previews, screenshots) — allowed in any phase
 *   - 'denied': must never be written regardless of phase
 *               (.git/, ~/.claude/, ~/.luca/, /etc/, /usr/, /var/, /System/,
 *               /bin/, /sbin/, and legacy shared-tmp /tmp/luca-* payloads)
 *
 * Pass `homedir` to detect absolute paths under the user home that
 * resolve to denied subdirectories. Pass `tmpdirs` (`os.tmpdir()`/`$TMPDIR`)
 * so the platform temp root is recognised as ephemeral.
 */
export function classifyWritePath(
    path: string,
    opts: ClassifyOptions = {}
): ClassifyResult {
    // 1. Always-denied: .git/ anywhere in the path
    if (GIT_DIR_PATTERN.test(path)) {
        return {
            class: 'denied',
            reason: 'writes under .git/ are never allowed',
        }
    }

    // 2. Always-denied: legacy shared-tmp luca handoff payloads. Checked
    //    BEFORE the ephemeral OS-temp allow (step 3) so a luca-namespaced
    //    payload under /tmp stays denied — it must be repo-scoped to avoid
    //    cross-repo collisions.
    if (SHARED_TMP_LUCA_PATTERN.test(path)) {
        return {
            class: 'denied',
            reason:
                'luca CLI handoff payloads must be repo-scoped — write to .luca/tmp/<kebab-name>.json instead ' +
                '(shared /tmp/luca-* files collide across concurrently-running repos)',
        }
    }

    // 3. Ephemeral OS-temp scratch. Runs BEFORE the system-dir denial (step
    //    4) because macOS's per-user temp root lives under /var/folders,
    //    which the /var rule would otherwise hard-deny. Inert scratch —
    //    allowed in any pipelineStep.
    if (isEphemeralOsTemp(path, opts.tmpdirs ?? [])) {
        return { class: 'ephemeral' }
    }

    // 4. Always-denied: system dirs
    if (SYSTEM_DIR_PATTERN.test(path)) {
        return {
            class: 'denied',
            reason: 'writes under system directories (/etc, /usr, /var, /System, /bin, /sbin) are never allowed',
        }
    }

    // 5. Always-denied: user-home tooling dirs
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

    // 6. .luca/ artifacts. Normalize to the contract-relative form first —
    //    the contract (and AUDIT_PATH_PATTERN) is relative, but callers pass
    //    absolute file paths. `toLucaRelative` is robust to `cwd` not being
    //    the repo root (see its docstring).
    const rel = toLucaRelative(path, opts.cwd)
    if (rel.startsWith('.luca/') || rel === '.luca') {
        // Sanctioned in-repo preview scratch: `.luca/tmp/previews/<name>`.
        // Ephemeral, gitignored browser previews — not a pipeline artifact,
        // so allowed in any pipelineStep (intercepted before the generic
        // planning-general fallthrough below).
        const preview = rel.match(/^\.luca\/tmp\/previews\/([^/]+)$/)
        if (preview && TMP_PREVIEW_FILE_RE.test(preview[1]!)) {
            return { class: 'ephemeral' }
        }
        if (AUDIT_PATH_PATTERN.test(rel)) {
            return { class: 'planning-audit' }
        }
        return { class: 'planning-general' }
    }

    // 7. Default: code
    return { class: 'code' }
}
