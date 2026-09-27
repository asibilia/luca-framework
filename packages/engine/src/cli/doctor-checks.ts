/**
 * The checks `luca doctor` runs, and how they print. Each check belongs to
 * a group (this computer, this repo, or old Luca v13's leftovers) and is OK,
 * a warning, or a problem. A warning or a problem carries the exact fix.
 * Only problems fail doctor.
 */

/** Which part of the setup a check looks at. */
export type CheckGroup = 'computer' | 'repo' | 'v13'

/** `ok`, or a `warning` (doesn't fail doctor), or a `problem` (does). */
export type CheckStatus = 'ok' | 'warning' | 'problem'

/** One check: what was found, and the fix when it isn't OK. */
export type DoctorCheck = {
    group: CheckGroup
    name: string
    status: CheckStatus
    /** One line: what is OK, or what is wrong. */
    detail: string
    /** The exact fix; `null` when the check is OK. */
    fix: string | null
}

/** A check's result, before its group and name are added. */
export type Found = Pick<DoctorCheck, 'status' | 'detail' | 'fix'>

export const ok = (detail: string): Found => ({
    status: 'ok',
    detail,
    fix: null,
})

export const warning = (detail: string, fix: string): Found => ({
    status: 'warning',
    detail,
    fix,
})

export const problem = (detail: string, fix: string): Found => ({
    status: 'problem',
    detail,
    fix,
})

/** Why something failed, in words. Pure. */
export const reason = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/**
 * Runs each check of a group in order; a check that throws becomes a
 * problem with its error, so the others still run.
 */
export const checksFor = async ({
    group,
    checks,
}: {
    group: CheckGroup
    checks: [name: string, run: () => Promise<Found>][]
}): Promise<DoctorCheck[]> => {
    const done: DoctorCheck[] = []
    for (const [name, run] of checks) {
        let found: Found
        try {
            found = await run()
        } catch (error) {
            found = problem(
                `The ${name} check failed: ${reason(error)}`,
                'Fix what the error says, then run luca doctor again.'
            )
        }
        done.push({ group, name, ...found })
    }
    return done
}

const GROUP_TITLES: Record<CheckGroup, string> = {
    computer: 'This computer:',
    repo: 'This repo:',
    v13: 'Old Luca v13 leftovers:',
}

const LABELS: Record<CheckStatus, string> = {
    ok: 'OK     ',
    warning: 'WARNING',
    problem: 'PROBLEM',
}

/**
 * The lines the checks print, a title per group: OK and the detail, or the
 * warning or problem and, under it, the fix. Pure.
 *
 * @example
 * formatChecks({ checks: [{ group: 'computer', name: 'bun', status: 'ok', detail: 'Bun 1.3.11', fix: null }] })
 * // ['This computer:', '  OK      Bun 1.3.11']
 */
export const formatChecks = ({
    checks,
}: {
    checks: DoctorCheck[]
}): string[] => {
    const lines: string[] = []
    let group: CheckGroup | null = null
    for (const check of checks) {
        if (check.group !== group) {
            group = check.group
            lines.push(GROUP_TITLES[group])
        }
        lines.push(`  ${LABELS[check.status]} ${check.detail}`)
        if (check.fix !== null) lines.push(`          Fix: ${check.fix}`)
    }
    return lines
}

/** Whether any check is a problem. Pure. */
export const hasProblem = ({ checks }: { checks: DoctorCheck[] }): boolean =>
    checks.some(({ status }) => status === 'problem')

/** A version's leading numbers: `'2.1.280 (Claude Code)'` → `[2, 1, 280]`. */
const numbersOf = (version: string): number[] | null => {
    const found = /(\d+(?:\.\d+)*)/.exec(version)?.[1]
    return found === undefined ? null : found.split('.').map(Number)
}

/**
 * The version in some text, such as a tool's `--version` output, or `null`
 * when it has none. Pure.
 *
 * @example
 * versionIn('2.1.280 (Claude Code)') // '2.1.280'
 */
export const versionIn = (text: string): string | null =>
    /(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)/.exec(text)?.[1] ?? null

/**
 * Whether `version` is `min` or newer, comparing each part as a number (so
 * 2.10.0 is newer than 2.1.280). A prerelease tag is ignored; text with no
 * version is never new enough. Pure.
 *
 * @example
 * versionAtLeast({ version: '0.10.0', min: '0.9.1' }) // true
 */
export const versionAtLeast = ({
    version,
    min,
}: {
    version: string
    min: string
}): boolean => {
    const have = numbersOf(version)
    const need = numbersOf(min)
    if (have === null || need === null) return false
    for (let i = 0; i < Math.max(have.length, need.length); i += 1) {
        const a = have[i] ?? 0
        const b = need[i] ?? 0
        if (a !== b) return a > b
    }
    return true
}
