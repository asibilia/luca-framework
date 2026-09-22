/**
 * Doctor check: stray luca skills/commands/agents/hooks in a repo's .claude/.
 *
 * Through v12, `luca init` copied the bundled skill set into the project's
 * local `.claude/` directory. v13 installs them globally into `~/.claude/`
 * instead — a repo should hold only `.luca/` planning files. This check
 * finds the leftover per-repo copies; `luca doctor --fix` removes them.
 *
 * Stray artifacts are identified by name: a file under `.claude/commands/`,
 * `.claude/agents/`, or `.claude/skills/` whose name matches a bundled luca
 * artifact OR a `RETIRED_ARTIFACTS` entry, the legacy
 * `.claude/hooks/stage-gate.sh` wrapper, and the stage-gate registration
 * inside `.claude/settings.json`. User-authored files (and
 * `settings.local.json`, `plans/`, …) are never touched.
 *
 * Both name sources are needed. Retiring an artifact drops it from the
 * bundle, so matching the bundle alone would make a pre-v13 per-repo copy
 * of a now-retired skill/command invisible here the moment it is retired —
 * exactly when eviction matters most, since Claude Code still loads
 * repo-local skills and commands and would keep it invocable against
 * infrastructure that no longer exists. `luca init` already evicts retired
 * names from the *global* home (`pruneRetiredArtifacts`); this is the
 * per-repo half of the same uninstall.
 *
 * Disposition differs by source, and deliberately so:
 *   - a **bundled** name is a copy of something luca still ships, so
 *     removing it is loss-free (re-running `luca init` restores it
 *     globally) — it is deleted;
 *   - a **retired** name is something luca no longer ships anywhere, so a
 *     delete would be irreversible, and the odds that the file is in fact
 *     user-authored are higher precisely because luca stopped shipping it.
 *     It is *moved* into `.claude/.luca-retired-backup/<bucket>/` by
 *     `pruneRetiredArtifacts` — the same reversible remediation the global
 *     prune uses.
 *
 * Retired-name matching is gated on the bundle being enumerable, mirroring
 * `pruneRetiredArtifacts`: an unknown bundle can't prove a retired entry is
 * actually gone, so it authorizes nothing.
 */
import { existsSync, lstatSync } from 'node:fs'
import { readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
    RETIRED_ARTIFACTS,
    listBundledArtifacts,
    pruneRetiredArtifacts,
} from '../../../init'
import type { BundledArtifacts, RetiredArtifactKind } from '../../../init'
import type { CheckResult, DoctorCheck, DoctorFixResult } from '../types'

const CHECK_NAME = 'Stray local install'

/**
 * Quarantine directory `pruneRetiredArtifacts` moves retired artifacts
 * into, relative to the home it is given (here: `<repo>/.claude`). Display
 * only — the mkdir/rename is owned by `pruneRetiredArtifacts`.
 */
const RETIRED_BACKUP_DIR_NAME = '.luca-retired-backup'

/**
 * Retired-artifact kind → the `.claude/` bucket it lives in. Mirrors
 * `KIND_BUCKET` in `init/helpers/install-skills.ts`; typed as an
 * exhaustive `Record` over `RetiredArtifactKind` so a new kind fails to
 * compile here rather than silently going unscanned.
 */
const RETIRED_KIND_BUCKET: Record<
    RetiredArtifactKind,
    keyof BundledArtifacts
> = {
    command: 'commands',
    agent: 'agents',
    skill: 'skills',
}

/** The three `.claude/` buckets and the entry shape each one holds. */
const BUCKET_SHAPES: readonly {
    bucket: keyof BundledArtifacts
    entry: 'file' | 'dir'
}[] = [
    { bucket: 'commands', entry: 'file' },
    { bucket: 'agents', entry: 'file' },
    { bucket: 'skills', entry: 'dir' },
]

/** What `fix()` does with a stray item. */
type StrayDisposition =
    /** Still bundled — deleting is loss-free, `luca init` restores it. */
    | 'remove'
    /** Retired — moved to `.luca-retired-backup/`, never deleted. */
    | 'quarantine'

/** A stray file or directory to be removed or quarantined by `fix()`. */
interface StrayItem {
    /** Absolute path to remove. */
    path: string
    /** Display label relative to the repo root. */
    label: string
    /** Whether the path is a directory (removed recursively). */
    kind: 'file' | 'dir'
    /** Whether `fix()` deletes it or quarantines it. */
    disposition: StrayDisposition
}

/** Outcome of scanning a repo's `.claude/` for stray luca artifacts. */
interface StrayScan {
    /** Files and directories that should be removed or quarantined. */
    items: StrayItem[]
    /** True when `.claude/settings.json` carries a stage-gate hook entry. */
    settingsStageGate: boolean
    /**
     * The bundle the scan matched against, `null` when it could not be
     * enumerated. Carried out so `fix()` hands the *same* bundle to
     * `pruneRetiredArtifacts` that `run()` reported against.
     */
    bundled: BundledArtifacts | null
}

