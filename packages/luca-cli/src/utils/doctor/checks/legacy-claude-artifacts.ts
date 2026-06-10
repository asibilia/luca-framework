/**
 * Doctor check: orphaned pre-v13 luca artifacts in the *global* ~/.claude/.
 *
 * `luca init` only overwrites bundled artifacts of the same name, so files
 * that older luca versions installed and the current bundle no longer ships
 * persist forever — and keep leaking retired instructions into every Claude
 * session. The worst offenders found in the 2026-06-09 legacy audit:
 *
 *   - 9 v12 `luca-*.md` agents (superseded by the unprefixed v13 roster) —
 *     stale shadows that confuse agent selection.
 *   - 4 rules documenting retired v12 mechanics (the `luca-bridge` CLI,
 *     lu-* model routing, gate flags, the old harness). Rules load into
 *     EVERY session's system prompt; the `state-machine-bridge` rule's
 *     `suspend`/`resume-phase` docs are how sessions invent commands like
 *     `luca suspend` that the v13 CLI never had.
 *
 * Identification is by a curated name list — only files luca itself shipped
 * at some point are ever touched; user-authored files are never matched.
 * `fix()` MOVES the files to `~/.claude/.luca-legacy-backup/` rather than
 * deleting them, so the remediation is reversible by hand.
 */
import { existsSync, lstatSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { CheckResult, DoctorCheck, DoctorFixResult } from '../types'

const CHECK_NAME = 'Legacy global Claude artifacts'

/** Backup directory (inside ~/.claude/, dot-prefixed so it is never loaded). */
const BACKUP_DIR_NAME = '.luca-legacy-backup'

/**
 * v12 agent files superseded by the unprefixed v13 roster
 * (`luca-executor.md` → `executor.md`, etc.).
 */
const LEGACY_AGENT_FILES = [
    'luca-discussion.md',
    'luca-executor.md',
    'luca-learner.md',
    'luca-plan-reviewer.md',
    'luca-planner.md',
    'luca-researcher.md',
    'luca-reviewer.md',
    'luca-shadow-scanner.md',
    'luca-verifier.md',
] as const

/**
 * v12 rules documenting retired mechanics. None have a v13 equivalent:
 * the bridge CLI, the lu-* routing presets, orchestrator gate flags, and
 * the `src/harness/runner.ts` harness were all dropped in v13.
 */
const LEGACY_RULE_FILES = [
    'state-machine-bridge.md',
    'complexity-gating.md',
    'gate-enforcement.md',
    'harness-verification.md',
] as const

/** A legacy file found on disk, with its source subdirectory. */
interface LegacyItem {
    /** `agents` or `rules` — subdirectory under ~/.claude/. */
    subdir: 'agents' | 'rules'
    /** File name within the subdirectory. */
    name: string
    /** Absolute path. */
    path: string
}

/** Present as any directory entry, including a dangling symlink. */
function pathPresent(p: string): boolean {
    try {
        lstatSync(p)
        return true
    } catch {
        return false
    }
}

/** Scan ~/.claude/ for files on the curated legacy-name lists. */
function scanLegacy(claudeHome: string): LegacyItem[] {
    const items: LegacyItem[] = []
    for (const name of LEGACY_AGENT_FILES) {
        const path = join(claudeHome, 'agents', name)
        if (pathPresent(path)) items.push({ subdir: 'agents', name, path })
    }
    for (const name of LEGACY_RULE_FILES) {
        const path = join(claudeHome, 'rules', name)
        if (pathPresent(path)) items.push({ subdir: 'rules', name, path })
    }
    return items
}

/**
 * Doctor check: warn when orphaned pre-v13 luca artifacts linger in the
 * global ~/.claude/. Warning — not failure — since stale instructions
 * degrade sessions but don't break the environment. `luca doctor --fix`
 * moves them to `~/.claude/.luca-legacy-backup/`.
 */
export const legacyClaudeArtifactsCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'global',

    async run(): Promise<CheckResult> {
        const claudeHome = join(homedir(), '.claude')
        const items = scanLegacy(claudeHome)

        if (items.length === 0) {
            return {
                name: CHECK_NAME,
                status: 'pass',
                message: 'no orphaned pre-v13 luca artifacts in ~/.claude',
                fixCommand: null,
                details: null,
            }
        }

        const detailLines = [
            'Older luca versions installed these; the current bundle no',
            'longer ships them, so `luca init` never overwrites them and',
            'they keep leaking retired v12 instructions (e.g. the',
            '`luca-bridge` CLI) into every Claude session. `--fix` moves',
            `them to ~/.claude/${BACKUP_DIR_NAME}/ (reversible). Found:`,
            ...items.map((i) => `- ~/.claude/${i.subdir}/${i.name}`),
        ]

        return {
            name: CHECK_NAME,
            status: 'warning',
            message: `${items.length} orphaned pre-v13 luca artifact(s) in ~/.claude`,
            fixCommand: 'luca doctor --fix',
            details: detailLines.join('\n  '),
        }
    },

    async fix(): Promise<DoctorFixResult> {
        const claudeHome = join(homedir(), '.claude')
        const applied: string[] = []
        const errors: string[] = []
        const items = scanLegacy(claudeHome)

        for (const item of items) {
            const backupDir = join(claudeHome, BACKUP_DIR_NAME, item.subdir)
            // Suffix on collision so repeated fixes never clobber an
            // earlier backup of a same-named file.
            let dest = join(backupDir, item.name)
            let attempt = 1
            while (existsSync(dest)) {
                dest = join(backupDir, `${item.name}.${attempt}`)
                attempt += 1
            }
            try {
                await mkdir(backupDir, { recursive: true })
                await rename(item.path, dest)
                applied.push(
                    `moved ~/.claude/${item.subdir}/${item.name} → ~/.claude/${BACKUP_DIR_NAME}/${item.subdir}/`
                )
            } catch (err) {
                errors.push(
                    `could not move ~/.claude/${item.subdir}/${item.name}: ${(err as Error).message}`
                )
            }
        }

        return { applied, errors }
    },
}
