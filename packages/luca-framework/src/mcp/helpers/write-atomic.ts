import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Write a file atomically: ensure parent dir, write to a .tmp sibling,
 * fsync-rename into place. Used by every luca_phase_write_* MCP tool so
 * partial writes can't leave .luca/ in an invalid state.
 */
export async function writeAtomicFile(
    absPath: string,
    content: string
): Promise<void> {
    await mkdir(dirname(absPath), { recursive: true })
    const tmp = `${absPath}.tmp`
    await writeFile(tmp, content)
    await rename(tmp, absPath)
}