/**
 * True when a path exists as any directory entry — including a dangling
 * symlink. `existsSync` follows the link and so reports a broken symlink as
 * absent; `lstatSync` does not follow, so a stray (possibly broken) symlink
 * is still detected and can be removed by `fix()`.
 */
function pathPresent(p: string): boolean {
    try {
        lstatSync(p)
        return true
    } catch {
        return false
    }
}

/** Read + parse a JSON object file; null on missing/unreadable/malformed. */
async function readJsonObject(
    path: string
): Promise<Record<string, unknown> | null> {
    try {
        const file = Bun.file(path)
        if (!(await file.exists())) return null
        const parsed = JSON.parse(await file.text()) as unknown
        return parsed !== null && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : null
    } catch {
        return null
    }
}

/** True when a PreToolUse entry registers the luca stage-gate hook. */
function isStageGateEntry(entry: unknown): boolean {
    if (entry === null || typeof entry !== 'object') return false
    const { hooks } = entry as { hooks?: unknown }
    if (!Array.isArray(hooks)) return false
    return hooks.some((h) => {
        const command = (h as { command?: unknown })?.command
        return typeof command === 'string' && command.includes('stage-gate')
    })
}

/**
 * Scan `<cwd>/.claude/` for luca artifacts wrongly installed per-repo.
 *
 * `bundled` is injectable so callers (and tests) can scan against a known
 * bundle; omitted, it is enumerated from the installed package. Passing
 * `null` explicitly means "bundle unknown", which matches nothing by name.
 */
export async function scanStray(
    cwd: string,
    bundledOverride?: BundledArtifacts | null
): Promise<StrayScan> {
    const claudeDir = join(cwd, '.claude')
    const items: StrayItem[] = []
    if (!existsSync(claudeDir)) {
        return { items, settingsStageGate: false, bundled: null }
    }

    // Match against the bundled artifact set plus the curated retired
    // set — only names luca ships or used to ship are treated as stray,
    // so user-authored files are left alone.
    const bundled =
        bundledOverride === undefined
            ? await listBundledArtifacts()
            : bundledOverride
    if (bundled) {
        for (const { bucket, entry } of BUCKET_SHAPES) {
            const candidates: { name: string; disposition: StrayDisposition }[] =
                [
                    ...bundled[bucket].map((name) => ({
                        name,
                        disposition: 'remove' as const,
                    })),
                    ...RETIRED_ARTIFACTS.filter(
                        (r) =>
                            RETIRED_KIND_BUCKET[r.kind] === bucket &&
                            // The live bundle always wins over the retired
                            // list, exactly as in `pruneRetiredArtifacts`:
                            // a stale entry naming a still-shipped artifact
                            // must not upgrade a delete into a quarantine.
                            !bundled[bucket].includes(r.name)
                    ).map((r) => ({
                        name: r.name,
                        disposition: 'quarantine' as const,
                    })),
                ]

            for (const { name, disposition } of candidates) {
                const path = join(claudeDir, bucket, name)
                if (!pathPresent(path)) continue
                items.push({
                    path,
                    label:
                        entry === 'dir'
                            ? `.claude/${bucket}/${name}/`
                            : `.claude/${bucket}/${name}`,
                    kind: entry,
                    disposition,
                })
            }
        }
    }

    // Legacy stage-gate hook wrapper (pre-v13 `luca init` wrote this).
    const hookScript = join(claudeDir, 'hooks', 'stage-gate.sh')
    if (pathPresent(hookScript)) {
        items.push({
            path: hookScript,
            label: '.claude/hooks/stage-gate.sh',
            kind: 'file',
            // Regenerated by `luca init`, so deleting loses nothing.
            disposition: 'remove',
        })
    }

    // Stage-gate registration inside settings.json — handled by entry
    // surgery (see stripStageGate) rather than removing the whole file.
    const settings = await readJsonObject(join(claudeDir, 'settings.json'))
    const hooks = settings?.hooks
    const preToolUse =
        hooks !== null && typeof hooks === 'object'
            ? (hooks as { PreToolUse?: unknown }).PreToolUse
            : undefined
    const settingsStageGate =
        Array.isArray(preToolUse) && preToolUse.some(isStageGateEntry)

    return { items, settingsStageGate, bundled }
}

/**
 * Remove the stage-gate registration from `.claude/settings.json` while
 * preserving every other key. Deletes the file outright only if it becomes
 * an empty object.
 */
