/**
 * cleanup-fixes — apply a remediation action (delete / move / gitignore)
 * to a single file flagged by the shadow-scanner.
 *
 * Each helper is a thin filesystem wrapper that returns a status payload
 * matching the repo-cleanup tool's response shape.
 */
import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

export type FixResult =
    | {
          status: 'applied'
          action: string
          file_path: string
          target_path?: string
      }
    | { status: 'skipped'; message: string }
    | { error: string }

export function applyDelete(filePath: string): FixResult {
    const fullPath = join(process.cwd(), filePath)
    if (!existsSync(fullPath)) {
        return { status: 'skipped', message: `File not found: ${filePath}` }
    }
    unlinkSync(fullPath)
    return { status: 'applied', action: 'delete', file_path: filePath }
}

export function applyMove(filePath: string, targetPath?: string): FixResult {
    if (!targetPath) {
        return { error: 'target_path is required for move action' }
    }
    const fullPath = join(process.cwd(), filePath)
    if (!existsSync(fullPath)) {
        return { status: 'skipped', message: `File not found: ${filePath}` }
    }
    const fullTarget = join(process.cwd(), targetPath)
    mkdirSync(dirname(fullTarget), { recursive: true })
    renameSync(fullPath, fullTarget)
    return {
        status: 'applied',
        action: 'move',
        file_path: filePath,
        target_path: targetPath,
    }
}

export function applyGitignore(filePath: string): FixResult {
    const gitignorePath = join(process.cwd(), '.gitignore')
    const existing = existsSync(gitignorePath)
        ? readFileSync(gitignorePath, 'utf-8')
        : ''
    // Compare on whole, trimmed lines so `foo` doesn't match `foobar` and a
    // commented mention (`# ignore foo`) doesn't suppress a real entry.
    const alreadyPresent = existing.split('\n').some((line) => {
        const trimmed = line.trim()
        return (
            trimmed !== '' && !trimmed.startsWith('#') && trimmed === filePath
        )
    })
    if (alreadyPresent) {
        return {
            status: 'skipped',
            message: `Already in .gitignore: ${filePath}`,
        }
    }
    const newline = existing === '' || existing.endsWith('\n') ? '' : '\n'
    appendFileSync(gitignorePath, `${newline}${filePath}\n`)
    return { status: 'applied', action: 'gitignore', file_path: filePath }
}
