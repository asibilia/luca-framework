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
 * artifact, the legacy `.claude/hooks/stage-gate.sh` wrapper, and the
 * stage-gate registration inside `.claude/settings.json`. User-authored
 * files (and `settings.local.json`, `plans/`, …) are never touched.
 */
import { existsSync, lstatSync } from 'node:fs'
import { readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { listBundledArtifacts } from '../../../init'

import type { CheckResult, DoctorCheck, DoctorFixResult } from '../types'

const CHECK_NAME = 'Stray local install'

/** A stray file or directory to be removed by `fix()`. */
interface StrayItem {
    /** Absolute path to remove. */
    path: string
    /** Display label relative to the repo root. */
    label: string
    /** Whether the path is a directory (removed recursively). */
    kind: 'file' | 'dir'
}

/** Outcome of scanning a repo's `.claude/` for stray luca artifacts. */
interface StrayScan {
    /** Files and directories that should be removed outright. */
    items: StrayItem[]
    /** True when `.claude/settings.json` carries a stage-gate hook entry. */
    settingsStageGate: boolean
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

/** Scan `<cwd>/.claude/` for luca artifacts wrongly installed per-repo. */
async function scanStray(cwd: string): Promise<StrayScan> {
    const claudeDir = join(cwd, '.claude')
    const items: StrayItem[] = []
    if (!existsSync(claudeDir)) {
        return { items, settingsStageGate: false }
    }

    // Match against the bundled artifact set — only files luca actually
    // ships are treated as stray, so user-authored files are left alone.
    const bundled = await listBundledArtifacts()
    if (bundled) {
        for (const name of bundled.commands) {
            const path = join(claudeDir, 'commands', name)
            if (pathPresent(path)) {
                items.push({
                    path,
                    label: `.claude/commands/${name}`,
                    kind: 'file',
                })
            }
        }
        for (const name of bundled.agents) {
            const path = join(claudeDir, 'agents', name)
            if (pathPresent(path)) {
                items.push({
                    path,
                    label: `.claude/agents/${name}`,
                    kind: 'file',
                })
            }
        }
        for (const name of bundled.skills) {
            const path = join(claudeDir, 'skills', name)
            if (pathPresent(path)) {
                items.push({
                    path,
                    label: `.claude/skills/${name}/`,
                    kind: 'dir',
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

    return { items, settingsStageGate }
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
            ...items.map((item) => `- ${item.label}`),
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
        const { items, settingsStageGate } = await scanStray(cwd)

        for (const item of items) {
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