async function stripStageGate(settingsPath: string): Promise<void> {
    const settings = await readJsonObject(settingsPath)
    if (!settings) return

    const hooks = settings.hooks
    if (hooks !== null && typeof hooks === 'object') {
        const hooksObj = hooks as Record<string, unknown>
        const preToolUse = hooksObj.PreToolUse
        if (Array.isArray(preToolUse)) {
            const kept = preToolUse.filter((e) => !isStageGateEntry(e))
            if (kept.length > 0) {
                hooksObj.PreToolUse = kept
            } else {
                delete hooksObj.PreToolUse
            }
        }
        if (Object.keys(hooksObj).length === 0) {
            delete settings.hooks
        }
    }

    if (Object.keys(settings).length === 0) {
        await rm(settingsPath, { force: true })
        return
    }
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n')
}

/** Remove now-empty luca subdirectories, and `.claude/` itself if empty. */
async function pruneEmptyDirs(
    claudeDir: string,
    applied: string[]
): Promise<void> {
    for (const sub of ['commands', 'agents', 'skills', 'hooks']) {
        const dir = join(claudeDir, sub)
        if (existsSync(dir) && (await readdir(dir)).length === 0) {
            await rmdir(dir)
            applied.push(`removed empty .claude/${sub}/`)
        }
    }
    if (existsSync(claudeDir) && (await readdir(claudeDir)).length === 0) {
        await rmdir(claudeDir)
        applied.push('removed empty .claude/')
    }
}

/**
 * Doctor check: verify the repo's `.claude/` holds no stray luca artifacts.
 *
 * Reports a warning — not a failure — since leftover per-repo copies are
 * cleanup debris, not a broken environment. `luca doctor --fix` removes
 * them.
 */
export const strayLocalInstallCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'project',

    async run(): Promise<CheckResult> {
        const { items, settingsStageGate } = await scanStray(process.cwd())
        const count = items.length + (settingsStageGate ? 1 : 0)

        if (count === 0) {
            return {
                name: CHECK_NAME,
                status: 'pass',
                message: 'no stray luca artifacts in ./.claude',
                fixCommand: null,
                details: null,
            }
        }

        const detailLines = [
            'Through v12, `luca init` copied the luca skill set into this',
            'repo. v13 installs it globally into ~/.claude/ — a repo should',
            'hold only .luca/ planning files. Stray artifacts found:',
            ...items.map(
                (item) =>
                    `- ${item.label}${
                        item.disposition === 'quarantine'
                            ? ' (retired — moved to .claude/' +
                              `${RETIRED_BACKUP_DIR_NAME}/, not deleted)`
                            : ''
                    }`
            ),
        ]
        if (settingsStageGate) {
            detailLines.push('- .claude/settings.json (stage-gate hook entry)')
        }

        return {
            name: CHECK_NAME,
            status: 'warning',
            message: `${count} stray luca artifact(s) installed locally in ./.claude`,
            fixCommand: 'luca doctor --fix',
            details: detailLines.join('\n  '),
        }
    },

    async fix(): Promise<DoctorFixResult> {
        const cwd = process.cwd()
        const applied: string[] = []
        const errors: string[] = []
        const { items, settingsStageGate, bundled } = await scanStray(cwd)

        for (const item of items) {
            if (item.disposition !== 'remove') continue
            try {
                await rm(item.path, {
                    recursive: item.kind === 'dir',
                    force: true,
                })
                applied.push(`removed ${item.label}`)
            } catch (err) {
                errors.push(
                    `could not remove ${item.label}: ${(err as Error).message}`
                )
            }
        }

        // Retired names are evicted by the same reversible move the global
        // prune uses, with `<repo>/.claude` standing in for the harness
        // home — the bucket layout is identical. Passing the scanned
        // bundle keeps `fix()` matching exactly what `run()` reported, and
        // a `null` bundle (unenumerable) evicts nothing. Never throws.
        const quarantined = await pruneRetiredArtifacts({
            home: join(cwd, '.claude'),
            bundled,
            log: (msg) => {
                if (msg.startsWith('  warn:')) errors.push(msg.trim())
            },
        })
        for (const relPath of quarantined) {
            applied.push(
                `moved .claude/${relPath} → .claude/${RETIRED_BACKUP_DIR_NAME}/${relPath} (retired artifact, not deleted)`
            )
        }

        if (settingsStageGate) {
            try {
                await stripStageGate(join(cwd, '.claude', 'settings.json'))
                applied.push(
                    'removed stage-gate hook entry from .claude/settings.json'
                )
            } catch (err) {
                errors.push(
                    `could not update .claude/settings.json: ${(err as Error).message}`
                )
            }
        }

        try {
            await pruneEmptyDirs(join(cwd, '.claude'), applied)
        } catch (err) {
            errors.push(
                `could not prune empty .claude/ directories: ${(err as Error).message}`
            )
        }

        return { applied, errors }
    },
}
